#!/usr/bin/env bash
# Alerta de WhatsApp pro Jeff e o Vinicius quando um número cai ou precisa de QR (+ email, ver no fim).
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

# Email (2026-11-17): o WhatsApp não serve de canal quando é ele que caiu.
#  - Zeus deslogado (zeus-logout/zeus-qr): email SEMPRE pro suporte e pro cliente, que tem o celular pra ler o QR.
#  - Outros alertas: email pro suporte só se o WhatsApp não saiu.
# Cliente, domínio e emails: mesmos dados do alerta de login (CLAUDE.md do servidor; ALERTA_* no .env sobrescreve).
WORKER_DIR=/opt/jeff-worker; LOG_DIR=/opt/jeff-worker/logs
# shellcheck source=alerta-login.sh
. /opt/jeff-worker/scripts/alerta-login.sh
SUPORTE_EMAIL="$ALERTA_SUPORTE_EMAIL"
CLIENTE_EMAILS="$ALERTA_EMAILS"           # suporte + dono
CENTRAL_URL="https://$ALERTA_DOMINIO"
mail() { # assunto corpo destinos...
  local out; out=$(timeout 60 python3 /opt/jeff-worker/scripts/email-alerta.py "$@" 2>&1) && { log "[$CHAVE] email: $out"; return 0; }
  log "[$CHAVE] email falhou: $out"; return 1
}
quando=$(TZ=America/Sao_Paulo date '+%d/%m/%Y às %H:%M')
case "$CHAVE" in
  zeus-logout|zeus-qr)
    mail "WhatsApp do Zeus $ALERTA_CLIENTE desconectado: é preciso ler o QR novamente" "Olá,

O WhatsApp do Zeus foi desconectado pelo próprio WhatsApp em $quando (horário de Brasília). Enquanto não for conectado de novo, o Zeus não recebe nem responde mensagens.

O QUE FAZER (leva 1 minuto, com o celular do número do Zeus em mãos):
1. Abra a Central: $CENTRAL_URL
2. Vá em Conectores > WhatsApp e clique para mostrar o QR.
3. No celular do Zeus, abra o WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho e leia o QR.
4. Pronto. As mensagens que chegarem a partir daí são respondidas normalmente.

Dica: se isso estiver se repetindo, confira em Aparelhos conectados se não há aparelhos sobrando e evite remover o aparelho \"Zeus\" da lista. Deixe também o celular do Zeus com internet.

Se precisar de ajuda, chame o suporte da Alpha Digital no WhatsApp.

Detalhe técnico: $TEXTO

Zeus (aviso automático)" $CLIENTE_EMAILS && enviado="${enviado:+$enviado+}email"
    ;;
  *)
    if [ -z "$enviado" ]; then
      mail "[ALERTA ZEUS $ALERTA_DOMINIO] $CHAVE" "$TEXTO

($quando BRT; WhatsApp do Zeus e relay fora, por isso veio por email. Log: $LOG)" $SUPORTE_EMAIL && enviado="email"
    fi
    ;;
esac

if [ -n "$enviado" ]; then touch "$ARQ"; log "[$CHAVE] enviado via $enviado: $TEXTO"
else log "[$CHAVE] FALHOU (zeus, relay e email): $TEXTO"; exit 1; fi
