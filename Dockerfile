# Production image. CI builds it for linux/arm64 (the instance is Graviton);
# it also builds natively on amd64 for local testing.

FROM node:26.13.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Builds must not depend on secrets; auth and database settings are read at
# request time (lib/env.ts).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:migrate && npm run build:sync

FROM node:26.13.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_FOLDER=/app/migrations

# Next's standalone server with only the files it traced, plus the static
# assets it expects next to it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Add "COPY --from=build /app/public ./public" once public/ has files (git
# drops the empty folder, so copying it now would fail in CI).
# The migrator, bundled into one file, and the committed migrations.
COPY --from=build --chown=node:node /app/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /app/dist/sync-catalog.mjs ./sync-catalog.mjs
COPY --chown=node:node lib/db/migrations ./migrations

USER node
EXPOSE 3000
CMD ["node", "server.js"]
