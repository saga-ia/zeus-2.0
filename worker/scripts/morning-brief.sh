#!/bin/bash
# Parecer matinal diário do Jeferson — 7h BRT (10h UTC).
# Consolida agenda do Google Calendar + follow-ups abertos + pendencias
# e envia resumo via WhatsApp pro Jeff.
set -u

DB="/opt/jeff-worker/data/worker.db"
WORKER_DIR="/opt/jeff-worker"
LOG_DIR="/opt/jeff-worker/logs"
LOG="$LOG_DIR/morning-brief.log"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"

mkdir -p "$LOG_DIR"
export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"
export HOME="/root"

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "morning-brief started"

# Captura agenda do dia via google.sh
AGENDA=$("$WORKER_DIR/scripts/google.sh" calendar-list jefersonhenrike1@gmail.com 2>/dev/null)
log "calendar fetched: ${#AGENDA} bytes"

cd "$WORKER_DIR"
timeout 300 "$CLAUDE_BIN" -p \
  --output-format text \
  "Rotina de parecer matinal do Jeferson — execute conforme o CLAUDE.md.

Contexto de agenda (JSON do Google Calendar — próximos eventos):
$AGENDA

Passos:
1. Filtra do JSON acima os eventos de HOJE (data BRT = hoje no fuso America/Sao_Paulo). Extrai: hora BRT, título e local/link Meet se houver.
2. SELECT id, title, owner_name, due_at, chase_count FROM jeff_followups WHERE status='open' ORDER BY due_at ASC LIMIT 20.
3. SELECT COUNT(*) FROM messages WHERE processed_by_agent=0 AND from_me=0.
4. Monte UM único WhatsApp pra Jeff (5511910075450) no formato abaixo:

---
Ótimo dia, Jeff!

*Agenda de hoje:*
- HH:MM - Titulo do evento (link se tiver)
(se não houver eventos: 'Agenda livre hoje.')

*Follow-ups abertos:* N
(liste os vencidos/urgentes, maximo 5 linhas, nome + prazo)

*Msgs nao lidas:* N
---

5. Envie via scripts/wapi.sh POST /messages/private com to=5511910075450.
6. Nao invente eventos. Se o JSON de agenda estiver vazio ou sem items, diga 'Agenda livre hoje.'
7. Nao mande nada pra mais ninguem. So pro Jeff.

Encerre quando terminar." \
  >> "$LOG" 2>&1

EC=$?
log "morning-brief finished exit=$EC"
