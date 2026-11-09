#!/bin/bash
# Nightly job on the shared instance, run as root by mysignalchain-backup.timer
# (installed by deploy.sh to /opt/mysignalchain/bin/).
#
# 1. Deletes expired sessions and verification records. The privacy page
#    promises that a session's IP address and browser go with the session.
# 2. Streams a pg_dump (custom format) to s3://mysignalchain-backups, where
#    a lifecycle rule deletes dumps after 30 days.
# 3. Publishes BackupSucceeded=1; the mysignalchain-backup-missing alarm
#    (gehsekky-infra) emails if none arrives for 26 hours.
set -euo pipefail

REGION=us-east-1
BUCKET=mysignalchain-backups
PG=mysignalchain-postgres

log() { echo "[backup] $*"; }
sql() {
  docker exec -i "$PG" psql -U mysignalchain -d mysignalchain \
    -v ON_ERROR_STOP=1 -qAt -c "$1"
}

SESSIONS=$(sql "WITH d AS (DELETE FROM sessions WHERE expires_at < now() RETURNING 1) SELECT count(*) FROM d")
VERIFICATIONS=$(sql "WITH d AS (DELETE FROM verifications WHERE expires_at < now() RETURNING 1) SELECT count(*) FROM d")
log "deleted $SESSIONS expired sessions and $VERIFICATIONS expired verifications"

KEY="postgres/$(date -u +%Y/%m)/mysignalchain-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec "$PG" pg_dump -U mysignalchain -d mysignalchain --format=custom \
  | aws s3 cp - "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
SIZE=$(aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" \
  --query ContentLength --output text)
[ "$SIZE" -gt 0 ] || { log "dump is empty: $KEY"; exit 1; }
log "uploaded s3://$BUCKET/$KEY ($SIZE bytes)"

aws cloudwatch put-metric-data --region "$REGION" --namespace mysignalchain \
  --metric-name BackupSucceeded --value 1 --unit Count
log "done"
