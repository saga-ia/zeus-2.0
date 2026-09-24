#!/bin/bash
# Dispatcher de DMs do Instagram — consulta eventos não processados,
# chama Zeus (claude -p) pra gerar resposta e envia via instagram.sh dm-send.
# Rodado por cron a cada 1 minuto.
# Locking simples: marca processed_at='pending' pra reservar o evento antes de chamar Claude.
set -u
DB="/opt/jeff-worker/data/worker.db"
LOG="/opt/jeff-worker/logs/ig-dm-dispatcher.log"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"
RUN_TIMEOUT=180
WORKER_DIR="/opt/jeff-worker"
mkdir -p "$(dirname "$LOG")"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $1" | tee -a "$LOG"; }

# Locking global — evita concorrência com outra execução cron
LOCK="/tmp/ig-dm-dispatcher.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  log "outro dispatcher em execução, saindo"
  exit 0
fi

# 1) Pega até 3 DMs pendentes (event_type=message, sem processed_at, com texto e sender)
ROWS=$(sqlite3 -separator '|' "$DB" "
  SELECT id, sender_id, COALESCE(message_text,'')
  FROM ig_webhook_events
  WHERE event_type='message'
    AND processed_at IS NULL
    AND sender_id IS NOT NULL
    AND message_text IS NOT NULL
  ORDER BY id ASC
  LIMIT 3;")

[ -z "$ROWS" ] && exit 0

log "encontrados $(echo "$ROWS" | wc -l) eventos pendentes"

echo "$ROWS" | while IFS='|' read -r EID SENDER TEXT; do
  # Reserva o evento pra evitar re-processamento
  sqlite3 "$DB" "UPDATE ig_webhook_events SET processed_at='pending' WHERE id=$EID AND processed_at IS NULL;"

  log "evento id=$EID sender=$SENDER texto='${TEXT:0:60}'"

  # Prompt do Zeus — instrução curta pra responder a DM
  PROMPT="Você é o Zeus, IA pessoal do Jeferson Henrike (@jeffhenrike). Estratégia digital, tráfego, copy, IA.
Uma pessoa mandou uma DM pro perfil @jeffhenrike. Você vai responder por ele.

Mensagem recebida (sender_id=${SENDER}):
\"\"\"
${TEXT}
\"\"\"

Regras:
- Se for a primeira interação e a pessoa está só cumprimentando (opa/oi/bom dia), responda curto se apresentando: 'Opa! Aqui é o Zeus, IA do Jeff. Ele tá on comigo por aqui — em que posso te ajudar?'
- Não invente informação sobre o Jeff. Se pedirem contato pessoal/reunião, diga que vai encaminhar pro Jeff.
- Português BR, tom amigável-profissional, sem travessão (— ou –), sem emoji excessivo.
- Máximo 2 parágrafos curtos.
- Sua saída deve ser APENAS o texto da resposta, sem prefixo/aspas/explicação."

  RESPONSE=$(cd "$WORKER_DIR" && timeout "$RUN_TIMEOUT" "$CLAUDE_BIN" -p \
    --model "claude-sonnet-4-6" \
    --strict-mcp-config \
    --output-format text \
    "$PROMPT" < /dev/null 2>>"$LOG")
  EC=$?

  if [ $EC -ne 0 ] || [ -z "$RESPONSE" ]; then
    log "evento id=$EID: claude falhou (exit=$EC), marcando erro"
    sqlite3 "$DB" "UPDATE ig_webhook_events SET processed_at=datetime('now'), response_error='claude_exit_$EC' WHERE id=$EID;"
    continue
  fi

  # Envia DM
  SEND_RESULT=$(/opt/jeff-worker/scripts/instagram.sh dm-send "$SENDER" "$RESPONSE" 2>&1)
  if echo "$SEND_RESULT" | grep -q '"message_id"'; then
    log "evento id=$EID: DM enviada"
    ESC_RESP=$(echo "$RESPONSE" | sed "s/'/''/g")
    sqlite3 "$DB" "UPDATE ig_webhook_events SET processed_at=datetime('now'), response_text='$ESC_RESP' WHERE id=$EID;"
  else
    log "evento id=$EID: falha no envio: $SEND_RESULT"
    ESC_ERR=$(echo "$SEND_RESULT" | sed "s/'/''/g")
    sqlite3 "$DB" "UPDATE ig_webhook_events SET processed_at=datetime('now'), response_error='$ESC_ERR' WHERE id=$EID;"
  fi
done

exit 0
