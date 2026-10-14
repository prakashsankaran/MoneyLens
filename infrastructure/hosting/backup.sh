#!/bin/sh
# Nightly database dump, kept for BACKUP_KEEP_DAYS days in ./backups on the
# server. Copy them off the server too (docs/HOSTING.md, "Backups"): a dump
# that only lives on the same disk is lost with it.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups

while true; do
  stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
  file="/backups/moneylens-$stamp.dump"
  if pg_dump --format=custom --compress=9 --file="$file.part"; then
    mv "$file.part" "$file"
    chmod 600 "$file"
    echo "backup: wrote $file"
  else
    rm -f "$file.part"
    echo "backup: pg_dump failed" >&2
  fi
  find /backups -name 'moneylens-*.dump' -mtime "+$KEEP" -delete
  sleep 86400
done
