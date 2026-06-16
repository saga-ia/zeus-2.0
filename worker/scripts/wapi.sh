#!/usr/bin/env bash
# Wrapper para a API do whatsapp-worker. Lê o token do .env internamente.
# Uso:
#   wapi.sh GET /health
#   wapi.sh POST /send-message '{"chatId":"...","message":"..."}'
#   wapi.sh POST /agent/speak '{"chatId":"...","text":"..."}'
#   wapi.sh GET /groups
#   wapi.sh POST /groups/<JID>/participants '{"participants":["55..."]}'
#   wapi.sh DELETE /groups/<JID>/participants/55...@c.us
#   wapi.sh POST /messages/<ID>/reply '{"chatId":"...","body":"..."}'
#   wapi.sh POST /messages/<ID>/react '{"chatId":"...","emoji":"👍"}'
#   wapi.sh POST /messages/private '{"to":"55...","body":"..."}'
#   wapi.sh POST /session/read '{"chatId":"..."}'
#   wapi.sh POST /admin/api-replies/panic '{"enabled":true}'
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
TOKEN=$(grep ^API_TOKEN "$ENV_FILE" | cut -d= -f2)
BASE="http://127.0.0.1:3002"

METHOD="${1:?Uso: wapi.sh <GET|POST|DELETE|PATCH> <endpoint> [json_body]}"
ENDPOINT="${2:?endpoint obrigatório}"
BODY="${3:-}"

if [ "$METHOD" = "GET" ] || [ "$METHOD" = "DELETE" ]; then
  curl -sf -X "$METHOD" "$BASE$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN"
else
  curl -sf -X "$METHOD" "$BASE$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "${BODY:-{\}}"
fi
