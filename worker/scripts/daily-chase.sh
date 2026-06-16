#!/bin/bash
# Rotina diária de cobrança do Jeferson.
# Lê jeff_followups vencidos, dispara claude -p para cobrar via WhatsApp
# e enviar relatório pro Jeff. Roda via cron 12:00 UTC (9h BRT).
set -u

DB="/opt/jeff-worker/data/worker.db"
WORKER_DIR="/opt/jeff-worker"
LOG_DIR="/opt/jeff-worker/logs"
LOG="$LOG_DIR/daily-chase.log"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"

mkdir -p "$LOG_DIR"
export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"
export HOME="/root"

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "daily-chase started"

# Quick pre-check: any open followups at all?
OPEN=$(sqlite3 "$DB" "SELECT COUNT(*) FROM jeff_followups WHERE status='open';" 2>/dev/null || echo 0)
log "open followups: $OPEN"

cd "$WORKER_DIR"
timeout 600 "$CLAUDE_BIN" -p \
  --output-format text \
  < /dev/null \
  "Rotina diária de cobrança do Jeferson — execute conforme o CLAUDE.md (seção 'Follow-ups ativos do Jeferson').

Passos:
1. SELECT * FROM jeff_followups WHERE status='open' ORDER BY due_at ASC.
2. Para cada item vencido (due_at < date('now')), cobre o owner via WhatsApp usando jeff_team para o tom, com a cadência: 0-24h leve / 24-72h firme / >72h escala pro Jeferson.
3. Atualize last_chased_at e chase_count para cada cobrança enviada.
4. Itens com chase_count >= 3 e ainda 'open': escale com mensagem ao Jeferson (5511910075450@c.us) listando-os explicitamente.
5. No final, mande UM resumo único pro Jeferson em DM: 'Bom dia Jeff! Hoje: X follow-ups ativos, Y cobrados, Z vencidos sem owner respondendo, W concluídos ontem.' Se não tiver nada vencido, mande 'Bom dia Jeff! Sem follow-ups vencidos hoje. N ativos no total.'
6. Não cobre nada que não esteja em jeff_followups. Não invente itens.

Encerre quando terminar. Seja eficiente — não fique conversando." \
  >> "$LOG" 2>&1

EC=$?
log "daily-chase finished exit=$EC"
