#!/bin/bash
# Runs on the shared instance as root, from a staging folder holding a copy
# of deploy/ (the deploy workflow sends it over SSM).
#
#   bash deploy.sh <image>     e.g. 674162619498.dkr.ecr.us-east-1.amazonaws.com/mysignalchain-app:<sha>
#
# It only ever touches mysignalchain's own containers, images and files, plus
# its own site file in /opt/edge/sites. Never a host-wide prune: Pansori
# shares this instance.
set -euo pipefail

IMAGE=${1:?usage: deploy.sh <image>}
STAGE=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR=/opt/mysignalchain
REGION=us-east-1
SITE_LIVE=/opt/edge/sites/mysignalchain.conf
REPO=${IMAGE%:*}

log() { echo "[deploy] $*"; }

mkdir -p "$APP_DIR" /data/mysignalchain/postgres
cd "$APP_DIR"

# 1. Secrets from Parameter Store into env files only root can read.
param() {
  aws ssm get-parameter --region "$REGION" --name "/mysignalchain/$1" \
    --with-decryption --query Parameter.Value --output text
}
umask 077
PG_PASSWORD=$(param POSTGRES_PASSWORD)
printf 'POSTGRES_PASSWORD=%s\n' "$PG_PASSWORD" > postgres.env.new
{
  printf 'DATABASE_URL=postgres://mysignalchain:%s@postgres:5432/mysignalchain\n' "$PG_PASSWORD"
  printf 'BETTER_AUTH_URL=%s\n' "https://mysignalchain.com"
  printf 'BETTER_AUTH_SECRET=%s\n' "$(param BETTER_AUTH_SECRET)"
  printf 'GOOGLE_CLIENT_ID=%s\n' "$(param GOOGLE_CLIENT_ID)"
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "$(param GOOGLE_CLIENT_SECRET)"
} > app.env.new
mv postgres.env.new postgres.env
mv app.env.new app.env
umask 022
install -m 0644 "$STAGE/compose.yaml" compose.yaml
log "config written"

# 2. Pull the new image. The previous one is pulled again on rollback, since
# Pansori's deploy prunes images that no running container uses.
CURRENT=$(sed -n 's/^APP_IMAGE=//p' .env 2>/dev/null || true)
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${IMAGE%%/*}" >/dev/null
docker pull -q "$IMAGE" >/dev/null
log "pulled $IMAGE (was: ${CURRENT:-none})"

set_image() { printf 'APP_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$1" "$2" > .env; }
# Compose checks every variable in the file, even when starting only
# Postgres, so the image must be set first.
set_image "$IMAGE" "$CURRENT"

# 3. Database, then migrations. Migrations must stay compatible with the
# previous release, because a rollback doesn't undo them.
docker compose up -d --wait postgres
docker compose run --rm --no-deps app node migrate.mjs

# 4. Start the new app and wait for its health check; roll back if it fails.
if docker compose up -d --wait --wait-timeout 120 app; then
  log "app healthy on $IMAGE"
else
  log "new app failed its health check"
  docker compose logs --no-color --tail 50 app || true
  if [ -n "$CURRENT" ]; then
    log "rolling back to $CURRENT"
    docker pull -q "$CURRENT" >/dev/null
    set_image "$CURRENT" ""
    docker compose up -d --wait --wait-timeout 120 app && log "rollback healthy"
  fi
  exit 1
fi

# 5. Site file: test the candidate with `nginx -t` in a throwaway container,
# then install and reload edge-nginx.
if ! cmp -s "$STAGE/nginx/mysignalchain.conf" "$SITE_LIVE"; then
  EDGE_IMAGE=$(sed -n 's/^ *image: *//p' /opt/edge/compose.yaml | head -1)
  CAND=$(mktemp -d)
  trap 'rm -rf "$CAND"' EXIT
  cp -a /opt/edge/conf.d "$CAND/conf.d"
  cp -a /opt/edge/sites "$CAND/sites"
  cp "$STAGE/nginx/mysignalchain.conf" "$CAND/sites/mysignalchain.conf"
  if ! OUT=$(docker run --rm --network edge \
    -v "$CAND/conf.d:/etc/nginx/conf.d:ro" \
    -v "$CAND/sites:/etc/nginx/sites:ro" \
    -v /etc/letsencrypt:/etc/letsencrypt:ro \
    -v /var/www/certbot:/var/www/certbot:ro \
    "$EDGE_IMAGE" nginx -t -q 2>&1); then
    log "site file failed nginx -t; not installed (the app itself is deployed)"
    echo "$OUT" | grep -v docker-entrypoint
    exit 1
  fi
  install -m 0644 "$STAGE/nginx/mysignalchain.conf" "$SITE_LIVE"
  docker exec edge-nginx nginx -t -q
  docker exec edge-nginx nginx -s reload
  log "site file installed and edge-nginx reloaded"
fi

# 6. Remove our own old images, keeping the current and previous ones.
docker image ls "$REPO" --format '{{.Repository}}:{{.Tag}}' \
  | grep -vxF -e "$IMAGE" -e "${CURRENT:-$IMAGE}" \
  | xargs -r docker image rm >/dev/null 2>&1 || true

log "done"
