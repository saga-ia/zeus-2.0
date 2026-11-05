#!/bin/bash
# Relatório diário Farias Souza — 21h BRT (02h CEST / 00h UTC).
# Puxa dados Meta Ads + IG + mensagens comerciais do dia e gera relatório via Claude.
# Envia pro Jeff (5511910075450) e pra Farias (5511951006000).
set -u

WORKER_DIR="/opt/jeff-worker"
DB="$WORKER_DIR/data/worker.db"
LOG_DIR="$WORKER_DIR/logs"
LOG="$LOG_DIR/farias-daily-report.log"
CLAUDE_BIN="/root/.nvm/versions/node/v20.20.2/bin/claude"

mkdir -p "$LOG_DIR"
export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"
export HOME="/root"

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "farias-daily-report started"

cd "$WORKER_DIR"

# Dados Meta Ads da conta Board Academy (Farias)
META_DATA=$(scripts/meta-ads.sh insights 1180414197299732 today 2>/dev/null)
log "meta insights fetched: ${#META_DATA} bytes"

# Dados de campanhas ativas
CAMPAIGNS=$(scripts/meta-ads.sh campaigns 1180414197299732 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  active = [c for c in d.get('data',[]) if c.get('status','') in ('ACTIVE','LEARNING','LEARNING_LIMITED')]
  print(f'{len(active)} campanhas ativas')
except:
  print('dados indisponíveis')
" 2>/dev/null)
log "campaigns: $CAMPAIGNS"

# Mensagens comerciais do dia no grupo ADM Farias (Leonora/squad)
FARIAS_GROUP="120363428145019327@g.us"
TODAY_BRT=$(TZ="America/Sao_Paulo" date '+%Y-%m-%d')
COMERCIAL_MSGS=$(sqlite3 "$DB" "
SELECT datetime(timestamp,'unixepoch','-3 hours') || ' | ' || author_name || ': ' || COALESCE(SUBSTR(body,1,200),SUBSTR(transcription,1,200),'[mídia]')
FROM messages
WHERE chat_id='$FARIAS_GROUP'
  AND from_me=0
  AND date(datetime(timestamp,'unixepoch','-3 hours')) = '$TODAY_BRT'
ORDER BY timestamp ASC
LIMIT 50;")
log "comercial msgs: $(echo "$COMERCIAL_MSGS" | wc -l) linhas"

# Posts do IG via Apify (últimas 24h do perfil fariassouza.oficial)
IG_DATA=$(scripts/apify.sh posts fariassouza.oficial 5 2>/dev/null | python3 -c "
import sys, json
from datetime import datetime, timedelta, timezone
try:
  posts = json.load(sys.stdin)
  cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
  today_posts = []
  for p in posts:
    ts = p.get('timestamp','') or p.get('takenAt','')
    try:
      dt = datetime.fromisoformat(ts.replace('Z','+00:00'))
      if dt >= cutoff:
        today_posts.append({'tipo': p.get('type','post'), 'likes': p.get('likesCount',0), 'comments': p.get('commentsCount',0), 'reach': p.get('videoViewCount',0) or p.get('playCount',0)})
    except:
      pass
  print(json.dumps(today_posts))
except:
  print('[]')
" 2>/dev/null)
log "ig data: $IG_DATA"

timeout 300 "$CLAUDE_BIN" -p \
  --output-format text \
  "Rotina de relatório diário Farias Souza — execute conforme o CLAUDE.md.

Data BRT de hoje: $TODAY_BRT

DADOS META ADS (conta 1180414197299732 - Board Academy, hoje):
$META_DATA

RESUMO CAMPANHAS:
$CAMPAIGNS

MENSAGENS DO GRUPO ADM FARIAS (Leonora/squad hoje, $TODAY_BRT):
$COMERCIAL_MSGS

POSTS IG FARIASSOUZA.OFICIAL (últimas 24h via Apify):
$IG_DATA

TAREFA:
1. Monte o RELATÓRIO DIÁRIO no formato abaixo (sem inventar dados — use 'N/D' se dado ausente):

*RELATÓRIO DIÁRIO · FARIAS SOUZA*
Data: DD/MM/AAAA

*ANÚNCIOS (META)*
Investido no dia: R$ X,XX
Campanhas ativas: N
Cadastros (leads): N
Custo por cadastro: R$ X,XX
Alcance: X pessoas
Cliques: N
Conversas iniciadas: N

*INSTAGRAM @fariassouza.oficial*
Publicações no dia: N
Alcance somado: N
Curtidas: N
Comentários: N

*COMERCIAL (Leonora / Squad Farias)*
(extraia das mensagens do grupo ADM o resumo de prospecções, respostas, vendas do dia — se não houver dados claros, escreva 'Sem dados reportados hoje')

*LEITURA DO DIA*
(2-3 frases: o que mais se destacou nos dados, comparativo com ontem se possível)

*PRÓXIMO PASSO*
1. (ação concreta baseada nos dados)
2. (ação concreta)
3. (ação concreta)

2. Envie DUAS mensagens:
   a) Para Jeff (5511910075450): o relatório completo exatamente como montado acima.
   b) Para Farias (5511951006000): a mesma coisa mas com este cabeçalho antes do relatório:
      'Boa noite, segue o relatório de trabalho do dia.'
      (linha em branco)
      (o relatório)

3. Use scripts/wapi.sh POST /messages/private com to=<phone> e body=<texto>.
4. Não mande para mais ninguém.
5. Encerre quando as duas mensagens forem enviadas.

IMPORTANTE: Sem em-dashes (— ou –) no texto enviado. Use ponto e vírgula ou ponto normal." \
  >> "$LOG" 2>&1

EC=$?
log "farias-daily-report finished exit=$EC"
