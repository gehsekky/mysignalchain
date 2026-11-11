# mysignalchain

Build, version and share guitar signal chains as interactive graphs. See [docs/PLAN.md](docs/PLAN.md) for the plan.

## Local development

You need Node 26 and Docker.

```bash
cp .env.example .env   # then set BETTER_AUTH_SECRET
npm install
npm run db:up
npm run db:migrate
npm run catalog:sync
npm run db:seed
npm run dev
```

If the dev server reloads a page over and over, delete `.next`: a production build left there by `npm run build` confuses `next dev`.

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

## Gear catalog

The seeded catalog lives in `lib/catalog/seed/`. `npm run catalog:sync` loads it, and every deploy runs the same sync after migrations. It adds and updates seeded items, never touches items users submitted, and never deletes anything.

Seed data must come from the maker's own page or manual, recorded in `sourceUrl`. Anything the maker doesn't state is left out and listed in `specs.unconfirmed`, which the gear page shows; never fill a gap from memory.

Users submit gear at `/gear/submit`; admins review it at `/admin/catalog`. To make someone an admin, set their role in the database. In production:

```bash
docker exec mysignalchain-postgres psql -U mysignalchain -d mysignalchain \
  -c "update users set role = 'admin' where handle = '<handle>'"
```

## Photos

Members upload photos of gear in their collection; admins review them at `/admin/images`, and can add Creative Commons photos to gear pages there. The code is in `lib/images/`.

- **Upload:** the browser posts the file straight to storage with a one-off presigned form (15 MB, `incoming/{random}`). The app then processes it with `sharp`, one at a time: it rotates it upright, drops all metadata (GPS included), saves WebP versions at 400, 1200 and 2048 px under `private/{id}/`, and deletes the upload.
- **Publishing:** a photo is copied to `public/{id}/`, which CloudFront serves at `images.mysignalchain.com`, once it's approved and attached to something anyone can see. Everything else is served by `/api/images/...` after the policy check. Unpublishing deletes the public copies and invalidates the CDN cache.
- **Switch:** `UPLOADS` (`off`, `admins` or `on`, set in `deploy/host/deploy.sh`). In production, member uploads stay admin-only until the DMCA designated agent is filled in in `lib/legal.ts`.
- **Locally:** files go to `.data/images` and a test-only route stands in for S3 (`IMAGE_STORAGE=fs`, the default).
- **AWS access:** the app container can't use the instance role, so it has its own key for the `mysignalchain-app` IAM user (defined in `gehsekky-infra`), limited to the images bucket and CloudFront invalidations. The key lives in Parameter Store as `/mysignalchain/IMAGES_AWS_ACCESS_KEY_ID` and `/mysignalchain/IMAGES_AWS_SECRET_ACCESS_KEY`. To rotate it, create a new key, store it under those names, redeploy, then delete the old key:

  ```bash
  read -r ID SECRET < <(aws iam create-access-key --user-name mysignalchain-app \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  aws ssm put-parameter --name /mysignalchain/IMAGES_AWS_ACCESS_KEY_ID --type SecureString --value "$ID" --overwrite
  aws ssm put-parameter --name /mysignalchain/IMAGES_AWS_SECRET_ACCESS_KEY --type SecureString --value "$SECRET" --overwrite
  unset ID SECRET
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
