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
