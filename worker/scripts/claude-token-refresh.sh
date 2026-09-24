#!/bin/bash
# Refresh proativo da credencial OAuth do Claude CLI.
# Roda no cron a cada 30min. Se expiresAt do .credentials.json estiver a <2h
# de expirar, dispara um `claude -p` curto pra forçar o CLI a fazer refresh.
# Sem refresh proativo, o agent-runner pega 401 e para de responder no WhatsApp.
set -u

CRED="/root/.claude/.credentials.json"
LOG="/opt/jeff-worker/logs/claude-token-refresh.log"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
JEFF_PHONE="5511910075450"
STATE="/opt/jeff-worker/data/claude-token-refresh.state"
THRESHOLD_SEC=$((2*60*60)) # 2h

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts() { date '+%Y-%m-%d %H:%M:%S BRT'; }
log() { echo "$(ts) $*" >> "$LOG"; }

if [ ! -f "$CRED" ]; then
  log "FAIL .credentials.json nao existe"
  exit 1
fi

EXP_MS=$(python3 -c "import json;print(json.load(open('$CRED')).get('claudeAiOauth',{}).get('expiresAt',0))" 2>/dev/null || echo 0)
EXP_SEC=$((EXP_MS/1000))
NOW=$(date +%s)
REMAINING=$((EXP_SEC-NOW))

log "expiresAt=$EXP_SEC now=$NOW remaining=${REMAINING}s"

if [ "$REMAINING" -gt "$THRESHOLD_SEC" ]; then
  exit 0
fi

# Faltam <2h. Forca um claude -p curto pra disparar refresh.
log "remaining<${THRESHOLD_SEC}s, disparando refresh"
OUT=$(echo "ping" | timeout 60 /root/.nvm/versions/node/v20.20.2/bin/claude -p --model claude-haiku-4-5-20251001 --output-format text 2>&1 | head -c 500)
EC=${PIPESTATUS[1]}
log "refresh exit=$EC out=$(echo "$OUT" | tr '\n' ' ')"

# Re-le expiresAt
NEW_EXP_MS=$(python3 -c "import json;print(json.load(open('$CRED')).get('claudeAiOauth',{}).get('expiresAt',0))" 2>/dev/null || echo 0)
NEW_EXP_SEC=$((NEW_EXP_MS/1000))
NEW_REM=$((NEW_EXP_SEC-NOW))
log "novo expiresAt=$NEW_EXP_SEC remaining=${NEW_REM}s"

prev=$(cat "$STATE" 2>/dev/null || echo ok)

if [ "$EC" -ne 0 ] || [ "$NEW_REM" -le "$THRESHOLD_SEC" ]; then
  if [ "$prev" != "fail" ]; then
    log "ALERTA: refresh falhou. Avisando Jeff."
    bash "$WAPI_SH" send "$JEFF_PHONE" "Jeff, refresh do token do Claude CLI falhou (exit=$EC, remaining=${NEW_REM}s). Rode \`claude\` no terminal pra refazer login antes do Zeus parar de responder." >> "$LOG" 2>&1
    echo fail > "$STATE"
  fi
  exit 1
fi

if [ "$prev" = "fail" ]; then
  log "Refresh OK depois de falha. Avisando Jeff."
  bash "$WAPI_SH" send "$JEFF_PHONE" "Token do Claude CLI renovado com sucesso. Zeus voltou ao normal." >> "$LOG" 2>&1
fi
echo ok > "$STATE"
exit 0
