#!/bin/bash
# Creator Lab (Artem Novitckii, MIT) — pesquisa de Reels pra Nina.
# Coleta Reels de um perfil público (Apify), transcreve (Groq Whisper), classifica gancho,
# estrutura, CTA e tema (Jev/TypeSafe) e cruza com plays/curtidas. Roda só em 127.0.0.1.
# App em /opt/jeff-apps/jeff-creator-lab. Chaves no app_settings (nunca em .env):
#   apify_api_token | groq_api_key | typesafe_api_key
#
# Uso:
#   creator-lab.sh start | stop | status
#   creator-lab.sh check                               confere as 3 chaves (não gasta)
#   creator-lab.sh analyze <perfil> [reels=20] [idioma=pt] [teto_apify_usd=1] [paralelo=2]
#   creator-lab.sh runs                                lista análises
#   creator-lab.sh show <run_id>                       status e progresso
#   creator-lab.sh resume <run_id>                     retoma (não cobra coleta de novo)
#   creator-lab.sh metrics <run_id> [mechanism|structure|cta|topic]   mediana de plays por rótulo
#   creator-lab.sh export <run_id> [arquivo.json]      exporta posts + transcrição + rótulos
# Regra: análise nova custa Apify. Pra tentar de novo use resume, nunca analyze outra vez.
set -u
APP=/opt/jeff-apps/jeff-creator-lab
DB=/opt/jeff-worker/data/worker.db
LOG=/opt/jeff-worker/logs/creator-lab.log
PORT=5190
BASE="http://127.0.0.1:$PORT"
NODE=/root/.nvm/versions/node/v20.20.2/bin/node

setting() { sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='$1';"; }
up() { curl -s -o /dev/null -m 3 "$BASE/api/bootstrap"; }
token() { curl -s -m 10 "$BASE/api/bootstrap" | jq -r .token; }
api() { # method path [json]
  local t; t=$(token)
  if [ -n "${3:-}" ]; then curl -s -m 60 -X "$1" "$BASE$2" -H "x-lab-token: $t" -H 'Content-Type: application/json' -d "$3"
  else curl -s -m 60 -X "$1" "$BASE$2" -H "x-lab-token: $t"; fi
}
ensure() { up || "$0" start >/dev/null; up || { echo '{"error":"creator-lab não subiu, ver logs/creator-lab.log"}'; exit 2; }; }

cmd="${1:-}"
case "$cmd" in
  start)
    if up; then echo '{"status":"já rodando","url":"'$BASE'"}'; exit 0; fi
    APIFY=$(setting apify_api_token); [ -z "$APIFY" ] && APIFY=$(setting apify_api_key)
    GROQ=$(setting groq_api_key); JEV=$(setting typesafe_api_key)
    cd "$APP" && APIFY_TOKEN="$APIFY" GROQ_API_KEY="$GROQ" TYPESAFE_API_KEY="$JEV" \
      TRANSCRIPTION_PROVIDER=groq GROQ_REQUESTS_PER_MINUTE=20 PORT=$PORT \
      setsid nohup "$NODE" server.mjs >> "$LOG" 2>&1 < /dev/null &
    for i in $(seq 1 20); do up && break; sleep 0.5; done
    up && echo '{"status":"rodando","url":"'$BASE'"}' || { echo '{"error":"não subiu"}'; tail -5 "$LOG"; exit 2; }
    ;;
  stop)
    P=$(ss -ltnp | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
    # só mata se o processo da porta for o server.mjs desta pasta
    [ -n "$P" ] && [ "$(readlink /proc/$P/cwd)" = "$APP" ] && kill "$P"
    echo '{"status":"parado"}' ;;
  status)
    up && curl -s "$BASE/api/bootstrap" | jq '{rodando:true, conexoes:.connections, analises:(.runs|length)}' || echo '{"rodando":false}' ;;
  check)
    ensure; api POST /api/connections/check | jq 'with_entries(.value |= {ok:.verified, erro:(.error // null)})' ;;
  analyze)
    PERFIL="${2:?uso: analyze <perfil> [reels] [idioma] [teto_usd] [paralelo]}"; PERFIL="${PERFIL#@}"
    ensure
    BODY=$(jq -cn --arg c "$PERFIL" --argjson l "${3:-20}" --arg lang "${4:-pt}" --argjson b "${5:-1}" --argjson p "${6:-2}" '{creator:$c,limit:$l,language:$lang,budget:$b,concurrency:$p}')
    RUN=$(api POST /api/runs "$BODY"); ID=$(echo "$RUN" | jq -r '.id // empty')
    [ -z "$ID" ] && { echo "$RUN"; exit 2; }
    api POST "/api/runs/$ID/run" '{}' | jq '{id, creator, status, limit}' ;;
  runs)
    ensure; curl -s "$BASE/api/bootstrap" | jq '[.runs[] | {id, creator, status, createdAt}]' ;;
  show)
    ensure; api GET "/api/runs/${2:?run_id}" | jq '{id, creator, status, error, limit, posts:(.posts|length), costs, elapsedMs}' ;;
  resume)
    ensure; api POST "/api/runs/${2:?run_id}/run" '{}' | jq '{id, status}' ;;
  metrics)
    ensure; api GET "/api/runs/${2:?run_id}/metrics?dimension=${3:-structure}&metric=views" ;;
  export)
    ensure; OUT="${3:-/tmp/creator-lab-${2:?run_id}.json}"; api GET "/api/runs/$2/export" > "$OUT"; echo "{\"arquivo\":\"$OUT\",\"bytes\":$(stat -c %s "$OUT")}" ;;
  *) sed -n 2,20p "$0"; exit 1 ;;
esac
