#!/bin/bash
# Helper Google APIs — Contacts/Drive/Gmail/Calendar/Sheets via OAuth.
# Tokens em google_oauth_tokens (worker.db). Refresh automático via /oauth/refresh.
#
# Uso:
#   google.sh accounts                                 lista contas conectadas
#   google.sh token <user_key>                         retorna access_token (refresh se expirou)
#   google.sh contacts <user_key> [query]              busca contatos (People API)
#   google.sh gmail-list <user_key> [q]                lista threads recentes do Gmail
#   google.sh drive-list <user_key> [q]                lista arquivos do Drive
#   google.sh calendar-list <user_key>                 próximos 10 eventos do Calendar
#   google.sh sheets-get <user_key> <sheet_id> <range> lê range duma planilha
#   google.sh raw <user_key> <method> <url> [body]     chamada crua na API Google
set -u
DB="/opt/jeff-worker/data/worker.db"
LOCAL="http://127.0.0.1:3018"

resolve_token() {
  local user_key="$1"
  # check expiry
  local expires
  expires=$(sqlite3 "$DB" "SELECT expires_at FROM google_oauth_tokens WHERE provider='google' AND user_key='$user_key';")
  if [ -z "$expires" ]; then
    echo "ERROR: user_key '$user_key' não encontrado" >&2
    return 1
  fi
  # se expirou, dispara refresh
  local now
  now=$(date -u +"%Y-%m-%d %H:%M:%S")
  if [[ "$expires" < "$now" ]]; then
    curl -s -X POST "$LOCAL/oauth/refresh/$user_key" >/dev/null
  fi
  sqlite3 "$DB" "SELECT access_token FROM google_oauth_tokens WHERE provider='google' AND user_key='$user_key';"
}

call() {
  local user_key="$1"; local method="$2"; local url="$3"; local body="${4:-}"
  local tok
  tok=$(resolve_token "$user_key") || return 1
  if [ -n "$body" ]; then
    curl -s -X "$method" "$url" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "$body"
  else
    curl -s -X "$method" "$url" -H "Authorization: Bearer $tok"
  fi
}

