#!/usr/bin/env bash
# Cobrança diária Oração do Perdão pro Vinicius (15h BRT)
# Ciclo de 90 dias, iniciado 2026-11-15 (dia 1 já feito pelo Vini).
set -euo pipefail

cd /opt/jeff-worker

START_DATE="2026-11-15"
TOTAL_DAYS=90
PHONE="5585991143501"
TEXT_FILE="/opt/jeff-worker/data/vini-oracao-perdao.txt"
LOG="/opt/jeff-worker/logs/vini-oracao-perdao.log"

today_epoch=$(date -d "$(date +%Y-%m-%d)" +%s)
start_epoch=$(date -d "$START_DATE" +%s)
day_num=$(( (today_epoch - start_epoch) / 86400 + 1 ))

if (( day_num < 1 || day_num > TOTAL_DAYS )); then
  echo "$(date -Iseconds) fora do ciclo (dia $day_num/$TOTAL_DAYS), pulando" >> "$LOG"
  exit 0
fi

prayer=$(tail -n +3 "$TEXT_FILE")
if (( day_num % 2 == 1 )); then
  alvo="Pai"
  header="Dia $day_num/$TOTAL_DAYS — Oração do Perdão (ao Pai)"
else
  alvo="Mãe"
  header="Dia $day_num/$TOTAL_DAYS — Oração do Perdão (à Mãe)"
fi
abertura="$alvo que me trouxe à vida..."
body=$(printf "%s\n\n%s\n\n%s" "$header" "$abertura" "$prayer")

payload=$(jq -nc --arg to "$PHONE" --arg body "$body" '{to:$to, body:$body}')
resp=$(scripts/wapi.sh POST /messages/private "$payload" 2>&1)
echo "$(date -Iseconds) dia=$day_num resp=$resp" >> "$LOG"

# Cria/reseta estado do dia para o sistema de follow-up
today=$(date +%Y-%m-%d)
STATE_FILE="data/vini-oracao-state-${today}.json"
echo '{"sent":1,"followups":0,"confirmed":false}' > "$STATE_FILE"
echo "$(date -Iseconds) estado do dia criado: $STATE_FILE" >> "$LOG"
