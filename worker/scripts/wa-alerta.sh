#!/usr/bin/env bash
# Alerta de WhatsApp pro Jeff e o Vinicius quando um número cai ou precisa de QR.
# Tenta pelo Zeus (whatsapp-worker :3002); se ele estiver fora (é justamente ele que caiu), manda pelo
# jeff-wa-relay (:3030). Tokens lidos dos .env na hora, nunca impressos.
# Uso: wa-alerta.sh <chave> "<texto>"
#   chave = identifica o alerta (ex: zeus-qr, sdrs-slot-1); o mesmo alerta não repete em menos de 30 min.
set -u
CHAVE="${1:?chave}"; TEXTO="${2:?texto}"
LOG="/opt/jeff-worker/logs/wa-alerta.log"
STATE_DIR="/opt/jeff-worker/data/wa-alerta"
DESTINOS="5511910075450 5585991143501" # Jeff, Vinicius
COOLDOWN=1800
mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
log() { echo "$(TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S BRT') $*" >> "$LOG"; }

ARQ="$STATE_DIR/$(echo "$CHAVE" | tr -c 'a-zA-Z0-9_-' '_')"
if [ -f "$ARQ" ] && [ $(( $(date +%s) - $(stat -c %Y "$ARQ") )) -lt $COOLDOWN ]; then
  log "[$CHAVE] suprimido (cooldown): $TEXTO"; exit 0
fi

tok() { grep -m1 "^API_TOKEN=" "$1" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"; }
json() { python3 -c 'import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2], sys.argv[3]: sys.argv[4]}))' "$@"; }

enviado=""
W_TOK=$(tok /opt/jeff-worker/.env)
if curl -s -m5 http://127.0.0.1:3002/health | grep -q '"wa":"ready"'; then
  ok=1
  for d in $DESTINOS; do
    curl -s -m15 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3002/messages/private \
      -H "Authorization: Bearer $W_TOK" -H "X-API-Token: $W_TOK" -H 'Content-Type: application/json' \
      -d "$(json to "$d" body "$TEXTO")" | grep -q '^2' || ok=0
  done
  [ $ok = 1 ] && enviado="zeus"
fi
if [ -z "$enviado" ]; then
  R_TOK=$(tok /opt/jeff-apps/jeff-wa-relay/.env)
  ok=1
  for d in $DESTINOS; do
    curl -s -m15 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3030/send \
      -H "X-Token: $R_TOK" -H 'Content-Type: application/json' \
      -d "$(json to "$d" message "$TEXTO")" | grep -q '^2' || ok=0
  done
  [ $ok = 1 ] && enviado="relay"
fi

if [ -n "$enviado" ]; then touch "$ARQ"; log "[$CHAVE] enviado via $enviado: $TEXTO"
else log "[$CHAVE] FALHOU (zeus e relay fora): $TEXTO"; exit 1; fi
