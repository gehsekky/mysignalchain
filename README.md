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
