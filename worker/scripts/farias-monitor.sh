#!/bin/bash
# Monitora o grupo ADM Farias e salva materiais novos na planilha de referências.
# Roda como processo PM2 em loop contínuo.
set -u

DB="/opt/jeff-worker/data/worker.db"
LOG="/opt/jeff-worker/logs/farias-monitor.log"
GOOGLE_SH="/opt/jeff-worker/scripts/google.sh"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
GOOGLE_USER="jefersonhenrike1@gmail.com"
SHEET_ID="1PMvrgoKEDm4MD1j-63JY2aIYpLeRbdK4RTpOHzUCvmQ"
SHEET_RANGE="Referências!A:D"
FARIAS_GROUP="120363428145019327@g.us"
FARIAS_NAME="Farias souza"
SETTINGS_KEY="farias_monitor_last_id"
POLL_INTERVAL=60  # segundos entre verificações

mkdir -p "$(dirname "$LOG")"
ts() { date '+%Y-%m-%dT%H:%M:%SZ' -u; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

get_last_id() {
  sqlite3 "$DB" "SELECT COALESCE((SELECT value FROM app_settings WHERE key='$SETTINGS_KEY'),'0');"
}

set_last_id() {
  local new_id="$1"
  sqlite3 "$DB" "INSERT OR REPLACE INTO app_settings(key,value) VALUES('$SETTINGS_KEY','$new_id');"
}

classify_content() {
  local type="$1"
  local body="$2"
  case "$type" in
    image) echo "Imagem" ;;
    video) echo "Vídeo" ;;
    ptt|audio) echo "Áudio" ;;
    document) echo "Documento" ;;
    *)
      if echo "$body" | grep -qiE 'youtube\.com|youtu\.be'; then
        echo "Link YouTube"
      elif echo "$body" | grep -qiE 'docs\.google\.com/document'; then
        echo "Google Doc"
      elif echo "$body" | grep -qiE 'docs\.google\.com/spreadsheets'; then
        echo "Google Sheets"
      elif echo "$body" | grep -qiE 'drive\.google\.com'; then
        echo "Google Drive"
      elif echo "$body" | grep -qiE 'instagram\.com'; then
        echo "Link Instagram"
      elif echo "$body" | grep -qiE 'https?://'; then
        echo "Link"
      else
        echo "Texto"
      fi
      ;;
  esac
}

process_message() {
  local id="$1"
  local type="$2"
  local body="$3"
  local ts_unix="$4"

  # ignorar mensagens sem conteúdo relevante (texto sem URL e sem mídia)
  if [ "$type" = "chat" ]; then
    if ! echo "$body" | grep -qiE 'https?://'; then
      return 0
    fi
  fi

  local ts_brt
  ts_brt=$(date -d "@$ts_unix" '+%d/%m/%Y %H:%M' 2>/dev/null || \
           python3 -c "import datetime,sys; t=int(sys.argv[1]); print((datetime.datetime.utcfromtimestamp(t)-datetime.timedelta(hours=-3)).strftime('%d/%m/%Y %H:%M'))" "$ts_unix" 2>/dev/null || \
           date '+%d/%m/%Y %H:%M')

  local kind
  kind=$(classify_content "$type" "$body")

  local content="$body"
  if [ -z "$content" ] || [ "$content" = "null" ]; then
    content="[${type}]"
  fi

  # escapa aspas para JSON
  local content_json
  content_json=$(printf '%s' "$content" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || \
                 printf '%s' "$content" | sed 's/"/\\"/g')

  local ts_json
  ts_json=$(printf '%s' "$ts_brt" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || \
            printf '"%s"' "$ts_brt")

  local kind_json
  kind_json=$(printf '%s' "$kind" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || \
              printf '"%s"' "$kind")

  local row="[[$ts_json,$kind_json,$content_json,\"Farias (ADM Group)\"]]"

  log "Appending id=$id tipo=$kind"
  "$GOOGLE_SH" sheets-append "$GOOGLE_USER" "$SHEET_ID" "$SHEET_RANGE" "$row" >> "$LOG" 2>&1
}

check_new_messages() {
  local last_id
  last_id=$(get_last_id)

  local rows
  rows=$(sqlite3 "$DB" "SELECT id, type, COALESCE(body,''), timestamp
    FROM messages
    WHERE chat_id='$FARIAS_GROUP'
      AND LOWER(author_name)=LOWER('$FARIAS_NAME')
      AND from_me=0
      AND id > $last_id
    ORDER BY id ASC;")

  if [ -z "$rows" ]; then
    return
  fi

  local new_count=0
  local max_id="$last_id"
  local summary_lines=""

  while IFS='|' read -r id type body ts_unix; do
    process_message "$id" "$type" "$body" "$ts_unix"
    new_count=$((new_count + 1))
    max_id="$id"
    # resumo de até 3 linhas para DM do Jeff
    if [ $new_count -le 3 ]; then
      local short_body
      short_body=$(printf '%s' "$body" | cut -c1-80)
      summary_lines="${summary_lines}- [${type}] ${short_body}
"
    fi
  done <<< "$rows"

  set_last_id "$max_id"
  log "Processados $new_count materiais novos do Farias. last_id=$max_id"

  if [ $new_count -gt 0 ]; then
    local msg="Material novo do Farias no grupo ADM ($new_count item(ns)):
${summary_lines}
Salvei na planilha Referências."
    "$WAPI_SH" POST /messages/private "{\"to\":\"5511910075450\",\"body\":$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" <<< "$msg" 2>/dev/null || printf '"%s"' "$(echo "$msg" | sed 's/"/\\"/g')")}" >> "$LOG" 2>&1
  fi
}

log "=== farias-monitor iniciado. Grupo=$FARIAS_GROUP | Autor='$FARIAS_NAME' | Poll=${POLL_INTERVAL}s ==="

while true; do
  check_new_messages
  sleep "$POLL_INTERVAL"
done
