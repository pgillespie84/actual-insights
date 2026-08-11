FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

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
# placeholder config it falls back to. Real values are NOT baked into the image
# — mount config/dashboard.json or point DASHBOARD_CONFIG at it (on Unraid:
# /data/config.json, which lives on the appdata volume).
COPY --from=builder /app/src/lib/loadConfig.cjs ./src/lib/loadConfig.cjs
COPY --from=builder /app/config/dashboard.example.json ./config/dashboard.example.json
COPY --from=builder /app/node_modules ./node_modules

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Entrypoint starts as root so it can fix /data ownership before dropping
# to the nextjs user via su-exec. See docker-entrypoint.sh.

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
