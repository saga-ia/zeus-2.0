#!/bin/bash
# Healthcheck pesado do whatsapp-worker. Roda no cron a cada 3 min.
# Detecta o puppeteer travado (worker sem responder, wa preso fora de "ready", erros de getChat/client
# not ready na fila) e reinicia o whatsapp-worker (kill + PM2 ressuscita).
#
# Ajustes 2026-11-17 (o Zeus estava sendo deslogado pelo WhatsApp e reinício demais ajuda a chamar atenção):
#  - wa=qr (deslogado, precisa ler o QR) NÃO reinicia: reiniciar não resolve, quem resolve é ler o QR.
#    O aviso de logout sai do próprio worker (wa-alerta.sh zeus-logout, com email pro cliente).
#  - Logo depois de subir (initializing/authenticated nos primeiros 5 min) não conta como queda.
#  - Mensagens presas com o WhatsApp conectado: só avisa o suporte, não reinicia. A consulta antiga
#    comparava texto ISO ("2026-11-17T20:24Z") com datetime() ("2026-11-17 20:09") e só disparava perto da
#    meia-noite UTC (21h BRT), reiniciando o Zeus à toa. Agora usa datetime(timestamp) e ack<1
#    (0 = não saiu do aparelho, -1 = erro); ack 1 é "chegou no servidor" e não é problema do worker.
#  - No máximo 1 reinício automático por hora; acima disso só avisa.
set -u

LOG="/opt/jeff-worker/logs/wa-worker-health.log"
STATE="/opt/jeff-worker/data/wa-worker-health.state"
LAST_RESTART="/opt/jeff-worker/data/wa-worker-health.last-restart"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
ALERTA="/opt/jeff-worker/scripts/wa-alerta.sh"
DB="/opt/jeff-worker/data/worker.db"
MIN_ENTRE_RESTARTS=3600

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts() { TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S BRT'; }
log() { echo "$(ts) $*" >> "$LOG"; }

current=ok; reason=""; acao=restart

# 1. Health endpoint
HEALTH=$(bash "$WAPI_SH" GET /health 2>/dev/null || echo "")
WA=$(printf '%s' "$HEALTH" | python3 -c 'import json,sys
try: d=json.load(sys.stdin); print(d.get("wa",""), int(d.get("uptimeSec",0)))
except Exception: print("sem_resposta 0")' 2>/dev/null)
WA_STATE=${WA% *}; UPTIME=${WA#* }
case "$WA_STATE" in
  ready) ;;
  qr)
    current=qr; reason="deslogado, aguardando leitura do QR"; acao=nenhuma ;;
  initializing|authenticated|loading|starting)
    if [ "${UPTIME:-0}" -lt 300 ]; then current=subindo; reason="subindo ($WA_STATE, ${UPTIME}s)"; acao=nenhuma
    else current=down; reason="preso em $WA_STATE há ${UPTIME}s"; fi ;;
  *)
    current=down; reason="health endpoint sem wa=ready ($WA_STATE)" ;;
esac
[ "$current" = ok ] || log "health: $HEALTH"

# 2. send_queue recente com erro de getChat ou client not ready (puppeteer meio morto)
GETCHAT_ERRS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM send_queue WHERE datetime(created_at) > datetime('now','-10 minutes') AND status IN ('pending','sending') AND (error LIKE '%getChat%' OR error LIKE '%client not ready%' OR error LIKE '%Session closed%');" 2>/dev/null || echo 0)
if [ "$WA_STATE" = ready ] && [ "${GETCHAT_ERRS:-0}" -gt 0 ]; then
  current=down; reason="${GETCHAT_ERRS} send_queue erros de getChat/client not ready nos ultimos 10min"; acao=restart
fi

# 3. msgs do Zeus que não saíram do aparelho (ack 0) ou deram erro (-1) entre 15 min e 2 h atrás
STUCK_UNSENT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE from_me=1 AND ack<1 AND datetime(timestamp) < datetime('now','-15 minutes') AND datetime(timestamp) > datetime('now','-2 hours');" 2>/dev/null || echo 0)
if [ "$current" = ok ] && [ "${STUCK_UNSENT:-0}" -ge 3 ]; then
  current=presas; reason="${STUCK_UNSENT} msgs do Zeus sem sair (ack<1) há mais de 15 min, com o WhatsApp conectado"; acao=avisar
fi

prev=$(cat "$STATE" 2>/dev/null || echo ok)
log "state=$current prev=$prev wa=$WA_STATE getchat_errs=$GETCHAT_ERRS stuck_unsent=$STUCK_UNSENT reason=$reason"

if [ "$acao" = restart ] && [ "$current" = down ]; then
  now=$(date +%s); last=$(cat "$LAST_RESTART" 2>/dev/null || echo 0)
  if [ $((now - last)) -lt $MIN_ENTRE_RESTARTS ]; then
    log "restart pulado: o último reinício automático foi há $(( (now - last) / 60 )) min (máx 1 por hora)"
    [ "$prev" = down ] || ( bash "$ALERTA" zeus-health-limite "[health] WhatsApp do Zeus com problema ($reason), mas já foi reiniciado automaticamente há menos de 1 hora. Não reiniciei de novo: precisa olhar no servidor (log $LOG)." ) >>"$LOG" 2>&1 &
  else
    log "ACAO: restart real do whatsapp-worker (kill + pm2 detecta)"
    echo "$now" > "$LAST_RESTART"
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
    ( sleep 90; bash "$ALERTA" zeus-autofix "[auto-fix] WhatsApp do ZEUS foi reiniciado: $reason. Se ele estiver pedindo QR, leia de novo na Central › Conectores › WhatsApp." ) >>"$LOG" 2>&1 &
  fi
fi

if [ "$acao" = avisar ] && [ "$prev" != presas ]; then
  log "AVISO: mensagens presas com o WhatsApp conectado; sem reinício"
  ( bash "$ALERTA" zeus-msgs-presas "[health] $reason. Não reiniciei (reinício demais faz o WhatsApp deslogar o Zeus). Conferir send_queue e messages ack<1 no servidor." ) >>"$LOG" 2>&1 &
fi

echo "$current" > "$STATE"
exit 0
