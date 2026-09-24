#!/bin/bash
# Healthcheck pesado do whatsapp-worker.
# Roda no cron a cada 3min. Detecta o bug do puppeteer travado parcialmente
# (sintoma: /health diz wa=ready mas send_queue.error tem "getChat" ou
# "client not ready", OU msgs from_me=1 ficam stuck em ack<3 por >10min).
# Quando detecta, mata o whatsapp-worker e deixa o PM2 ressuscitar.
set -u

LOG="/opt/jeff-worker/logs/wa-worker-health.log"
STATE="/opt/jeff-worker/data/wa-worker-health.state"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
DB="/opt/jeff-worker/data/worker.db"
WAPI_HEALTH_URL="http://localhost:3002/health"
JEFF_PHONE="5511910075450"
VINI_PHONE="5585991143501"

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts() { date '+%Y-%m-%d %H:%M:%S BRT'; }
log() { echo "$(ts) $*" >> "$LOG"; }

# 1. Health endpoint deve responder
HEALTH=$(bash "$WAPI_SH" GET /health 2>/dev/null || echo "")
if ! echo "$HEALTH" | grep -q '"wa":"ready"'; then
  log "health endpoint nao retornou wa=ready: $HEALTH"
  current=down; reason="health endpoint wa!=ready"
fi

# 2. send_queue recente com erro de getChat ou client not ready
GETCHAT_ERRS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM send_queue WHERE created_at > datetime('now','-10 minutes') AND status IN ('pending','sending') AND (error LIKE '%getChat%' OR error LIKE '%client not ready%' OR error LIKE '%Session closed%');" 2>/dev/null || echo 0)
if [ "${GETCHAT_ERRS:-0}" -gt 0 ]; then
  current=down; reason="${GETCHAT_ERRS} send_queue erros de getChat/client not ready nos ultimos 10min"
fi

# 3. msgs outbound com ack<2 stuck por >15min (worker nem mandou pro server)
STUCK_UNSENT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE from_me=1 AND ack<2 AND timestamp < datetime('now','-15 minutes') AND timestamp > datetime('now','-2 hours');" 2>/dev/null || echo 0)
if [ "${STUCK_UNSENT:-0}" -ge 3 ]; then
  current=down; reason="${STUCK_UNSENT} outbound msgs ack<2 stuck >15min"
fi

current=${current:-ok}
reason=${reason:-""}
prev=$(cat "$STATE" 2>/dev/null || echo ok)

log "state=$current prev=$prev getchat_errs=$GETCHAT_ERRS stuck_unsent=$STUCK_UNSENT reason=$reason"

if [ "$current" = "down" ] && [ "$prev" != "down" ]; then
  log "ACAO: restart real do whatsapp-worker (kill + pm2 detecta)"
  WA_PID=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);[print(x['pid']) for x in d if x.get('name')=='whatsapp-worker' and x.get('pm2_env',{}).get('status')=='online']" 2>/dev/null | head -1)
  if [ -n "$WA_PID" ]; then
    kill -TERM "$WA_PID" 2>>"$LOG"
    log "kill TERM enviado para PID=$WA_PID"
    sleep 5
    # Se PM2 nao ressuscitou (bug "Process X not found"), fallback delete+start
    if pm2 list 2>/dev/null | grep whatsapp-worker | grep -q stopped; then
      log "PM2 nao ressuscitou. Delete + start manual."
      pm2 delete whatsapp-worker >>"$LOG" 2>&1
      cd /opt/jeff-worker && pm2 start /opt/jeff-worker/src/index.js --name whatsapp-worker >>"$LOG" 2>&1
      pm2 save >>"$LOG" 2>&1
    fi
  else
    log "ERRO: nao consegui descobrir PID do whatsapp-worker"
  fi
  bash "$WAPI_SH" POST /messages/private "{\"to\":\"$JEFF_PHONE\",\"body\":\"[auto-fix] worker WhatsApp foi reiniciado: $reason. Mensagens stuck devem entregar agora.\"}" >>"$LOG" 2>&1 || true
  bash "$WAPI_SH" POST /messages/private "{\"to\":\"$VINI_PHONE\",\"body\":\"[auto-fix] worker WhatsApp foi reiniciado: $reason. Verificar logs.\"}" >>"$LOG" 2>&1 || true
fi

echo "$current" > "$STATE"
exit 0
