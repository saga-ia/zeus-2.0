#!/bin/bash
# Provisiona subdominio <slug>.jefersonhenrike.com:
#   1) cria DNS A record na Cloudflare apontando pro IP do servidor (proxied=false)
#   2) cria proxy host no NPM apontando pra 172.17.0.1:3020 (jeff-alpha-clientes)
#   3) emite cert Let's Encrypt e atribui ao host
# Uso: provision-subdomain.sh <slug>
set -eu

SLUG="${1:?usage: provision-subdomain.sh <slug>}"
DOMAIN="jefersonhenrike.com"
HOST="${SLUG}.${DOMAIN}"
IP="80.241.214.10"
TARGET_HOST="172.17.0.1"
TARGET_PORT="3020"

DB="/opt/jeff-worker/data/worker.db"
CF_TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_cloudflare_api_token';")
NPM_TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_token';")
NPM_EMAIL=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_email';")
NPM_PASS=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_password';")
NPM_URL=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_url';")
CF_ZONE="79312419b3dbc8d1b3916b153e030043"
NPM_URL="${NPM_URL:-http://127.0.0.1:81}"

[ -z "$CF_TOKEN" ] && { echo "ERRO: cloudflare token vazio"; exit 1; }
[ -z "$NPM_EMAIL" ] && { echo "ERRO: npm email vazio"; exit 1; }

echo "[1/4] DNS Cloudflare A ${HOST} -> ${IP}"
EXIST=$(curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records?name=${HOST}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'][0]['id'] if d.get('result') else '')")
if [ -n "$EXIST" ]; then
  echo "  DNS ja existe (id=${EXIST}), pulando"
else
  RESP=$(curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records" \
    -d "{\"type\":\"A\",\"name\":\"${SLUG}\",\"content\":\"${IP}\",\"ttl\":300,\"proxied\":false}")
  OK=$(echo "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('1' if d.get('success') else '0')")
  if [ "$OK" != "1" ]; then echo "  ERRO CF: $RESP"; exit 2; fi
  echo "  ok"
fi

# autenticar NPM (refresh token, vida curta)
echo "[2/4] auth NPM"
NEW_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  "${NPM_URL}/api/tokens" \
  -d "{\"identity\":\"${NPM_EMAIL}\",\"secret\":\"${NPM_PASS}\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token',''))")
[ -z "$NEW_TOKEN" ] && { echo "  ERRO: nao consegui autenticar no NPM"; exit 3; }
sqlite3 "$DB" "UPDATE app_settings SET value='${NEW_TOKEN}', updated_at=datetime('now') WHERE key='jeff_npm_token';" 2>/dev/null || true
echo "  ok"

echo "[3/4] proxy host NPM ${HOST} -> ${TARGET_HOST}:${TARGET_PORT}"
EXISTING_HOST_ID=$(curl -s -H "Authorization: Bearer ${NEW_TOKEN}" \
  "${NPM_URL}/api/nginx/proxy-hosts" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);
hosts=d if isinstance(d,list) else []
for h in hosts:
  if '${HOST}' in (h.get('domain_names') or []):
    print(h['id']); break
")
if [ -n "$EXISTING_HOST_ID" ]; then
  echo "  host ja existe (id=${EXISTING_HOST_ID}), pulando criacao"
  HOST_ID="$EXISTING_HOST_ID"
else
  HOST_RESP=$(curl -s -X POST -H "Authorization: Bearer ${NEW_TOKEN}" -H "Content-Type: application/json" \
    "${NPM_URL}/api/nginx/proxy-hosts" \
    -d "{
      \"domain_names\":[\"${HOST}\"],
      \"forward_scheme\":\"http\",
      \"forward_host\":\"${TARGET_HOST}\",
      \"forward_port\":${TARGET_PORT},
      \"caching_enabled\":false,
      \"block_exploits\":true,
      \"allow_websocket_upgrade\":true,
      \"access_list_id\":0,
      \"certificate_id\":0,
      \"meta\":{\"letsencrypt_agree\":false,\"dns_challenge\":false},
      \"advanced_config\":\"\",
      \"locations\":[],
      \"http2_support\":false,
      \"hsts_enabled\":false,
      \"hsts_subdomains\":false,
      \"ssl_forced\":false
    }")
  HOST_ID=$(echo "$HOST_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))")
  if [ -z "$HOST_ID" ]; then echo "  ERRO NPM host: $HOST_RESP"; exit 4; fi
  echo "  host id=${HOST_ID}"
fi

echo "[4/4] cert Let's Encrypt + ssl_forced"
# espera DNS propagar (10s)
sleep 10
CERT_RESP=$(curl -s -X POST -H "Authorization: Bearer ${NEW_TOKEN}" -H "Content-Type: application/json" \
  "${NPM_URL}/api/nginx/certificates" \
  -d "{
    \"domain_names\":[\"${HOST}\"],
    \"meta\":{\"letsencrypt_email\":\"${NPM_EMAIL}\",\"letsencrypt_agree\":true,\"dns_challenge\":false},
    \"provider\":\"letsencrypt\"
  }")
CERT_ID=$(echo "$CERT_RESP" | python3 -c "import sys,json
try: d=json.load(sys.stdin)
except: print(''); exit()
print(d.get('id',''))")
if [ -z "$CERT_ID" ]; then
  echo "  WARN cert: $CERT_RESP"
  echo "  o host vai funcionar em http; tenta emitir o cert manualmente no NPM UI depois"
else
  echo "  cert id=${CERT_ID}"
  curl -s -X PUT -H "Authorization: Bearer ${NEW_TOKEN}" -H "Content-Type: application/json" \
    "${NPM_URL}/api/nginx/proxy-hosts/${HOST_ID}" \
    -d "{\"certificate_id\":${CERT_ID},\"ssl_forced\":true,\"http2_support\":true,\"hsts_enabled\":false}" > /dev/null
  echo "  ssl_forced=true"
fi

echo
echo "OK: https://${HOST}"
