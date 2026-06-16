#!/bin/bash
# Empacota /opt/jeff-worker/zeus_backups/ e sobe pro Drive Zeus/backups.
# Mantém o original no servidor. Rotação: deleta tarballs do Drive > 90 dias.
# Cron: 0 6 * * 0 (domingo 06h UTC = 03h BRT)

set -eu
BACKUP_DIR=/opt/jeff-worker/zeus_backups
DRIVE_FOLDER_ID=1hOgeWxikBi6klcyzhf2YfvQs_aLngmWW
USER_KEY=jefersonhenrike1@gmail.com
HELPER=/opt/jeff-worker/scripts/google.sh
LOG=/opt/jeff-worker/zeus_backups_drive.log

log() { echo "[$(date -u +%FT%TZ)] $*" >> "$LOG"; }

if [ ! -d "$BACKUP_DIR" ]; then
  log "ERRO: $BACKUP_DIR não existe"
  exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARFILE=/tmp/zeus_backups_${STAMP}.tar.gz

log "Empacotando $BACKUP_DIR -> $TARFILE"
tar -czf "$TARFILE" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"
SIZE=$(du -h "$TARFILE" | cut -f1)
log "Pack ok ($SIZE)"

log "Uploading pro Drive folder $DRIVE_FOLDER_ID"
RESPONSE=$("$HELPER" drive-upload "$USER_KEY" "$TARFILE" "$DRIVE_FOLDER_ID" 2>&1)
FILE_ID=$(echo "$RESPONSE" | grep -oP '"id":\s*"\K[^"]+' | head -1)

if [ -n "$FILE_ID" ]; then
  log "Upload ok — file_id=$FILE_ID"
else
  log "ERRO upload: $RESPONSE"
  rm -f "$TARFILE"
  exit 2
fi

rm -f "$TARFILE"
log "Tarball local removido (/tmp limpo)"

log "Backup semanal concluído com sucesso"