cmd="${1:-}"
case "$cmd" in
  accounts)
    sqlite3 -header -column "$DB" "SELECT user_key, expires_at, updated_at FROM google_oauth_tokens WHERE provider='google' ORDER BY updated_at DESC;"
    ;;
  token)
    UK="${2:?usage: token <user_key>}"
    resolve_token "$UK"
    ;;
  contacts)
    UK="${2:?usage: contacts <user_key> [query]}"
    Q="${3:-}"
    if [ -n "$Q" ]; then
      QENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$Q")
      call "$UK" GET "https://people.googleapis.com/v1/people:searchContacts?query=$QENC&readMask=names,emailAddresses,phoneNumbers"
    else
      call "$UK" GET "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=100"
    fi
    ;;
  gmail-list)
    UK="${2:?usage: gmail-list <user_key> [q]}"
    Q="${3:-}"
    QENC=""
    [ -n "$Q" ] && QENC="?q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$Q")"
    call "$UK" GET "https://gmail.googleapis.com/gmail/v1/users/me/threads$QENC"
    ;;
  drive-list)
    UK="${2:?usage: drive-list <user_key> [q]}"
    Q="${3:-}"
    QENC=""
    [ -n "$Q" ] && QENC="&q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$Q")"
    call "$UK" GET "https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,createdTime,webViewLink)$QENC"
    ;;
  calendar-list)
    UK="${2:?usage: calendar-list <user_key>}"
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    call "$UK" GET "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=$NOW&maxResults=10"
    ;;
  sheets-get)
    UK="${2:?usage: sheets-get <user_key> <sheet_id> <range>}"
    SID="${3:?sheet_id required}"
    RNG="${4:?range required (ex: Sheet1!A1:D)}"
    RNGENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$RNG")
    call "$UK" GET "https://sheets.googleapis.com/v4/spreadsheets/$SID/values/$RNGENC"
    ;;
  sheets-append)
    UK="${2:?usage: sheets-append <user_key> <sheet_id> <range> <json_values>}"
    SID="${3:?sheet_id required}"
    RNG="${4:?range required}"
    VALUES="${5:?json values required, ex: [[\"a\",\"b\"]]}"
    RNGENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$RNG")
    call "$UK" POST "https://sheets.googleapis.com/v4/spreadsheets/$SID/values/$RNGENC:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS" "{\"values\":$VALUES}"
    ;;
  drive-upload)
    UK="${2:?usage: drive-upload <user_key> <file_path> [folder_id] [mime]}"
    FP="${3:?file_path required}"
    FOLDER="${4:-}"
    MIME="${5:-}"
    [ ! -f "$FP" ] && { echo "{\"error\":\"file not found: $FP\"}"; exit 2; }
    TOK=$(resolve_token "$UK") || exit 2
    [ -z "$MIME" ] && MIME=$(file -b --mime-type "$FP")
    NAME=$(basename "$FP")
    # multipart upload — boundary
    BOUNDARY="boundary-$(date +%s%N)"
    META_FILE=$(mktemp)
    if [ -n "$FOLDER" ]; then
      printf '{"name":"%s","parents":["%s"]}' "$NAME" "$FOLDER" > "$META_FILE"
    else
      printf '{"name":"%s"}' "$NAME" > "$META_FILE"
    fi
    BODY_FILE=$(mktemp)
    {
      printf -- "--%s\r\n" "$BOUNDARY"
      printf "Content-Type: application/json; charset=UTF-8\r\n\r\n"
      cat "$META_FILE"
      printf "\r\n--%s\r\n" "$BOUNDARY"
      printf "Content-Type: %s\r\n\r\n" "$MIME"
      cat "$FP"
      printf "\r\n--%s--\r\n" "$BOUNDARY"
    } > "$BODY_FILE"
    curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink" \
      -H "Authorization: Bearer $TOK" \
      -H "Content-Type: multipart/related; boundary=$BOUNDARY" \
      --data-binary "@$BODY_FILE"
    rm -f "$META_FILE" "$BODY_FILE"
    ;;
  drive-share)
    UK="${2:?usage: drive-share <user_key> <file_id> [role=reader] [type=anyone] [email]}"
    FID="${3:?file_id required}"
    ROLE="${4:-reader}"
    TYPE="${5:-anyone}"
    EMAIL="${6:-}"
    BODY="{\"role\":\"$ROLE\",\"type\":\"$TYPE\""
    [ -n "$EMAIL" ] && BODY="$BODY,\"emailAddress\":\"$EMAIL\""
    BODY="$BODY}"
    call "$UK" POST "https://www.googleapis.com/drive/v3/files/$FID/permissions" "$BODY"
    ;;
  drive-folder)
    UK="${2:?usage: drive-folder <user_key> <folder_name> [parent_folder_id]}"
    NAME="${3:?folder_name required}"
    PARENT="${4:-}"
    if [ -n "$PARENT" ]; then
      BODY="{\"name\":\"$NAME\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"$PARENT\"]}"
    else
      BODY="{\"name\":\"$NAME\",\"mimeType\":\"application/vnd.google-apps.folder\"}"
    fi
    call "$UK" POST "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink" "$BODY"
    ;;
  gmail-send)
    UK="${2:?usage: gmail-send <user_key> <to> <subject> <body_text> [attachment_path]}"
    TO="${3:?to required}"
    SUBJ="${4:?subject required}"
    TEXT="${5:?body required}"
    ATT="${6:-}"
    TOK=$(resolve_token "$UK") || exit 2
    # gera RFC 2822 message + base64url
    python3 - <<PY
import base64, sys, mimetypes, os
from email.message import EmailMessage
msg = EmailMessage()
msg["To"] = "$TO"
msg["Subject"] = "$SUBJ"
msg.set_content("""$TEXT""")
att = "$ATT"
if att and os.path.isfile(att):
    ctype, _ = mimetypes.guess_type(att)
    maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
    with open(att, "rb") as f:
        msg.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(att))
