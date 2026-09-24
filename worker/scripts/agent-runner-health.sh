#!/bin/bash
# Healthcheck do agent-runner (Zeus).
# Roda no cron a cada 5min. Olha os ultimos eventos do agent-runner.log e
# detecta padroes ruins (401 em loop, timeouts seguidos). Notifica Jeff por
# WhatsApp apenas em transicao OK->DOWN ou DOWN->OK.
set -u

LOG_SRC="/opt/jeff-worker/logs/agent-runner.log"
LOG="/opt/jeff-worker/logs/agent-runner-health.log"
STATE="/opt/jeff-worker/data/agent-runner-health.state"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
JEFF_PHONE="5511910075450"
VINI_PHONE="5585991143501"

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts() { date '+%Y-%m-%d %H:%M:%S BRT'; }
log() { echo "$(ts) $*" >> "$LOG"; }

# Olha SOMENTE eventos dos ultimos 10min (janela recente).
WINDOW_MIN=10
CUTOFF_TS=$(date -u -d "$WINDOW_MIN minutes ago" '+%Y-%m-%dT%H:%M:%SZ')
TAIL=$(awk -v cut="$CUTOFF_TS" '
  match($0, /\[([0-9T:Z\-]+)\]/, m) { if (m[1] >= cut) keep=1; else keep=0 }
  keep { print }
' "$LOG_SRC" 2>/dev/null || echo "")

# Conta exits seguidos sem sucesso nos ultimos eventos.
FAILS_401=$(echo "$TAIL" | grep -c "API Error: 401")
EXITS_BAD=$(echo "$TAIL" | grep -cE "claude -p finished exit=(1|124)")
EXITS_OK=$(echo "$TAIL" | grep -c "claude -p finished exit=0")

# Pega o ultimo finish.
LAST_FINISH=$(echo "$TAIL" | grep "claude -p finished" | tail -1)

prev=$(cat "$STATE" 2>/dev/null || echo ok)
current=ok
reason=""

if [ "$FAILS_401" -ge 3 ]; then
  current=down
  reason="$FAILS_401 erros 401 nos ultimos 50 eventos do agent-runner"
elif [ "$EXITS_BAD" -ge 5 ] && [ "$EXITS_OK" -eq 0 ]; then
  current=down
  reason="$EXITS_BAD claude -p exits ruins seguidos sem nenhum sucesso"
fi

log "fails401=$FAILS_401 exits_bad=$EXITS_BAD exits_ok=$EXITS_OK state=$current last=[$LAST_FINISH]"

if [ "$current" != "$prev" ]; then
  if [ "$current" = "down" ]; then
    MSG="ALERTA Zeus DOWN. Motivo: $reason. Ultimo evento: $LAST_FINISH. Cheque /opt/jeff-worker/logs/agent-runner.log"
  else
    MSG="Zeus voltou ao normal apos incidente. Ultimo evento: $LAST_FINISH"
  fi
  log "transicao $prev -> $current. Avisando."
  bash "$WAPI_SH" send "$JEFF_PHONE" "$MSG" >> "$LOG" 2>&1
  bash "$WAPI_SH" send "$VINI_PHONE" "$MSG" >> "$LOG" 2>&1
  echo "$current" > "$STATE"
fi

exit 0
