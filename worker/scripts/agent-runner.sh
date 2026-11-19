#!/bin/bash
# Polls SQLite for whitelist messages with processed_by_agent=0 and triggers
# Claude Code in print mode to handle them. Defers if another `claude` process
# is already running (avoids stomping on interactive sessions).
set -u

DB="/opt/jeff-worker/data/worker.db"
WORKER_DIR="/opt/jeff-worker"
LOG_DIR="/opt/jeff-worker/logs"
LOG="$LOG_DIR/agent-runner.log"
TRIGGER_LOG="$LOG_DIR/trigger-log.jsonl"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"

DEBOUNCE=8     # seconds to wait after detecting pending, in case more arrive
POLL=5         # idle poll interval
COOLDOWN=15    # cooldown after each claude run (or when deferring)
RUN_TIMEOUT=600 # max seconds per claude -p run (10min)

# Only fire for messages from authorized senders. Stale processed_by_agent=0
# rows from non-whitelist contacts (legacy) are ignored.
PENDING_QUERY="SELECT COUNT(*) FROM messages
WHERE processed_by_agent=0 AND from_me=0 AND (
  contact_phone IN ('5511910075450','5585991143501')
  OR is_group=1
  OR chat_id = COALESCE((SELECT value FROM app_settings WHERE key='internal_team_group_jid'),'')
  OR contact_phone IN (
    SELECT phone FROM contact_settings
    WHERE api_replies_enabled=0
      AND set_by IN ('lucas_approval','team_group_auto')
  )
);"

PENDING_IDS_QUERY="SELECT GROUP_CONCAT(id) FROM (
  SELECT id FROM messages
  WHERE processed_by_agent=0 AND from_me=0 AND (
    contact_phone IN ('5511910075450','5585991143501')
    OR is_group=1
    OR chat_id = COALESCE((SELECT value FROM app_settings WHERE key='internal_team_group_jid'),'')
    OR contact_phone IN (
      SELECT phone FROM contact_settings
      WHERE api_replies_enabled=0
        AND set_by IN ('lucas_approval','team_group_auto')
    )
  )
  ORDER BY id
);"

# Text of pending messages for model selection (item 3)
PENDING_TEXT_QUERY="SELECT GROUP_CONCAT(coalesce(body,transcription,''), ' ') FROM messages
WHERE processed_by_agent=0 AND from_me=0 AND (
  contact_phone IN ('5511910075450','5585991143501')
  OR is_group=1
  OR chat_id = COALESCE((SELECT value FROM app_settings WHERE key='internal_team_group_jid'),'')
  OR contact_phone IN (
    SELECT phone FROM contact_settings
    WHERE api_replies_enabled=0
      AND set_by IN ('lucas_approval','team_group_auto')
  )
);"

mkdir -p "$LOG_DIR"

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"
export HOME="/root"

log "agent-runner started (pid $$, claude $($CLAUDE_BIN --version 2>/dev/null | head -1))"

