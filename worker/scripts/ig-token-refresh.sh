#!/bin/bash
# Renova o Instagram Login token (IGAA...) via GET /refresh_access_token.
# Long-lived IG tokens duram 60 dias e podem ser renovados se ainda válidos.
# Rodado por cron mensal.
set -u
DB="/opt/jeff-worker/data/worker.db"
LOG="/opt/jeff-worker/logs/ig-token-refresh.log"
mkdir -p "$(dirname "$LOG")"
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $1" | tee -a "$LOG"; }

TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_instagram_login_token';")
if [ -z "$TOKEN" ]; then
  log "ERRO: jeff_instagram_login_token vazio"
  exit 2
fi

RESP=$(curl -s -G "https://graph.instagram.com/refresh_access_token" \
  --data-urlencode "grant_type=ig_refresh_token" \
  --data-urlencode "access_token=$TOKEN")

NEW=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','')); print(d.get('expires_in',0))" 2>/dev/null)
NEW_TOKEN=$(echo "$NEW" | head -1)
EXPIRES_IN=$(echo "$NEW" | tail -1)

if [ -z "$NEW_TOKEN" ] || [ "${EXPIRES_IN:-0}" -lt 3600 ]; then
  log "ERRO refresh: $RESP"
  exit 3
fi

EXPIRES_AT=$(date -u -d "+${EXPIRES_IN} seconds" +"%Y-%m-%d %H:%M:%S")
sqlite3 "$DB" <<SQL
UPDATE app_settings SET value='$NEW_TOKEN', updated_at=datetime('now')
  WHERE key='jeff_instagram_login_token';
UPDATE app_settings SET value='$EXPIRES_AT', updated_at=datetime('now')
  WHERE key='jeff_instagram_login_token_expires_at';
SQL

log "token renovado, novo expires_at=$EXPIRES_AT (in ${EXPIRES_IN}s)"
exit 0
