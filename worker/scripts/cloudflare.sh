#!/bin/bash
# Helper Cloudflare API — DNS read/write nas zonas do Jeferson.
# Token armazenado em app_settings.jeff_cloudflare_api_token.
#
# Uso:
#   cloudflare.sh zones                                       lista zonas
#   cloudflare.sh records <zone_id_ou_nome>                   lista DNS records
#   cloudflare.sh add <zone> <name> <ip> [proxied=false]     cria A record
#   cloudflare.sh add-cname <zone> <name> <target> [proxied] cria CNAME
#   cloudflare.sh del <zone> <record_id>                     deleta record
#   cloudflare.sh raw <method> <path> [body]                 chamada crua
#
# Exemplos:
#   cloudflare.sh add propostaebcmkt2026.shop dash 80.241.214.10
#   cloudflare.sh add-cname propostaebcmkt2026.shop www example.com true
set -u
DB="/opt/jeff-worker/data/worker.db"
API="https://api.cloudflare.com/client/v4"

TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_cloudflare_api_token';")
[ -z "$TOKEN" ] && { echo '{"error":"no token"}'; exit 2; }

resolve_zone() {
  local arg="$1"
  if [[ "$arg" =~ ^[a-f0-9]{32}$ ]]; then echo "$arg"; return; fi
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API/zones?name=$arg" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'][0]['id'] if d.get('result') else '')"
}

cmd="${1:-}"
case "$cmd" in
  zones)
    curl -s -H "Authorization: Bearer $TOKEN" "$API/zones?per_page=50"
    ;;
  records)
    Z=$(resolve_zone "${2:?usage: records <zone>}")
    curl -s -H "Authorization: Bearer $TOKEN" "$API/zones/$Z/dns_records?per_page=200"
    ;;
  add)
    Z=$(resolve_zone "${2:?usage: add <zone> <name> <ip> [proxied]}")
    NAME="${3:?name required}"
    IP="${4:?ip required}"
    PROXY="${5:-false}"
    curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/zones/$Z/dns_records" \
      -d "{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$IP\",\"ttl\":1,\"proxied\":$PROXY}"
    ;;
  add-cname)
    Z=$(resolve_zone "${2:?usage: add-cname <zone> <name> <target> [proxied]}")
    NAME="${3:?name required}"
    TARGET="${4:?target required}"
    PROXY="${5:-false}"
    curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/zones/$Z/dns_records" \
      -d "{\"type\":\"CNAME\",\"name\":\"$NAME\",\"content\":\"$TARGET\",\"ttl\":1,\"proxied\":$PROXY}"
    ;;
  del)
    Z=$(resolve_zone "${2:?usage: del <zone> <record_id>}")
    RID="${3:?record_id required}"
    curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
      "$API/zones/$Z/dns_records/$RID"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    if [ -n "$BODY" ]; then
      curl -s -X "$METHOD" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        "$API$P" -d "$BODY"
    else
      curl -s -X "$METHOD" -H "Authorization: Bearer $TOKEN" "$API$P"
    fi
    ;;
  *)
    cat <<USAGE
cloudflare.sh — Cloudflare DNS helper (Jeferson)

Comandos:
  zones                                          lista zonas
  records <zone_name_ou_id>                      lista DNS records
  add <zone> <name> <ip> [proxied=false]         cria A record
  add-cname <zone> <name> <target> [proxied]     cria CNAME
  del <zone> <record_id>                         deleta record
  raw <METHOD> <path> [body]                     chamada crua

Exemplos:
  cloudflare.sh records propostaebcmkt2026.shop
  cloudflare.sh add propostaebcmkt2026.shop dash 80.241.214.10
USAGE
    exit 1
    ;;
esac