while true; do
  PENDING=$(sqlite3 "$DB" "$PENDING_QUERY" 2>/dev/null || echo 0)

  if [ "${PENDING:-0}" -gt 0 ]; then
    # Skip only if a previous runner-spawned `claude -p` is still working.
    # Interactive sessions don't block the runner — duplicate-reply risk is
    # accepted in exchange for guaranteed autonomous answering.
    if pgrep -af "claude -p " >/dev/null 2>&1; then
      log "$PENDING pending but a claude -p run is in flight; waiting ${COOLDOWN}s"
      sleep "$COOLDOWN"
      continue
    fi

    log "$PENDING pending msg(s) detected, debouncing ${DEBOUNCE}s"
    sleep "$DEBOUNCE"

    # Re-check after debounce in case messages were processed by something else
    PENDING2=$(sqlite3 "$DB" "$PENDING_QUERY" 2>/dev/null || echo 0)
    if [ "${PENDING2:-0}" -le 0 ]; then
      log "no pending after debounce, skipping"
      sleep "$POLL"
      continue
    fi

    MSG_IDS=$(sqlite3 "$DB" "$PENDING_IDS_QUERY" 2>/dev/null || echo "")

    # Roteamento de modelo (Jeff: top tier pra criar/alterar sistemas, mid pra análise, low pra trivial)
    #   Opus 4.8  = implementar/criar/alterar sistema, código, deploy, refactor, bug, build
    #   Sonnet 4.6 = pesquisa/análise/explicação/conversa rica
    #   Haiku 4.5  = trivial curto (saudação, ack, ≤15 palavras sem palavra forte)
    MSG_TEXT=$(sqlite3 "$DB" "$PENDING_TEXT_QUERY" 2>/dev/null || echo "")
    WORD_COUNT=$(echo "$MSG_TEXT" | wc -w)
    BUILD_RE='criar?|cria|crie|fazer|faz|implement(ar|a)|construir?|constro?i|desenvolver?|programar?|programa|refator(ar|a)|deploy|deployar|publicar?|subir?|instalar?|configur(ar|a)|ajust(ar|a|e)|alter(ar|a|e)|modific(ar|a|e)|atualiz(ar|a|e)|corrig(ir|e)|consert(ar|a|e)|c[oó]digo|sistema|aplicativo|app|plataforma|site|p[aá]gina|tela|bot[aã]o|menu|cadastro|formul[aá]rio|api|endpoint|webhook|banco|database|migra[cç][aã]o|bug|erro|crash|build|script|fun[cç][aã]o|componente|m[oó]dulo|integra[cç][aã]o'
    RESEARCH_RE='pesquis(ar|a|e)|analis(ar|a|e)|consult(ar|a|e)|verific(ar|a|e)|olhar?|ver?|busc(ar|a|e)|encontr(ar|a|e)|listar?|mostr(ar|a|e)|explic(ar|a|e)|resumir?|status|relat[oó]rio|m[eé]trica|dado|n[uú]mero|valor|pre[cç]o|quanto|quando|onde|por que|porque|comparar?|diferen[cç]a|opi[ãa]o|recomenda|sugere'
    HAS_GROUP=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE processed_by_agent=0 AND from_me=0 AND is_group=1;" 2>/dev/null || echo 0)
    if echo "$MSG_TEXT" | grep -qiE "$BUILD_RE"; then
      CLAUDE_MODEL="claude-opus-4-7"
    elif echo "$MSG_TEXT" | grep -qiE "$RESEARCH_RE" || [ "$WORD_COUNT" -gt 15 ] || [ "${HAS_GROUP:-0}" -gt 0 ]; then
      CLAUDE_MODEL="claude-sonnet-4-6"
    else
      CLAUDE_MODEL="claude-haiku-4-5-20251001"
    fi

    echo "{\"ts\":\"$(ts)\",\"count\":$PENDING2,\"ids\":\"$MSG_IDS\",\"model\":\"$CLAUDE_MODEL\",\"words\":$WORD_COUNT}" >> "$TRIGGER_LOG"
    log "spawning claude -p ($PENDING2 pending, ids=$MSG_IDS, model=$CLAUDE_MODEL, words=$WORD_COUNT)"
    cd "$WORKER_DIR"
    timeout "$RUN_TIMEOUT" "$CLAUDE_BIN" -p \
      --model "$CLAUDE_MODEL" \
      --strict-mcp-config \
      --output-format text \
      "Mensagens whitelist pendentes em data/worker.db (processed_by_agent=0 AND from_me=0). Siga o CLAUDE.md deste diretório: leia o histórico recente do(s) contato(s) com pendência, responda via scripts/wapi.sh, e marque processed_by_agent=1.

REGRA DE LATÊNCIA (crítica): tente responder em até 30s no caso simples. Se sentir que vai demorar mais (processar áudio longo, ler muito histórico, gerar documento, fazer várias chamadas externas), MANDE PRIMEIRO via wapi.sh um ack curto tipo 'só um minutinho, tô olhando aqui' ou 'me dá X min, tô fazendo', MARQUE IMEDIATAMENTE a msg como processed_by_agent=1 (UPDATE messages SET processed_by_agent=1 WHERE id=...) e SÓ DEPOIS faça o trabalho e mande a resposta final. Isso evita que o agent-runner re-spawne você processando a mesma msg em loop quando o trabalho passa de 5min. Não faça trabalho além do necessário pra responder.

Whitelist (sem pedir confirmação): Jefferson 5511910075450, Vinicius 5585991143501, equipe autorizada. Seja conciso. Termine quando todas estiverem processadas." \
      < /dev/null \
      >> "$LOG" 2>&1
    EC=$?
    log "claude -p finished exit=$EC"

    # Fail-safe contra loop infinito: se o claude -p timou (exit=124), assume
    # que ele provavelmente ja mandou resposta (5min e tempo suficiente pra
    # 1 wapi.sh send) mas nao chegou a marcar processed_by_agent=1. Marca
    # nos manualmente as msgs do batch como processadas pra evitar o proximo
    # ciclo pegar a mesma msg e gerar resposta duplicada.
    if [ "$EC" = "124" ] && [ -n "$MSG_IDS" ]; then
      sqlite3 "$DB" "UPDATE messages SET processed_by_agent=1 WHERE id IN ($MSG_IDS) AND processed_by_agent=0;" 2>/dev/null
      log "timeout (exit=124): marcadas msgs ids=$MSG_IDS como processed=1 (fail-safe anti-loop)"
    fi

    sleep "$COOLDOWN"
  else
    sleep "$POLL"
  fi
done
