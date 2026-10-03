FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Pin pnpm to v10 — v11 makes ignored-build-scripts fatal even when
# `pnpm.onlyBuiltDependencies` is set in package.json, breaking CI install.
RUN apk add --no-cache libc6-compat && npm install -g pnpm@10

WORKDIR /app

# Copy package manifests, build config, and ALL dialect templates so the
# postinstall hook can stamp out a matching schema.ts during install.
COPY package.json pnpm-lock.yaml* vite.config.ts ./
COPY scripts/db-setup.mjs scripts/db-setup.mjs
COPY src/config/db/schema.sqlite.ts src/config/db/schema.sqlite.ts
COPY src/config/db/schema.postgres.ts src/config/db/schema.postgres.ts
COPY src/config/db/schema.mysql.ts src/config/db/schema.mysql.ts

# DATABASE_PROVIDER must be set at build time so prebuild / postinstall pick
# the matching schema template. Pass it via `docker build --build-arg
# DATABASE_PROVIDER=postgresql` or set in your CI / k8s build pipeline.
ARG DATABASE_PROVIDER=sqlite
ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}

RUN pnpm i --frozen-lockfile

# Rebuild the source code only when needed
FROM deps AS builder

WORKDIR /app

# Only public VITE_* values are available during the build. Runtime secrets
# such as AUTH_SECRET and DATABASE_URL must be supplied to the running container.
ENV NODE_ENV=production

ARG VITE_APP_URL=https://hotel-lobby.org
ARG VITE_APP_NAME="Hotel Lobby AI"
ARG VITE_APP_DESCRIPTION="Plan a two-person Hotel Lobby AI filter video and copy a prompt for an image-to-video studio."
ARG VITE_APP_LOGO=/logo.svg
ARG VITE_DEFAULT_LOCALE=en
ENV VITE_APP_URL=${VITE_APP_URL} \
    VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_APP_DESCRIPTION=${VITE_APP_DESCRIPTION} \
    VITE_APP_LOGO=${VITE_APP_LOGO} \
    VITE_DEFAULT_LOCALE=${VITE_DEFAULT_LOCALE}

COPY . .
RUN pnpm build

# Production image — run the nitro server output
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/.output ./.output

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", ".output/server/index.mjs"]
