#!/bin/sh
# Nightly encrypted Postgres dump (docs/09-deployment.md §7). Cron: 30 2 * * * /opt/pos/backup.sh >> /opt/pos/backups/backup.log 2>&1
set -eu
cd /opt/pos && . ./.env
F=/opt/pos/backups/pos-$(date +%F).sql.gz.gpg
mkdir -p /opt/pos/backups
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip | gpg --batch --yes --symmetric --passphrase "$BACKUP_PASSPHRASE" -o "$F"
find /opt/pos/backups -name 'pos-*.gpg' -mtime +30 -delete
# ponytail: no off-server copy yet; add e.g. `rclone copy "$F" remote:pos-backups/` once a remote exists
echo "$(date -Is) ok $F"
