# actual-insights

A financial dashboard for a self-hosted [Actual Budget](https://actualbudget.org) instance. It syncs your budget into PostgreSQL, serves it as a Next.js app, and writes a monthly summary of your spending using the Claude API.

Single household, single shared password. It is built to run on a LAN.

## How it works

```
Actual Budget server -> scripts/sync.cjs -> PostgreSQL -> Next.js API routes -> React (Recharts)
```

`scripts/sync.cjs` pulls accounts, categories, transactions and budget amounts, then triggers insight generation. `scripts/generate-insight.cjs` gathers a month of budget and spending data, sends it to Claude, and stores the result. Everything the dashboard renders is read back out of Postgres.

Three containers run in production: the app, a stock Postgres, and a headless Chromium for PDF rendering.

## Running it

Local development:

```bash
npm install
npx prisma generate
npm run dev
```

The dev server is on [http://localhost:3000](http://localhost:3000). `npx prisma generate` is not optional on a fresh clone — the generated client is gitignored, and the tests and the build both fail without it.

In production, install the app and browserless containers from their templates in `unraid/`, and Postgres from Community Applications. The published image is `ghcr.io/pgillespie84/actual-insights:latest`. `SETUP.md` walks through it step by step, including the registry token.

Other commands:

```bash
npm test         # vitest
npm run lint     # eslint
npm run build    # production build
npx prisma migrate deploy   # apply migrations
```

The scripts run inside the container:

```bash
docker exec -it actual-insights node scripts/sync.cjs
docker exec -it actual-insights node scripts/backfill-snapshots.cjs
docker exec -it actual-insights node scripts/generate-insight.cjs --backfill
```

## Configuration

### Household config

Your account names, category skip lists and net-worth groupings live in a JSON file, separate from the code:

```bash
cp config/dashboard.example.json config/dashboard.json
```

Edit `config/dashboard.json` to match your Actual Budget setup. It is gitignored, and it is excluded from the Docker build context as well — it describes your real accounts, so it must not reach a published image. If it is missing, the app falls back to `config/dashboard.example.json` and starts with placeholder names, so a fresh clone boots with no setup at all.

In production, pass it as one line of JSON in `DASHBOARD_CONFIG_JSON`, or mount it on a volume and point `DASHBOARD_CONFIG` at it (`/data/config.json` in the container) so it survives image updates.

Three of the category lists are easy to confuse, so it is worth being explicit about the difference:

- `SKIP_CATEGORIES` removes a category from every figure the dashboard produces. Use it for bookkeeping artefacts that are not real spending, such as rollover and pending-transaction categories.
- `SKIP_VENDOR_CATEGORIES` removes a category from the dashboard's "Top vendors" chart only.
- `TOP_CATEGORY_EXCLUSIONS` removes a category from the dashboard's "Top categories" widget only.

The last two are for real spending that wins its ranking every month and tells you nothing by doing so — a mortgage is the obvious case for both. They are separate keys because the two charts answer different questions, and you may want the mortgage out of one and not the other. Neither touches a total, a trend, the analytics page's payee list, or anything the AI insight is given: the analytics page is read deliberately, and the model needs the complete picture for its totals to reconcile.

### Required environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the dashboard database. |
| `ACTUAL_SERVER_URL` | URL of your self-hosted Actual Budget server (e.g. `http://YOUR-SERVER-IP:5006`). |
| `ACTUAL_PASSWORD` | Password for the Actual Budget server. |
| `ACTUAL_SYNC_ID` | Budget file UUID to sync from Actual. |
| `SITE_PASSWORD` | Shared password for dashboard login. |

### Optional

| Variable | Description |
| --- | --- |
| `DASHBOARD_CONFIG` | Path to your household config JSON. Defaults to `config/dashboard.json`, falling back to `config/dashboard.example.json`. |
| `ACTUAL_DATA_DIR` | Where Actual Budget sync data is cached. Defaults to `/data` in the container. |
| `ANTHROPIC_API_KEY` | Enables AI-generated monthly insights via Claude. If unset, the AI Insight card is hidden. |
| `SPOTLIGHT_CATEGORIES` | Exactly 3 comma-separated Actual Budget category names to show as spotlight cards (e.g. `Grocery,Takeout,Subscriptions`). Whitespace is trimmed. If unset or invalid, the spotlight column is hidden. |
| `TRUSTED_PROXY` | Set only when a reverse proxy in front of the app rewrites `X-Forwarded-For`. See login throttling below. |

### PDF and email

Monthly email is off unless these are set.

| Variable | Description |
| --- | --- |
| `BROWSERLESS_URL` | Internal URL of the browserless container. |
| `BROWSERLESS_TOKEN` | Shared secret for the browserless container. |
| `PDF_RENDER_BASE_URL` | URL browserless uses to fetch the app. |
| `PDF_RENDER_AUTH_TOKEN` | Secret that lets the headless browser read the dashboard without a login. It grants read access to the dashboard page and four data routes, and nothing that sends mail or starts a render. |
| `RESEND_API_KEY` | Resend API key. Empty disables email. |
| `EMAIL_FROM` | Verified sender address. |
| `EMAIL_RECIPIENTS` | Comma-separated recipient list. |

### Scheduler

| Variable | Description |
| --- | --- |
| `SYNC_CRON` | Cron expression for automatic sync (e.g. `0 */6 * * *`). Empty disables it. |
| `EMAIL_CRON` | Cron expression for the monthly email (e.g. `0 8 1 * *`). Empty disables it. |
| `CRON_TIMEZONE` | Timezone for cron jobs. Defaults to `America/New_York`. |

## Login throttling

Login is throttled two ways: per client, five failures then a lockout that doubles with each further failure, and a global ceiling of 20 failures per 15 minutes across all clients. The global counter drains steadily rather than resetting, so a tripped ceiling clears itself in 45 seconds instead of locking the household out for a quarter of an hour.

`X-Forwarded-For` is ignored unless `TRUSTED_PROXY` is set. With nothing in front of the app that header is client-controlled, and honouring it would let an attacker mint a fresh throttle bucket per request. The cost of ignoring it is that every client shares one bucket, which is the right trade for a LAN deployment.

## Notes

Amounts are stored as integers in cents. Month keys are `YYYY-MM` in Eastern Time. The generated Prisma client lives in `src/generated/prisma`, not the default location.
