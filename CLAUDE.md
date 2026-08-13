# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

Financial dashboard that syncs data from a self-hosted Actual Budget instance into PostgreSQL, then serves it via a Next.js app with AI-generated monthly insights (Claude API).

**Data flow:** Actual Budget Server → `scripts/sync.cjs` → PostgreSQL → Next.js API routes (`src/lib/queries.ts`) → React components (Recharts)

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create new migration
npx prisma migrate deploy             # Apply migrations
```

**Docker (production on Unraid):**

Containers are managed individually via Unraid's **Add Container** UI — NOT docker-compose. Three containers, each installed from its XML template in `unraid/`:

| Container | Template | Notes |
|---|---|---|
| `actual-dashboard` | `unraid/actual-dashboard.xml` | Next.js app on port 3100 |
| `actual-dashboard-db` | Stock Postgres from Community Applications | Not a custom template — install `postgres:16-alpine` from CA |
| `actual-dashboard-browserless` | `unraid/actual-dashboard-browserless.xml` | Headless Chromium for PDF rendering |

To install: Docker → Add Container → paste the raw GitHub URL of the XML file, or copy the XML files to `/boot/config/plugins/dockerMan/templates-user/` on the Unraid host.

All containers must be on the same Docker network so they can reach each other by container name.

**Running scripts on Unraid (exec into the running app container):**
```bash
docker exec -it actual-dashboard node scripts/sync.cjs                          # Sync data from Actual Budget
docker exec -it actual-dashboard node scripts/backfill-snapshots.cjs            # One-time: backfill account balance history
docker exec -it actual-dashboard node scripts/generate-insight.cjs --backfill   # Regenerate all AI insights
```

**Viewing logs:**
```bash
docker logs actual-dashboard        # App + scheduler logs
docker logs actual-dashboard -f     # Follow/tail
docker logs actual-dashboard --since 1h  # Last hour only
```

## Architecture

- **`scripts/sync.cjs`** — Downloads all accounts, categories, transactions, and budget amounts from Actual Budget API into Postgres. Triggers AI insight generation on completion.
- **`scripts/generate-insight.cjs`** — Gathers month budget/spending data via SQL, sends to Claude API (`claude-sonnet-4-6`), stores result in `DailyInsight` table. Generates for current month (in-progress prompt) and previous month (completed prompt). 24-hour cache per month.
- **`src/lib/queries.ts`** — All Prisma queries for dashboard data. Queries budgets and transactions separately then combines in JS (avoids JOIN inflation).
- **`src/lib/loadConfig.cjs`** — Single config loader shared by the Next server code and the CJS scripts. Resolves `$DASHBOARD_CONFIG`, then `config/dashboard.json`, then `config/dashboard.example.json`.
- **`src/lib/constants.ts`** — Typed re-exports of the loaded config (`SKIP_CATEGORIES`, `SKIP_INCOME`, `NET_WORTH_GROUPS`, `BUDGET_BUCKETS`, `BUSINESS_CATEGORIES`, `EXCLUDED_ACCOUNTS`) used to filter noise from all queries and AI generation.
- **`src/app/(dashboard)/`** — Protected dashboard pages (route group with auth layout).
- **`src/app/api/`** — API routes for auth, dashboard, analytics, trends.

## Key Conventions

- **Amounts** are stored as integers (cents) in Postgres. Convert with `/100` for display. `src/lib/formatting.ts` has `formatCents()`.
- **Month keys** use `YYYY-MM` format in Eastern Time. Helper: `getCurrentMonthKeyET()` in `src/lib/timezone.ts`.
- **Auth** is a single shared password. Cookie-based with 30-day httpOnly token.
- **Household config** (account names, category skip lists, family names) lives in `config/dashboard.json`, which is **gitignored** — it holds real personal data and must never be committed. `config/dashboard.example.json` is the tracked placeholder and the fallback when no real config is present. Both the dashboard queries and the CJS scripts read it through `loadConfig()`; there is one copy, not three.
- **Prisma output** is at `src/generated/prisma` (not the default location).

## Environment Variables

```
DATABASE_URL              # PostgreSQL connection string
DASHBOARD_CONFIG          # Path to household config JSON (default: config/dashboard.json, falls back to the example). In the container: /data/config.json
ACTUAL_DATA_DIR           # Path where Actual Budget sync data is cached (default: /data in container, set via Appdata Path in Unraid UI)
ACTUAL_SERVER_URL         # Actual Budget server (e.g. http://YOUR-SERVER-IP:5006)
ACTUAL_PASSWORD           # Actual Budget password
ACTUAL_SYNC_ID            # Budget file UUID to sync
SITE_PASSWORD             # Dashboard login password
TRUSTED_PROXY             # Set only when a reverse proxy in front of the app overwrites X-Forwarded-For.
                          # Empty (default) means the header is ignored and login rate limiting shares one
                          # bucket — a directly-reachable app cannot trust a client-supplied header.
ANTHROPIC_API_KEY         # Optional — enables AI insights
SPOTLIGHT_CATEGORIES      # Exactly 3 comma-separated category names; invalid/unset hides the spotlight column

# PDF rendering (Phase 2)
BROWSERLESS_URL           # Internal URL of browserless container (default: http://actual-dashboard-browserless:3000)
BROWSERLESS_TOKEN         # Shared secret token for browserless container
PDF_RENDER_BASE_URL       # URL browserless uses to fetch the app (default: http://actual-dashboard:3000)
PDF_RENDER_AUTH_TOKEN     # Secret that lets the headless browser bypass site auth — required for PDF/email

# Email (Phase 2)
RESEND_API_KEY            # Resend API key — empty disables email
EMAIL_FROM                # Verified sender address (e.g. dashboard@yourdomain.com)
EMAIL_RECIPIENTS          # Comma-separated recipient list

# Scheduler (Phase 3)
SYNC_CRON                 # Cron expression for auto-sync (e.g. "0 */6 * * *") — empty disables
EMAIL_CRON                # Cron expression for monthly email (e.g. "0 8 1 * *") — empty disables
CRON_TIMEZONE             # Timezone for cron jobs (default: America/New_York)
```
