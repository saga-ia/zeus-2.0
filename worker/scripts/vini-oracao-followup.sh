#!/usr/bin/env bash
# Follow-up da Oração do Perdão — roda a cada 30min após as 15h.
# Se Vinicius não confirmar com "fiz/feito/feita/sim/ok", cobra até 19x mais (total 20/dia).
set -euo pipefail

cd /opt/jeff-worker

PHONE="5585991143501"
DB="data/worker.db"
STATE_DIR="data"
LOG="logs/vini-oracao-perdao.log"
MAX_FOLLOWUPS=19  # 1 principal + 19 = 20 total

today=$(date +%Y-%m-%d)
STATE_FILE="$STATE_DIR/vini-oracao-state-${today}.json"

# Inicializa estado se não existir (caso o main script não tenha rodado ainda)
if [[ ! -f "$STATE_FILE" ]]; then
  echo "$(date -Iseconds) estado não encontrado para hoje, pulando" >> "$LOG"
  exit 0
fi

# Lê estado atual
confirmed=$(jq -r '.confirmed' "$STATE_FILE")
followups=$(jq -r '.followups' "$STATE_FILE")

if [[ "$confirmed" == "true" ]]; then
  echo "$(date -Iseconds) já confirmado hoje, nada a fazer" >> "$LOG"
  exit 0
fi

if (( followups >= MAX_FOLLOWUPS )); then
  echo "$(date -Iseconds) já enviou $followups follow-ups hoje (máx $MAX_FOLLOWUPS), parando" >> "$LOG"
  exit 0
fi

# Pega o timestamp do primeiro envio de hoje (epoch do início do dia 15h BRT = 18h UTC)
today_15h_epoch=$(date -d "${today} 18:00:00 UTC" +%s)

# Verifica se Vinicius confirmou com palavras-chave após as 15h de hoje
confirmed_check=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM messages
  WHERE contact_phone='$PHONE'
    AND from_me=0
    AND timestamp >= $today_15h_epoch
    AND (
      lower(body) LIKE '%fiz%' OR
      lower(body) LIKE '%feito%' OR
      lower(body) LIKE '%feita%' OR
      lower(body) LIKE '%fiz ela%' OR
      lower(body) LIKE '%fiz a ora%' OR
      lower(body) LIKE '%ora%feita%' OR
      lower(body) LIKE '%completei%' OR
      lower(body) LIKE '%conclu%'
    );
")

if (( confirmed_check > 0 )); then
  jq '.confirmed = true' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
  echo "$(date -Iseconds) confirmação detectada no DB, marcando como confirmado" >> "$LOG"
  exit 0
fi

# Envia follow-up
new_followups=$(( followups + 1 ))
msg="Lembrete $new_followups/20 — Oração do Perdão de hoje. Manda \"fiz\" quando completar."

payload=$(jq -nc --arg to "$PHONE" --arg body "$msg" '{to:$to, body:$body}')
resp=$(scripts/wapi.sh POST /messages/private "$payload" 2>&1)

jq --argjson n "$new_followups" '.followups = $n' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
echo "$(date -Iseconds) follow-up=$new_followups enviado resp=$resp" >> "$LOG"
