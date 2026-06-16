#!/bin/bash
# Monitora os grupos CIGC (Organização + Marketing) e avisa Jeff via DM quando há novo conteúdo.
# NÃO sobe para o Drive automaticamente — apenas quando Jeff pedir.
set -u

DB="/opt/jeff-worker/data/worker.db"
LOG="/opt/jeff-worker/logs/cigc-monitor.log"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"

CIGC_ORGANIZACAO="120363425829398689@g.us"
CIGC_MARKETING="120363407735664136@g.us"

SETTINGS_KEY_ORG="cigc_monitor_last_id_org"
SETTINGS_KEY_MKT="cigc_monitor_last_id_mkt"

POLL_INTERVAL=60
JEFF_PHONE="5511910075450"

mkdir -p "$(dirname "$LOG")"
ts() { date '+%Y-%m-%dT%H:%M:%SZ' -u; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

get_last_id() {
  local key="$1"
  sqlite3 "$DB" "SELECT COALESCE((SELECT value FROM app_settings WHERE key='$key'),'0');"
}

set_last_id() {
  local key="$1"
  local new_id="$2"
  sqlite3 "$DB" "INSERT OR REPLACE INTO app_settings(key,value) VALUES('$key','$new_id');"
}

classify_content() {
  local type="$1"
  local body="$2"
  case "$type" in
    image) echo "Imagem" ;;
    video) echo "Video" ;;
    ptt|audio) echo "Audio" ;;
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
        echo ""
      fi
      ;;
  esac
}

check_group() {
  local group_jid="$1"
  local settings_key="$2"
  local group_label="$3"

  local last_id
  last_id=$(get_last_id "$settings_key")

  local rows
  rows=$(sqlite3 "$DB" "SELECT id, type, COALESCE(body,''), author_name, timestamp
    FROM messages
    WHERE chat_id='$group_jid'
      AND from_me=0
      AND id > $last_id
    ORDER BY id ASC;")

  [ -z "$rows" ] && return

  local new_count=0
  local max_id="$last_id"
  local summary_lines=""

  while IFS='|' read -r id type body author ts_unix; do
    local kind
    kind=$(classify_content "$type" "$body")
    [ -z "$kind" ] && kind_check="" || kind_check="$kind"

    # Notificar apenas mensagens com link, mídia ou de participantes relevantes
    if [ -n "$kind_check" ]; then
      new_count=$((new_count + 1))
      local short_body
      short_body=$(printf '%s' "$body" | cut -c1-100)
      local author_display="${author:-Participante}"
      summary_lines="${summary_lines}- [${kind_check}] ${author_display}: ${short_body}
"
    fi

    [ "$id" -gt "$max_id" ] && max_id="$id"
  done <<< "$rows"

  set_last_id "$settings_key" "$max_id"

  if [ "$new_count" -gt 0 ]; then
    log "Grupo $group_label: $new_count item(ns) novo(s)"
    local msg="Material novo no grupo CIGC - ${group_label} (${new_count} item(ns)):
${summary_lines}
(Nao subi pro Drive - avise quando quiser que eu salve)"

    local msg_json
    msg_json=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" <<< "$msg" 2>/dev/null || printf '"%s"' "$(echo "$msg" | sed 's/"/\\"/g')")
    "$WAPI_SH" POST /messages/private "{\"to\":\"$JEFF_PHONE\",\"body\":$msg_json}" >> "$LOG" 2>&1
  fi
}

log "=== cigc-monitor iniciado. Org=${CIGC_ORGANIZACAO} | Mkt=${CIGC_MARKETING} | Poll=${POLL_INTERVAL}s ==="

while true; do
  check_group "$CIGC_ORGANIZACAO" "$SETTINGS_KEY_ORG" "Organizacao"
  check_group "$CIGC_MARKETING" "$SETTINGS_KEY_MKT" "Marketing"
  sleep "$POLL_INTERVAL"
done
