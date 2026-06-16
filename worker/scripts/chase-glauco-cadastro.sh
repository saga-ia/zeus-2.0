#!/bin/bash
# Cobra o Glauco a cada execução até ele preencher o cadastro de admin
# do CIGC. Para automaticamente quando invites.used_at é preenchido.
# Pedido pelo Jeff em 2026-05-06.

set -euo pipefail

DB_CIGC="/opt/jeff-apps/jeff-cigc-clientarea/data/cigc.db"
DB_WORKER="/opt/jeff-worker/data/worker.db"
GLAUCO_TOKEN="f2e45627e91d57e780b74e40b25813515d7b6ed95bdcfe25"
GLAUCO_PHONE="556282363940"
LINK="https://cigc.jefersonhenrike.com/cadastro?t=${GLAUCO_TOKEN}"
LOG="/opt/jeff-worker/logs/chase-glauco-cadastro.log"

mkdir -p "$(dirname "$LOG")"

USED_AT=$(sqlite3 "$DB_CIGC" "SELECT IFNULL(used_at,'') FROM invites WHERE token='$GLAUCO_TOKEN';")

if [ -n "$USED_AT" ]; then
  echo "[$(date -Is)] Glauco já preencheu (used_at=$USED_AT). Removendo cron." >> "$LOG"
  # Remove a linha do crontab pra não cobrar mais
  ( crontab -l 2>/dev/null | grep -v "chase-glauco-cadastro.sh" ) | crontab -
  exit 0
fi

# Conjunto de mensagens variadas
MSGS=(
"Glauco, conseguiu preencher o cadastro de admin? Link: ${LINK}"
"Oi Glauco, e aí, deu pra preencher? ${LINK}"
"Glauco, preenche lá pra gente por favor: ${LINK}"
"Glauco, assim que conseguir preencher me avisa. Link: ${LINK}"
"E aí Glauco, alguma dúvida no cadastro? ${LINK}"
"Glauco, lembrete do cadastro de admin do CIGC: ${LINK}"
"Glauco, tô aqui aguardando o seu cadastro pra te liberar tudo: ${LINK}"
"Glauco, dois minutinhos pra criar a senha: ${LINK}"
)

IDX=$(( RANDOM % ${#MSGS[@]} ))
MSG="${MSGS[$IDX]}"

PAYLOAD=$(jq -nc --arg to "$GLAUCO_PHONE" --arg body "$MSG" '{to:$to, body:$body}')

RESULT=$(/opt/jeff-worker/scripts/wapi.sh POST /messages/private "$PAYLOAD" || echo "ERROR")
echo "[$(date -Is)] enviado: $MSG | result: $RESULT" >> "$LOG"

# Atualiza follow-up se existir
sqlite3 "$DB_WORKER" "UPDATE jeff_followups
  SET last_chased_at = datetime('now'),
      chase_count = chase_count + 1
  WHERE owner_phone='$GLAUCO_PHONE'
    AND description LIKE '%cadastro admin CIGC%'
    AND status='open';"