raw = base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("=")
import urllib.request, json
req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    data=json.dumps({"raw": raw}).encode(),
    headers={"Authorization":"Bearer $TOK","Content-Type":"application/json"})
try:
    print(urllib.request.urlopen(req, timeout=30).read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode()); sys.exit(1)
PY
    ;;
  gmail-draft)
    UK="${2:?usage: gmail-draft <user_key> <to> <subject> <body_text>}"
    TO="${3:?to required}"
    SUBJ="${4:?subject required}"
    TEXT="${5:?body required}"
    TOK=$(resolve_token "$UK") || exit 2
    python3 - <<PY
import base64, json, urllib.request
from email.message import EmailMessage
msg = EmailMessage(); msg["To"]="$TO"; msg["Subject"]="$SUBJ"; msg.set_content("""$TEXT""")
raw = base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("=")
req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    data=json.dumps({"message":{"raw":raw}}).encode(),
    headers={"Authorization":"Bearer $TOK","Content-Type":"application/json"})
print(urllib.request.urlopen(req, timeout=30).read().decode())
PY
    ;;
  calendar-create)
    UK="${2:?usage: calendar-create <user_key> <summary> <start_iso> <end_iso> [description]}"
    SUMMARY="${3:?summary required}"
    START="${4:?start required (ex: 2026-05-10T14:00:00-03:00)}"
    END="${5:?end required}"
    DESC="${6:-}"
    BODY=$(python3 -c "import json,sys; print(json.dumps({'summary':sys.argv[1],'description':sys.argv[2],'start':{'dateTime':sys.argv[3]},'end':{'dateTime':sys.argv[4]}}))" "$SUMMARY" "$DESC" "$START" "$END")
    call "$UK" POST "https://www.googleapis.com/calendar/v3/calendars/primary/events" "$BODY"
    ;;
  raw)
    UK="${2:?usage: raw <user_key> <method> <url> [body]}"
    METHOD="${3:?method}"
    URL="${4:?url}"
    BODY="${5:-}"
    call "$UK" "$METHOD" "$URL" "$BODY"
    ;;
  *)
    cat <<USAGE
google.sh — Google APIs helper (Jeferson)

Comandos:
  accounts                                       lista contas conectadas
  token <user_key>                               imprime access_token (auto-refresh)
  contacts <user_key> [query]                              busca contatos (People API)
  gmail-list <user_key> [q]                                lista threads recentes (q estilo Gmail)
  gmail-send <user_key> <to> <subject> <body> [file]       envia email (com anexo opcional)
  gmail-draft <user_key> <to> <subject> <body>             salva draft (não envia)
  drive-list <user_key> [q]                                lista arquivos Drive
  drive-upload <user_key> <file_path> [folder_id] [mime]   sobe arquivo no Drive
  drive-folder <user_key> <name> [parent_id]               cria pasta no Drive
  drive-share <user_key> <file_id> [role] [type] [email]   compartilha arquivo (default: reader/anyone)
  calendar-list <user_key>                                 próximos 10 eventos
  calendar-create <user_key> <summary> <start_iso> <end_iso> [desc]   cria evento
  sheets-get <user_key> <sheet_id> <range>                 lê range de planilha
  sheets-append <user_key> <sheet_id> <range> <values>     append linhas (values = json [[...]])
  raw <user_key> <METHOD> <url> [body]                     chamada crua

Exemplos:
  google.sh accounts
  google.sh contacts jefersonhenrike1@gmail.com "Vinicius"
  google.sh gmail-list jefersonhenrike1@gmail.com "from:asaas is:unread"
  google.sh drive-list jefersonhenrike1@gmail.com "name contains 'contrato'"
  google.sh calendar-list jefersonhenrike1@gmail.com
  google.sh sheets-get jefersonhenrike1@gmail.com 1abc... "Sheet1!A1:D"

Conectar conta nova: abrir https://google.jefersonhenrike.com e clicar em "Conectar".
USAGE
    exit 1
    ;;
esac
