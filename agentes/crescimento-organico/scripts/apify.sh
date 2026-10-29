#!/bin/bash
# Helper Apify API — pesquisas Instagram via atores Apify (evita bloqueio do IG do Jeff).
# Token em app_settings.apify_api_key.
#
# Uso:
#   apify.sh whoami                                          info da conta
#   apify.sh profile <username> [resultsLimit]               detalhes do perfil + posts recentes
#   apify.sh posts <username> [limit]                        últimos N posts de um perfil
#   apify.sh reels <username> [limit]                        últimos N reels de um perfil
#   apify.sh hashtag <tag> [limit]                           posts de uma hashtag
#   apify.sh search <query> [limit]                          busca por hashtag/perfil/lugar
#   apify.sh comments <postUrl> [limit]                      comentários de um post
#   apify.sh actor <actor_id> <input_json>                   roda actor arbitrário sync
#   apify.sh raw <METHOD> <path> [body]                      chamada crua
set -u
DB="/opt/jeff-worker/data/worker.db"
BASE="https://api.apify.com/v2"

KEY=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='apify_api_key';")
if [ -z "$KEY" ]; then
  echo '{"error":"apify_api_key missing in app_settings"}'; exit 2
fi

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  local sep="?"; case "$path" in *\?*) sep="&";; esac
  if [ -n "$body" ]; then
    curl -sS --max-time 180 -X "$method" "$BASE$path${sep}token=$KEY" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS --max-time 180 -X "$method" "$BASE$path${sep}token=$KEY"
  fi
}

run_actor_sync() {
  local actor="$1"; local input="$2"
  api POST "/acts/${actor}/run-sync-get-dataset-items" "$input"
}

cmd="${1:-}"
case "$cmd" in
  whoami)
    api GET "/users/me"
    ;;
  profile)
    USER="${2:?usage: profile <username> [limit]}"
    LIMIT="${3:-12}"
    INPUT=$(cat <<JSON
{"usernames":["${USER}"],"resultsLimit":${LIMIT}}
JSON
)
    run_actor_sync "apify~instagram-profile-scraper" "$INPUT"
    ;;
  posts)
    USER="${2:?usage: posts <username> [limit]}"
    LIMIT="${3:-12}"
    INPUT=$(cat <<JSON
{"directUrls":["https://www.instagram.com/${USER}/"],"resultsType":"posts","resultsLimit":${LIMIT},"addParentData":false}
JSON
)
    run_actor_sync "apify~instagram-scraper" "$INPUT"
    ;;
  reels)
    USER="${2:?usage: reels <username> [limit]}"
    LIMIT="${3:-12}"
    INPUT=$(cat <<JSON
{"username":["${USER}"],"resultsLimit":${LIMIT}}
JSON
)
    run_actor_sync "apify~instagram-reel-scraper" "$INPUT"
    ;;
  hashtag)
    TAG="${2:?usage: hashtag <tag> [limit]}"
    LIMIT="${3:-30}"
    TAG="${TAG#\#}"
    INPUT=$(cat <<JSON
{"directUrls":["https://www.instagram.com/explore/tags/${TAG}/"],"resultsType":"posts","resultsLimit":${LIMIT},"addParentData":false}
JSON
)
    run_actor_sync "apify~instagram-scraper" "$INPUT"
    ;;
  search)
    Q="${2:?usage: search <query> [limit]}"
    LIMIT="${3:-30}"
    INPUT=$(cat <<JSON
{"search":"${Q}","searchType":"hashtag","searchLimit":${LIMIT},"resultsType":"posts","resultsLimit":${LIMIT}}
JSON
)
    run_actor_sync "apify~instagram-scraper" "$INPUT"
    ;;
  comments)
    URL="${2:?usage: comments <postUrl> [limit]}"
    LIMIT="${3:-50}"
    INPUT=$(cat <<JSON
{"directUrls":["${URL}"],"resultsType":"comments","resultsLimit":${LIMIT},"addParentData":false}
JSON
)
    run_actor_sync "apify~instagram-scraper" "$INPUT"
    ;;
  actor)
    ACTOR="${2:?usage: actor <actor_id> <input_json>}"
    INPUT="${3:?input_json required}"
    run_actor_sync "$ACTOR" "$INPUT"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    api "$METHOD" "$P" "$BODY"
    ;;
  *)
    cat <<USAGE
apify.sh — Apify API helper (Jeferson)

Comandos:
  whoami                                   info da conta
  profile <username> [limit]               detalhes + posts recentes
  posts <username> [limit]                 últimos N posts
  reels <username> [limit]                 últimos N reels
  hashtag <tag> [limit]                    posts da hashtag
  search <query> [limit]                   busca hashtag
  comments <postUrl> [limit]               comentários de um post
  actor <actor_id> <input_json>            actor arbitrário sync
  raw <METHOD> <path> [body]               chamada crua

Atores principais:
  apify~instagram-scraper          (posts/comments/hashtag)
  apify~instagram-profile-scraper  (perfil + bio)
  apify~instagram-reel-scraper     (reels)

Exemplos:
  apify.sh whoami
  apify.sh profile lucas.labastie 6
  apify.sh posts jefersonhenrike 5
  apify.sh hashtag coaching 20
USAGE
    exit 1
    ;;
esac
