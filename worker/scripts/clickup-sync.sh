#!/bin/bash
# Poll incremental ClickUp -> SQLite. Cron */5.
# Usa /team/{id}/task com date_updated_gt = última sync (paginado).
# Detecta mudança de status, due_date e comentários novos -> grava em clickup_events.

set -u
DB="/opt/jeff-worker/data/worker.db"
LOG="/opt/jeff-worker/logs/clickup-sync.log"
LOCK="/tmp/clickup-sync.lock"
BASE="https://api.clickup.com/api/v2"

mkdir -p /opt/jeff-worker/logs
exec 9>"$LOCK"; flock -n 9 || exit 0

ts() { date -u +%FT%TZ; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

get_setting() { sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='$1';"; }
get_state() { sqlite3 "$DB" "SELECT value FROM clickup_state WHERE key='$1';"; }
set_state() { sqlite3 "$DB" "INSERT INTO clickup_state(key,value,updated_at) VALUES('$1','$2',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now');"; }

TOKEN=$(get_setting clickup_api_token)
WORKSPACE=$(get_setting clickup_workspace_id)
[ -z "$TOKEN" ] && { log "no token"; exit 2; }

LAST_SYNC=$(get_state last_sync_ms)
if [ -z "$LAST_SYNC" ]; then
  # primeira execução: pega últimos 30 dias
  LAST_SYNC=$(( ($(date +%s) - 30*86400) * 1000 ))
  log "first sync: backfilling last 30 days from $LAST_SYNC"
fi

NOW_MS=$(( $(date +%s) * 1000 ))

PAGE=0
NEW=0; UPD=0; EVT=0
while true; do
  RESP=$(curl -s -G "$BASE/team/$WORKSPACE/task" \
    -H "Authorization: $TOKEN" \
    --data-urlencode "page=$PAGE" \
    --data-urlencode "date_updated_gt=$LAST_SYNC" \
    --data-urlencode "include_closed=true" \
    --data-urlencode "subtasks=true" \
    --data-urlencode "order_by=updated" \
    --data-urlencode "reverse=true")
  COUNT=$(echo "$RESP" | jq '.tasks | length' 2>/dev/null)
  [ -z "$COUNT" ] || [ "$COUNT" = "null" ] && { log "page $PAGE empty/error: $(echo $RESP | head -c 200)"; break; }
  [ "$COUNT" = "0" ] && break

  # processa cada task: comparar com cache, gravar evento se mudou status ou due_date
  while IFS= read -r task; do
    TID=$(echo "$task" | jq -r .id)
    NAME=$(echo "$task" | jq -r .name)
    STATUS=$(echo "$task" | jq -r '.status.status')
    STATUS_TYPE=$(echo "$task" | jq -r '.status.type')
    DUE=$(echo "$task" | jq -r '.due_date // ""')
    PREV=$(sqlite3 -separator '|' "$DB" "SELECT status, due_date FROM clickup_tasks_cache WHERE task_id='$TID';")

    if [ -z "$PREV" ]; then
      NEW=$((NEW+1))
    else
      UPD=$((UPD+1))
      PREV_STATUS=$(echo "$PREV" | cut -d'|' -f1)
      PREV_DUE=$(echo "$PREV" | cut -d'|' -f2)
      if [ "$PREV_STATUS" != "$STATUS" ]; then
        sqlite3 "$DB" "INSERT INTO clickup_events(task_id,event_type,event_payload) VALUES('$TID','status_changed',json_object('from','$PREV_STATUS','to','$STATUS'));"
        EVT=$((EVT+1))
      fi
      if [ "$PREV_DUE" != "$DUE" ] && [ -n "$DUE" ]; then
        sqlite3 "$DB" "INSERT INTO clickup_events(task_id,event_type,event_payload) VALUES('$TID','due_changed',json_object('from','$PREV_DUE','to','$DUE'));"
        EVT=$((EVT+1))
      fi
    fi

    # upsert cache
    SPACE_ID=$(echo "$task" | jq -r '.space.id // ""')
    FOLDER_ID=$(echo "$task" | jq -r '.folder.id // ""')
    FOLDER_NAME=$(echo "$task" | jq -r '.folder.name // ""')
    LIST_ID=$(echo "$task" | jq -r '.list.id // ""')
    LIST_NAME=$(echo "$task" | jq -r '.list.name // ""')
    DESC=$(echo "$task" | jq -r '.description // ""')
    PRIO=$(echo "$task" | jq -r '.priority.orderindex // null')
    URL=$(echo "$task" | jq -r '.url // ""')
    DATE_C=$(echo "$task" | jq -r '.date_created // ""')
    DATE_U=$(echo "$task" | jq -r '.date_updated // ""')
    DATE_D=$(echo "$task" | jq -r '.date_done // ""')
    DATE_CL=$(echo "$task" | jq -r '.date_closed // ""')
    START=$(echo "$task" | jq -r '.start_date // ""')
    ASSIGN=$(echo "$task" | jq -c '.assignees // []')
    CREATOR=$(echo "$task" | jq -r '.creator.id // ""')
    PARENT=$(echo "$task" | jq -r '.parent // ""')
    RAW=$(echo "$task" | jq -c .)

    sqlite3 "$DB" <<SQL
INSERT INTO clickup_tasks_cache(task_id,workspace_id,space_id,folder_id,folder_name,list_id,list_name,name,description,status,status_type,priority,url,date_created,date_updated,date_done,date_closed,due_date,start_date,assignees_json,creator_id,parent_id,raw_json,cached_at)
VALUES('$TID','$WORKSPACE','$SPACE_ID','$FOLDER_ID',$(printf %s "$FOLDER_NAME" | jq -Rs .),'$LIST_ID',$(printf %s "$LIST_NAME" | jq -Rs .),$(printf %s "$NAME" | jq -Rs .),$(printf %s "$DESC" | jq -Rs .),$(printf %s "$STATUS" | jq -Rs .),'$STATUS_TYPE',$([ "$PRIO" = "null" ] && echo NULL || echo $PRIO),$(printf %s "$URL" | jq -Rs .),$([ -z "$DATE_C" ] && echo NULL || echo $DATE_C),$([ -z "$DATE_U" ] && echo NULL || echo $DATE_U),$([ -z "$DATE_D" ] && echo NULL || echo $DATE_D),$([ -z "$DATE_CL" ] && echo NULL || echo $DATE_CL),$([ -z "$DUE" ] && echo NULL || echo $DUE),$([ -z "$START" ] && echo NULL || echo $START),$(printf %s "$ASSIGN" | jq -Rs .),'$CREATOR','$PARENT',$(printf %s "$RAW" | jq -Rs .),datetime('now'))
ON CONFLICT(task_id) DO UPDATE SET
  space_id=excluded.space_id, folder_id=excluded.folder_id, folder_name=excluded.folder_name,
  list_id=excluded.list_id, list_name=excluded.list_name,
  name=excluded.name, description=excluded.description, status=excluded.status, status_type=excluded.status_type,
  priority=excluded.priority, url=excluded.url, date_updated=excluded.date_updated,
  date_done=excluded.date_done, date_closed=excluded.date_closed,
  due_date=excluded.due_date, start_date=excluded.start_date,
  assignees_json=excluded.assignees_json, raw_json=excluded.raw_json, cached_at=excluded.cached_at;
SQL
  done < <(echo "$RESP" | jq -c '.tasks[]')

  if [ "$COUNT" -lt 100 ]; then break; fi
  PAGE=$((PAGE+1))
  [ $PAGE -gt 50 ] && { log "page limit reached"; break; }
done

set_state last_sync_ms "$NOW_MS"
log "sync done: new=$NEW updated=$UPD events=$EVT"
