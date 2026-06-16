#!/bin/bash
set -e
export PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH

TS=$(date -u +%Y%m%dT%H%M%SZ)
WORK=/tmp/zeus_backup_$TS
ZEUS_FOLDER=1hXSBUiNBlkbF3TFyFJ1zZRxL92bXX2EU
USER_KEY=jefersonhenrike1@gmail.com
GOOGLE=/opt/labastia/whatsapp-worker/scripts/google.sh
PASSPHRASE=/root/.zeus/backup_passphrase
RETAIN=30

mkdir -p "$WORK/dbs" "$WORK/configs" "$WORK/code" "$WORK/sites" "$WORK/state" "$WORK/npm"

# --- SQLite snapshots (consistentes via .backup) ---
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db ".backup '$WORK/dbs/worker.db'"
for db in /opt/jeff-apps/*/data/*.db; do
  [ -f "$db" ] || continue
  app=$(basename "$(dirname "$(dirname "$db")")")
  name=$(basename "$db")
  sqlite3 "$db" ".backup '$WORK/dbs/${app}__${name}'"
done

# --- NPM (Nginx Proxy Manager) ---
sqlite3 /var/lib/docker/volumes/labastia-setup_npm_data/_data/database.sqlite \
  ".backup '$WORK/npm/database.sqlite'"
tar --exclude=logs --exclude=database.sqlite --exclude=letsencrypt-acme-challenge \
    -czf "$WORK/npm/npm_data.tar.gz" \
    -C /var/lib/docker/volumes/labastia-setup_npm_data _data 2>/dev/null || true
tar -czf "$WORK/npm/letsencrypt.tar.gz" \
    -C /var/lib/docker/volumes/labastia-setup_npm_letsencrypt _data 2>/dev/null || true

# --- Configs e segredos ---
cp /opt/labastia/whatsapp-worker/.env "$WORK/configs/whatsapp-worker.env" 2>/dev/null || true
cp /opt/labastia/whatsapp-worker/CLAUDE.md "$WORK/configs/CLAUDE.md" 2>/dev/null || true
cp -r /opt/labastia/whatsapp-worker/zeus "$WORK/configs/zeus" 2>/dev/null || true
for env in /opt/jeff-apps/*/.env; do
  [ -f "$env" ] || continue
  app=$(basename "$(dirname "$env")")
  cp "$env" "$WORK/configs/${app}.env"
done

# --- Código (sem node_modules, .git, data, sessoes WA) ---
tar --exclude=node_modules --exclude=.git --exclude=data \
    -czf "$WORK/code/jeff-apps.tar.gz" -C /opt jeff-apps 2>/dev/null || true
tar --exclude=node_modules --exclude=.git --exclude=.wwebjs_auth \
    --exclude=.wwebjs_cache --exclude=data \
    -czf "$WORK/code/whatsapp-worker.tar.gz" -C /opt/labastia whatsapp-worker 2>/dev/null || true
tar --exclude=node_modules -czf "$WORK/sites/jeff-sites.tar.gz" -C /opt jeff-sites 2>/dev/null || true

# --- Estado de servicos (so referencia pra restore) ---
pm2 jlist > "$WORK/state/pm2.json" 2>/dev/null || true
docker ps --format '{{json .}}' > "$WORK/state/docker.json" 2>/dev/null || true
crontab -l > "$WORK/state/crontab.txt" 2>/dev/null || true

# --- Empacotar e cifrar ---
ARCHIVE=/tmp/zeus_backup_$TS.tar.gz
ENC=$ARCHIVE.gpg
tar -czf "$ARCHIVE" -C /tmp "zeus_backup_$TS"
gpg --batch --yes --passphrase-file "$PASSPHRASE" \
    --symmetric --cipher-algo AES256 -o "$ENC" "$ARCHIVE"

SIZE=$(du -h "$ENC" | cut -f1)

# --- Upload pro Drive ---
"$GOOGLE" drive-upload "$USER_KEY" "$ENC" "$ZEUS_FOLDER" application/octet-stream

# --- Retencao: manter os $RETAIN mais recentes com prefixo zeus_backup_ ---
LIST=$("$GOOGLE" drive-list "$USER_KEY" "'$ZEUS_FOLDER' in parents and name contains 'zeus_backup_' and trashed=false")
DELETE_IDS=$(echo "$LIST" | jq -r --argjson n "$RETAIN" '.files | sort_by(.name) | reverse | .[$n:] | .[] | .id' 2>/dev/null || true)
DELETED=0
if [ -n "$DELETE_IDS" ]; then
  while IFS= read -r fid; do
    [ -n "$fid" ] || continue
    "$GOOGLE" raw "$USER_KEY" DELETE "https://www.googleapis.com/drive/v3/files/$fid" >/dev/null 2>&1 || true
    DELETED=$((DELETED+1))
  done <<< "$DELETE_IDS"
fi

# --- Cleanup ---
rm -rf "$WORK" "$ARCHIVE" "$ENC"
echo "[$(date -u +%FT%TZ)] zeus_backup_$TS.tar.gz.gpg ($SIZE) enviado. Antigos deletados: $DELETED."
