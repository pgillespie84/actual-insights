FROM node:20-alpine AS base

# Full dependency tree, used only to build
FROM base AS deps
WORKDIR /app
# better-sqlite3 (via @actual-app/api) has no prebuilt binary for every
# platform, and the prebuilt download can fail transiently. Without a
# toolchain the node-gyp fallback dies on missing Python. These stages are
# build-only, so none of this reaches the runner image.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# Runtime dependency tree. The CJS scripts (sync, generate-insight,
# backfill-snapshots) run from the image and need pg, dotenv, @actual-app/api
# and @anthropic-ai/sdk, and the entrypoint needs the prisma CLI — all of which
# are in `dependencies`, so --omit=dev keeps them. Verified that prisma can
# still load the TypeScript prisma.config.ts without dev deps: `typescript`
# arrives transitively through `prisma`, and `tsx` is not required.
FROM base AS proddeps
WORKDIR /app
# better-sqlite3 (via @actual-app/api) has no prebuilt binary for every
# platform, and the prebuilt download can fail transiently. Without a
# toolchain the node-gyp fallback dies on missing Python. These stages are
# build-only, so none of this reaches the runner image.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV ACTUAL_DATA_DIR=/data

RUN apk add --no-cache su-exec && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma migrations, config, sync scripts, and all dependencies
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
# Config loader shared by the Next server code and the CJS scripts, plus the
# placeholder config it falls back to. Mount the real config or point
# DASHBOARD_CONFIG at it (on Unraid: /data/config.json, on the appdata volume).
#
# Only the example is copied here, but that alone did NOT keep real values out
# of the image: `next build` traces config/dashboard.json into
# .next/standalone/config/, and the COPY above brings the whole standalone tree
# in. A local build with a real config produced an image containing it. The
# file is excluded in .dockerignore so the builder never sees it — verify with
# `docker run --rm --entrypoint sh <image> -c 'ls config/'` after changing
# anything here.
COPY --from=builder /app/src/lib/loadConfig.cjs ./src/lib/loadConfig.cjs
COPY --from=builder /app/src/lib/backfill.cjs ./src/lib/backfill.cjs
COPY --from=builder /app/src/lib/timezone.cjs ./src/lib/timezone.cjs
COPY --from=builder /app/config/dashboard.example.json ./config/dashboard.example.json
# Runtime deps only. This used to copy the full dev tree from the builder,
# which overwrote the standalone bundle's own node_modules and shipped every
# dev toolchain package into production: 526 packages and 1.1G, against 209
# packages and 908M for runtime deps alone.
COPY --from=proddeps /app/node_modules ./node_modules

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Entrypoint starts as root so it can fix /data ownership before dropping
# to the nextjs user via su-exec. See docker-entrypoint.sh.

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
