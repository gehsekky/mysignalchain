# mysignalchain

Build, version and share guitar signal chains as interactive graphs. See [docs/PLAN.md](docs/PLAN.md) for the plan.

## Local development

You need Node 26 and Docker.

```bash
cp .env.example .env   # then set BETTER_AUTH_SECRET
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, with `http://localhost:3000/api/auth/callback/google` as a redirect URI.

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test              # unit and integration tests; needs the database
npm run test:e2e      # needs the database
npm run build
```

## Deploying

Pushing to `main` deploys once CI passes (`.github/workflows/deploy.yml`):

1. The ARM image is built on GitHub's ARM runner and pushed to ECR, tagged with the commit SHA.
2. `deploy/` is sent to the shared instance over SSM, and `deploy/host/deploy.sh` runs there. It writes secrets from Parameter Store (`/mysignalchain/*`) into root-only env files, pulls the image, runs migrations, starts the app and waits for its health check. If the check fails, it rolls back to the previous image. It then installs `deploy/nginx/mysignalchain.conf` into the shared proxy after `nginx -t`.

Migrations must stay compatible with the previous release, because a rollback doesn't undo them.

The instance is shared with Pansori: never run host-wide Docker commands such as `docker system prune` there. The shared proxy is defined in `gehsekky-infra` under `host/edge/`.

## Backups

`deploy.sh` installs a systemd timer, `mysignalchain-backup.timer`, that runs `deploy/host/backup.sh` at 07:30 UTC each night. It deletes expired sessions and verification records, streams a `pg_dump` to `s3://mysignalchain-backups/postgres/` (kept 30 days), and publishes a `BackupSucceeded` metric. If no backup succeeds for 26 hours, the `mysignalchain-backup-missing` alarm sends an email. The data volume also gets a daily EBS snapshot at 08:00 UTC, kept 7 days.

On the instance:

```bash
systemctl start mysignalchain-backup        # back up now
journalctl -u mysignalchain-backup          # past runs
bash /opt/mysignalchain/bin/restore-test.sh # restore the newest dump into a throwaway container and compare row counts
```

To restore production from a dump, stop the app, restore over the live database, then start the app:

```bash
cd /opt/mysignalchain
aws s3 cp s3://mysignalchain-backups/<key> /root/restore.dump
docker compose stop app
docker exec -i mysignalchain-postgres pg_restore -U mysignalchain -d mysignalchain --clean --if-exists --exit-on-error < /root/restore.dump
docker compose start app
rm /root/restore.dump
```
