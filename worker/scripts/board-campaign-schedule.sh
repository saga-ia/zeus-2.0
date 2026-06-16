#!/bin/bash
# Automação de horário para campanhas da conta Board Academy (Farias Souza)
# Uso: board-campaign-schedule.sh pause|activate
# pause:    salva IDs das campanhas ACTIVE e pausa todas
# activate: reativa apenas as campanhas que foram pausadas por este script
#
# Crons (UTC, servidor em UTC):
#   0 1 * * * -> 22h BRT (pausa)
#   0 8 * * * -> 5h BRT (ativa)

set -euo pipefail

DB="/opt/jeff-worker/data/worker.db"
API="https://graph.facebook.com/v19.0"
ACCOUNT_ID="1180414197299732"
STATE_FILE="/opt/jeff-worker/data/board-paused-campaigns.json"
LOG_PREFIX="[board-schedule]"
WAPI="http://127.0.0.1:3002"
JEFF_PHONE="5511910075450"

get_setting() {
  sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='$1';"
}

TOKEN=$(get_setting jeff_meta_user_token)
if [ -z "$TOKEN" ]; then
  TOKEN=$(get_setting jeff_meta_system_token)
fi
if [ -z "$TOKEN" ]; then
  echo "$LOG_PREFIX ERRO: nenhum token Meta disponível"
  exit 1
fi

notify_jeff() {
  local msg="$1"
  curl -s -X POST "$WAPI/messages/private" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"$JEFF_PHONE\",\"body\":\"$msg\"}" > /dev/null 2>&1 || true
}

graph_post() {
  local path="$1"
  local data="$2"
  curl -s -X POST "$API/$path" \
    -H "Content-Type: application/json" \
    -d "$data"
}

graph_get() {
  local path="$1"
  local params="${2:-}"
  curl -s --get "$API/$path" \
    --data-urlencode "access_token=$TOKEN" \
    --data-urlencode "fields=id,name,status" \
    --data-urlencode "limit=100" \
    $([ -n "$params" ] && echo "--data-urlencode \"$params\"" || true)
}

cmd="${1:-}"

case "$cmd" in
  pause)
    echo "$LOG_PREFIX $(date -u '+%Y-%m-%d %H:%M UTC') — buscando campanhas ACTIVE..."

    CAMPAIGNS=$(curl -s --get "$API/act_${ACCOUNT_ID}/campaigns" \
      --data-urlencode "access_token=$TOKEN" \
      --data-urlencode "fields=id,name,status" \
      --data-urlencode "limit=100")

    ACTIVE_IDS=$(echo "$CAMPAIGNS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
ids = [c['id'] for c in data.get('data', []) if c.get('status') == 'ACTIVE']
print(json.dumps(ids))
")

    COUNT=$(echo "$ACTIVE_IDS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

    if [ "$COUNT" -eq 0 ]; then
      echo "$LOG_PREFIX nenhuma campanha ACTIVE encontrada, nada a fazer."
      exit 0
    fi

    echo "$LOG_PREFIX pausando $COUNT campanhas..."
    echo "$ACTIVE_IDS" > "$STATE_FILE"

    ERRORS=0
    while IFS= read -r campaign_id; do
      campaign_id=$(echo "$campaign_id" | tr -d '"')
      [ -z "$campaign_id" ] && continue

      RESULT=$(curl -s -X POST "$API/$campaign_id" \
        -F "status=PAUSED" \
        -F "access_token=$TOKEN")

      if echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
        echo "$LOG_PREFIX pausada: $campaign_id"
      else
        echo "$LOG_PREFIX ERRO ao pausar $campaign_id: $RESULT"
        ERRORS=$((ERRORS + 1))
      fi
    done < <(echo "$ACTIVE_IDS" | python3 -c "import json,sys; [print(i) for i in json.load(sys.stdin)]")

    if [ "$ERRORS" -gt 0 ]; then
      notify_jeff "Board Academy: automação de pausa (22h) concluida com $ERRORS erro(s). Verifique o log."
    else
      echo "$LOG_PREFIX $COUNT campanhas pausadas com sucesso."
    fi
    ;;

  activate)
    echo "$LOG_PREFIX $(date -u '+%Y-%m-%d %H:%M UTC') — reativando campanhas..."

    if [ ! -f "$STATE_FILE" ]; then
      echo "$LOG_PREFIX STATE_FILE nao encontrado ($STATE_FILE), nada a reativar."
      notify_jeff "Board Academy: automacao de reativacao (5h) - arquivo de estado nao encontrado. Verifique manualmente."
      exit 0
    fi

    SAVED_IDS=$(cat "$STATE_FILE")
    COUNT=$(echo "$SAVED_IDS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

    if [ "$COUNT" -eq 0 ]; then
      echo "$LOG_PREFIX nenhum ID salvo, nada a reativar."
      exit 0
    fi

    echo "$LOG_PREFIX reativando $COUNT campanhas..."

    ERRORS=0
    while IFS= read -r campaign_id; do
      campaign_id=$(echo "$campaign_id" | tr -d '"')
      [ -z "$campaign_id" ] && continue

      RESULT=$(curl -s -X POST "$API/$campaign_id" \
        -F "status=ACTIVE" \
        -F "access_token=$TOKEN")

      if echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
        echo "$LOG_PREFIX reativada: $campaign_id"
      else
        echo "$LOG_PREFIX ERRO ao reativar $campaign_id: $RESULT"
        ERRORS=$((ERRORS + 1))
      fi
    done < <(echo "$SAVED_IDS" | python3 -c "import json,sys; [print(i) for i in json.load(sys.stdin)]")

    if [ "$ERRORS" -gt 0 ]; then
      notify_jeff "Board Academy: automacao de reativacao (5h) concluida com $ERRORS erro(s). Verifique o log."
    else
      echo "$LOG_PREFIX $COUNT campanhas reativadas com sucesso."
      rm -f "$STATE_FILE"
    fi
    ;;

  *)
    echo "Uso: $0 pause|activate"
    exit 1
    ;;
esac
