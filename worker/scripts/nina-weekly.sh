#!/bin/bash
# Revisão semanal de conteúdo da Nina (social media) — segunda 9h BRT.
# Servidor está em Europe/Berlin: cron dispara 13h e 14h local e o script só segue
# se for 9h em São Paulo (cobre horário de verão europeu sem ajuste manual).
# Envia PARAR/MANTER/DOBRAR/TESTAR + próximos 7 dias pro Jeff e pro Vinicius.
set -u

WORKER_DIR="/opt/jeff-worker"
LOG_DIR="$WORKER_DIR/logs"
LOG="$LOG_DIR/nina-weekly.log"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"

mkdir -p "$LOG_DIR"
export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"
export HOME="/root"

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

[ "${1:-}" != "--force" ] && [ "$(TZ=America/Sao_Paulo date +%H)" != "09" ] && exit 0

log "nina-weekly started"

METRICS=$("$WORKER_DIR/scripts/social-metrics.sh" ig 12 2>>"$LOG")
log "metrics fetched: ${#METRICS} bytes"

cd "$WORKER_DIR"
timeout 540 "$CLAUDE_BIN" -p \
  --model sonnet \
  --output-format text \
  "Voce e a Nina, social media da Alpha. Leia /root/.claude/agents/nina-social-media.md (principios) e siga /root/.claude/skills/social-revisao-semanal/SKILL.md pro perfil @jeffhenrike.

Pasta do perfil: /opt/jeff-worker/projetos/nina/jeffhenrike/ (ler desempenho.md e calendario.md) e contexto da marca em /opt/jeff-worker/projetos/clientes/jeffhenrike/contexto.md (ler antes).

Metricas ja calculadas (saida de scripts/social-metrics.sh ig 12):
$METRICS

Passos:
1. Faca a revisao semanal completa conforme a skill, incluindo o placar das decisoes da semana passada se existirem.
2. Grave em desempenho.md e calendario.md conforme a skill.
3. Monte UMA mensagem de WhatsApp, curta e escaneavel: sem travessao, sem tabela markdown (listas), horarios em BRT, negrito com *asteriscos*. Abra com 'Otimo dia! Revisao semanal do Insta pela Nina:'. Blocos PARAR, MANTER, DOBRAR, TESTAR (1 a 3 linhas cada, citando post e numero) e depois os proximos 7 dias (1 linha por dia). Feche com: 'Quer que eu ja comece o primeiro conteudo da semana?'
4. Envie a MESMA mensagem pra Jeff e pra Vinicius via scripts/wapi.sh POST /messages/private, to=5511910075450 e to=5585991143501.
5. Nao publique nada, nao responda comentario, nao mande DM no Instagram. Nao invente numero: se as metricas vierem com erro, mande so pro Jeff avisando que a coleta falhou.

Encerre quando terminar." \
  >> "$LOG" 2>&1

EC=$?
log "nina-weekly finished exit=$EC"
