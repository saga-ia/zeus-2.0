#!/usr/bin/env bash
# Daily backup: tar data/ (LocalAuth + worker.db) to /var/backups/whatsapp-worker/
# Keeps the last 14 archives.
set -euo pipefail

BACKUP_DIR="/var/backups/whatsapp-worker"
SRC="/opt/jeff-worker/data"
KEEP=14

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/whatsapp-worker-${stamp}.tar.gz"

# SQLite online backup (safer than copying WAL)
DB="$SRC/worker.db"
if [[ -f "$DB" ]]; then
  sqlite3 "$DB" ".backup '$SRC/worker.db.bak'"
fi

tar -C "$SRC/.." -czf "$out" --exclude='data/media' data/
echo "backup -> $out"

# Prune old
ls -1t "$BACKUP_DIR"/whatsapp-worker-*.tar.gz 2>/dev/null | awk "NR>$KEEP" | xargs -r rm --
