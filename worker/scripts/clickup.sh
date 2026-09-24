#!/bin/bash
# Helper ClickUp API — gestão de tarefas do Zeus.
# Token em app_settings.clickup_api_token. Workspace em clickup_workspace_id.
#
# Uso:
#   clickup.sh whoami                                       usuário do token
#   clickup.sh teams                                        workspaces visíveis
#   clickup.sh spaces                                       spaces do workspace ZEUS
#   clickup.sh folders <space_id>                           folders de um space
#   clickup.sh lists <folder_id>                            listas dentro do folder
#   clickup.sh lists-folderless <space_id>                  listas folderless do space
#   clickup.sh tasks <list_id> [include_closed]             tasks da lista (default: open)
#   clickup.sh task <task_id>                               detalhes de uma task
#   clickup.sh team-tasks [filters...]                      tasks do workspace c/ filtros
#   clickup.sh create <list_id> <name> [json_extra]         cria task (extra: assignees/due_date/priority/description)
#   clickup.sh update <task_id> <json>                      atualiza task
#   clickup.sh status <task_id> <status_name>               muda status (atalho)
#   clickup.sh close <task_id>                              fecha (atalho status=concluído)
#   clickup.sh comment <task_id> <texto> [assignee_id]      posta comentário
#   clickup.sh due-today                                    tasks com due hoje (cache local)
#   clickup.sh overdue                                      tasks vencidas em aberto (cache local)
#   clickup.sh assigned <user_id>                           tasks abertas atribuídas a um user (cache local)
#   clickup.sh create-space <name>                          cria space
#   clickup.sh create-folder <space_id> <name>              cria folder
#   clickup.sh create-list <folder_id> <name>               cria list em folder
#   clickup.sh create-list-folderless <space_id> <name>     cria list folderless em space
#   clickup.sh archive-list <list_id>                       arquiva list (PUT archived=true)
#   clickup.sh delete-list <list_id>                        deleta list
#   clickup.sh raw <method> <path> [body]                   chamada crua na API

set -u
DB="/opt/jeff-worker/data/worker.db"
BASE="https://api.clickup.com/api/v2"

get_setting() { sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='$1';"; }

TOKEN=$(get_setting clickup_api_token)
WORKSPACE=$(get_setting clickup_workspace_id)

if [ -z "$TOKEN" ]; then
  echo '{"error":"clickup_api_token missing in app_settings"}'; exit 2
fi

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" \
      -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$BASE$path" \
      -H "Authorization: $TOKEN"
  fi
}

