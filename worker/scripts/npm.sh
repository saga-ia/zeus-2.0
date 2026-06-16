#!/bin/bash
# Helper Nginx Proxy Manager API — controle de proxy hosts e SSL.
# Token gerado por login JWT (válido ~24h, regerado a cada chamada se preciso).
# Credenciais em app_settings.jeff_npm_email / jeff_npm_password.
#
# Uso:
#   npm.sh hosts                                                          lista proxy hosts
#   npm.sh add-static <subdomain> [zone]                                  cria proxy host estático (→ jeff-sites-nginx) com SSL
#   npm.sh add-proxy <subdomain> <forward_host> <forward_port> [zone]    cria proxy host genérico com SSL
#   npm.sh del <host_id>                                                  deleta proxy host
#   npm.sh certs                                                          lista certificados Let's Encrypt
#   npm.sh raw <method> <path> [body]                                    chamada crua na API NPM
#
# Zonas suportadas (default: jefersonhenrike.com):
#   - jefersonhenrike.com         site/landings pessoais do Jeff (default novo)
#   - propostaebcmkt2026.shop     legado / projetos internos
set -u
DB="/opt/jeff-worker/data/worker.db"
NPM_URL="http://127.0.0.1:81"
ZONE_DEFAULT="jefersonhenrike.com"

EMAIL=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_email';")
PASS=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_npm_password';")

if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  echo '{"error":"npm credentials missing"}'; exit 2
fi

# Login fresh (JWT válido ~24h; sempre regerar é mais simples que TTL handling)
get_token() {
  curl -s -X POST "$NPM_URL/api/tokens" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"$EMAIL\",\"secret\":\"$PASS\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token',''))"
}

TOKEN=$(get_token)
[ -z "$TOKEN" ] && { echo '{"error":"npm login failed"}'; exit 2; }

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$NPM_URL/api$path" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$NPM_URL/api$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

cmd="${1:-}"
case "$cmd" in
  hosts)
    api GET /nginx/proxy-hosts
    ;;
  certs)
    api GET /nginx/certificates
    ;;
  add-static)
    SUB="${2:?usage: add-static <subdomain> [zone]}"
    ZONE="${3:-$ZONE_DEFAULT}"
    FQDN="$SUB.$ZONE"
    # cria proxy host com Let's Encrypt SSL
    api POST /nginx/proxy-hosts "$(cat <<JSON
{
  "domain_names": ["$FQDN"],
  "forward_scheme": "http",
  "forward_host": "jeff-sites-nginx",
  "forward_port": 80,
  "access_list_id": 0,
  "certificate_id": "new",
  "meta": {
    "letsencrypt_email": "$EMAIL",
    "letsencrypt_agree": true,
    "dns_challenge": false
  },
  "advanced_config": "",
  "locations": [],
  "block_exploits": true,
  "caching_enabled": false,
  "allow_websocket_upgrade": false,
  "http2_support": true,
  "hsts_enabled": false,
  "hsts_subdomains": false,
  "ssl_forced": true
}
JSON
)"
    ;;
  add-proxy)
    SUB="${2:?usage: add-proxy <subdomain> <forward_host> <forward_port> [zone]}"
    FH="${3:?forward_host required}"
    FP="${4:?forward_port required}"
    ZONE="${5:-$ZONE_DEFAULT}"
    FQDN="$SUB.$ZONE"
    api POST /nginx/proxy-hosts "$(cat <<JSON
{
  "domain_names": ["$FQDN"],
  "forward_scheme": "http",
  "forward_host": "$FH",
  "forward_port": $FP,
  "access_list_id": 0,
  "certificate_id": "new",
  "meta": {
    "letsencrypt_email": "$EMAIL",
    "letsencrypt_agree": true,
    "dns_challenge": false
  },
  "advanced_config": "",
  "locations": [],
  "block_exploits": true,
  "caching_enabled": false,
  "allow_websocket_upgrade": true,
  "http2_support": true,
  "hsts_enabled": false,
  "hsts_subdomains": false,
  "ssl_forced": true
}
JSON
)"
    ;;
  del)
    HID="${2:?usage: del <host_id>}"
    api DELETE "/nginx/proxy-hosts/$HID"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    api "$METHOD" "$P" "$BODY"
    ;;
  *)
    cat <<USAGE
npm.sh — Nginx Proxy Manager helper (Jeferson)

Comandos:
  hosts                                              lista proxy hosts
  certs                                              lista certificados Let's Encrypt
  add-static <subdomain> [zone]                      cria proxy host estático → jeff-sites-nginx (SSL auto)
  add-proxy <subdomain> <fhost> <fport> [zone]       cria proxy host customizado (SSL auto)
  del <host_id>                                      deleta proxy host
  raw <METHOD> <path> [body]                         chamada crua

Zonas (default: jefersonhenrike.com):
  - jefersonhenrike.com         pessoal do Jeff (default novo)
  - propostaebcmkt2026.shop     legado / projetos internos

Exemplos:
  npm.sh add-static lp                                       # https://lp.jefersonhenrike.com servindo /opt/jeff-sites/lp/
  npm.sh add-static teste propostaebcmkt2026.shop            # https://teste.propostaebcmkt2026.shop
  npm.sh add-proxy crm 172.18.0.x 3000                       # https://crm.jefersonhenrike.com → proxy
  npm.sh add-proxy crm 172.18.0.x 3000 propostaebcmkt2026.shop
USAGE
    exit 1
    ;;
esac
