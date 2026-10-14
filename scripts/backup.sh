#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_PATH:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
case "$BACKUP_DIR" in
  ""|"/"|"/app"|"/home"|"/root"|"/storage")
    echo "BACKUP_PATH inseguro: $BACKUP_DIR" >&2
    exit 1
    ;;
esac
case "$RETENTION_DAYS" in
  *[!0-9]*|"") echo "BACKUP_RETENTION_DAYS deve ser um número inteiro." >&2; exit 1 ;;
esac
DESTINATION="$BACKUP_DIR/coliseu-$STAMP"
mkdir -p "$DESTINATION"

pg_dump "$DATABASE_URL" --format=custom --file="$DESTINATION/database.dump"
if [ -d "${STORAGE_SOURCE_PATH:-/storage}" ]; then
  tar -czf "$DESTINATION/storage.tar.gz" -C "${STORAGE_SOURCE_PATH:-/storage}" .
fi
sha256sum "$DESTINATION"/* > "$DESTINATION/SHA256SUMS"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'coliseu-*' -mtime "+$RETENTION_DAYS" -exec rm -rf {} \;
echo "Backup concluído em $DESTINATION"