cmd="${1:-}"
case "$cmd" in
  whoami)
    api GET /user ;;
  teams)
    api GET /team ;;
  spaces)
    api GET "/team/$WORKSPACE/space?archived=false" ;;
  folders)
    [ -z "${2:-}" ] && { echo '{"error":"usage: folders <space_id>"}'; exit 1; }
    api GET "/space/$2/folder?archived=false" ;;
  lists)
    [ -z "${2:-}" ] && { echo '{"error":"usage: lists <folder_id>"}'; exit 1; }
    api GET "/folder/$2/list?archived=false" ;;
  lists-folderless)
    [ -z "${2:-}" ] && { echo '{"error":"usage: lists-folderless <space_id>"}'; exit 1; }
    api GET "/space/$2/list?archived=false" ;;
  tasks)
    [ -z "${2:-}" ] && { echo '{"error":"usage: tasks <list_id> [include_closed]"}'; exit 1; }
    INC="${3:-false}"
    api GET "/list/$2/task?archived=false&subtasks=true&include_closed=$INC" ;;
  task)
    [ -z "${2:-}" ] && { echo '{"error":"usage: task <task_id>"}'; exit 1; }
    api GET "/task/$2?include_subtasks=true" ;;
  team-tasks)
    shift
    Q=""; for arg in "$@"; do Q="$Q&$arg"; done
    api GET "/team/$WORKSPACE/task?archived=false${Q}" ;;
  create)
    [ -z "${3:-}" ] && { echo '{"error":"usage: create <list_id> <name> [json_extra]"}'; exit 1; }
    LIST="$2"; NAME="$3"; EXTRA="${4:-}"
    # se EXTRA tem due_date e nao tem due_date_time, adiciona true (respeita hora exata)
    if [ -n "$EXTRA" ]; then
      EXTRA=$(echo "$EXTRA" | jq -c 'if has("due_date") and (has("due_date_time")|not) then . + {due_date_time:true} else . end')
      BODY=$(jq -nc --arg n "$NAME" --argjson e "$EXTRA" '$e + {name:$n}')
    else
      BODY=$(jq -nc --arg n "$NAME" '{name:$n}')
    fi
    api POST "/list/$LIST/task" "$BODY" ;;
  update)
    [ -z "${3:-}" ] && { echo '{"error":"usage: update <task_id> <json>"}'; exit 1; }
    api PUT "/task/$2" "$3" ;;
  status)
    [ -z "${3:-}" ] && { echo '{"error":"usage: status <task_id> <status_name>"}'; exit 1; }
    BODY=$(jq -nc --arg s "$3" '{status:$s}')
    api PUT "/task/$2" "$BODY" ;;
  close)
    [ -z "${2:-}" ] && { echo '{"error":"usage: close <task_id>"}'; exit 1; }
    api PUT "/task/$2" '{"status":"concluído"}' ;;
  comment)
    [ -z "${3:-}" ] && { echo '{"error":"usage: comment <task_id> <texto> [assignee_id]"}'; exit 1; }
    if [ -n "${4:-}" ]; then
      BODY=$(jq -nc --arg t "$3" --arg a "$4" '{comment_text:$t, assignee:($a|tonumber), notify_all:true}')
    else
      BODY=$(jq -nc --arg t "$3" '{comment_text:$t, notify_all:true}')
    fi
    api POST "/task/$2/comment" "$BODY" ;;
  due-today)
    NOW=$(date +%s); START=$(date -d "today 00:00" +%s); END=$(date -d "tomorrow 00:00" +%s)
    sqlite3 -json "$DB" "SELECT task_id, name, status, due_date, list_name, assignees_json, url FROM clickup_tasks_cache WHERE status_type != 'closed' AND due_date IS NOT NULL AND due_date >= ${START}000 AND due_date < ${END}000 ORDER BY due_date ASC" ;;
  overdue)
    NOW_MS=$(($(date +%s) * 1000))
    sqlite3 -json "$DB" "SELECT task_id, name, status, due_date, list_name, assignees_json, url FROM clickup_tasks_cache WHERE status_type != 'closed' AND due_date IS NOT NULL AND due_date < ${NOW_MS} ORDER BY due_date ASC" ;;
  assigned)
    [ -z "${2:-}" ] && { echo '{"error":"usage: assigned <user_id>"}'; exit 1; }
    # assignees_json é gravado com espaço depois dos dois pontos ("id": 123); o LIKE aceita as duas formas
    sqlite3 -json "$DB" "SELECT task_id, name, status, due_date, list_name, url FROM clickup_tasks_cache WHERE status_type != 'closed' AND (assignees_json LIKE '%\"id\": ${2},%' OR assignees_json LIKE '%\"id\":${2},%' OR assignees_json LIKE '%\"id\": ${2}}%' OR assignees_json LIKE '%\"id\":${2}}%') ORDER BY due_date ASC NULLS LAST" ;;
  recent-chase)
    [ -z "${2:-}" ] && { echo '{"error":"usage: recent-chase <user_id> [hours=24]"}'; exit 1; }
    HOURS="${3:-24}"
    sqlite3 -json "$DB" "SELECT cl.task_id, cl.chase_level, cl.sent_at, c.name, c.list_name, c.status, c.url, c.due_date FROM clickup_chase_log cl JOIN clickup_tasks_cache c ON c.task_id=cl.task_id WHERE cl.assignee_id='${2}' AND cl.sent_at >= datetime('now','-${HOURS} hours') ORDER BY cl.sent_at DESC" ;;
  search)
    [ -z "${2:-}" ] && { echo '{"error":"usage: search <texto>"}'; exit 1; }
    Q=$(printf '%s' "$2" | sed "s/'/''/g")
    sqlite3 -json "$DB" "SELECT task_id, name, list_name, status, url FROM clickup_tasks_cache WHERE status_type != 'closed' AND lower(name) LIKE lower('%${Q}%') LIMIT 10" ;;
  create-space)
    [ -z "${2:-}" ] && { echo '{"error":"usage: create-space <name>"}'; exit 1; }
    BODY=$(jq -nc --arg n "$2" '{name:$n, multiple_assignees:true, features:{due_dates:{enabled:true,start_date:true,remap_due_dates:false,remap_closed_due_date:false}, time_tracking:{enabled:true}, tags:{enabled:true}, time_estimates:{enabled:true}, checklists:{enabled:true}, custom_fields:{enabled:true}, remap_dependencies:{enabled:true}, dependency_warning:{enabled:true}, portfolios:{enabled:true}}}')
    api POST "/team/$WORKSPACE/space" "$BODY" ;;
  create-folder)
    [ -z "${3:-}" ] && { echo '{"error":"usage: create-folder <space_id> <name>"}'; exit 1; }
    api POST "/space/$2/folder" "$(jq -nc --arg n "$3" '{name:$n}')" ;;
  create-list)
    [ -z "${3:-}" ] && { echo '{"error":"usage: create-list <folder_id> <name>"}'; exit 1; }
    api POST "/folder/$2/list" "$(jq -nc --arg n "$3" '{name:$n}')" ;;
  create-list-folderless)
    [ -z "${3:-}" ] && { echo '{"error":"usage: create-list-folderless <space_id> <name>"}'; exit 1; }
    api POST "/space/$2/list" "$(jq -nc --arg n "$3" '{name:$n}')" ;;
  archive-list)
    [ -z "${2:-}" ] && { echo '{"error":"usage: archive-list <list_id>"}'; exit 1; }
    api PUT "/list/$2" '{"archived":true}' ;;
  delete-list)
    [ -z "${2:-}" ] && { echo '{"error":"usage: delete-list <list_id>"}'; exit 1; }
    api DELETE "/list/$2" ;;
  archive-folder)
    [ -z "${2:-}" ] && { echo '{"error":"usage: archive-folder <folder_id>"}'; exit 1; }
    api PUT "/folder/$2" '{"archived":true}' ;;
  rename-space)
    [ -z "${3:-}" ] && { echo '{"error":"usage: rename-space <space_id> <new_name>"}'; exit 1; }
    api PUT "/space/$2" "$(jq -nc --arg n "$3" '{name:$n}')" ;;
  raw)
    [ -z "${3:-}" ] && { echo '{"error":"usage: raw <method> <path> [body]"}'; exit 1; }
    api "$2" "$3" "${4:-}" ;;
  *)
    sed -n '2,33p' "$0" | sed 's/^# *//'
    exit 1 ;;
esac
