# Actual Insights — Unraid setup guide

## Prerequisites

- Unraid server with Docker enabled
- Actual Budget running on your LAN (e.g., `http://YOUR-SERVER-IP:5006`)
- GitHub account with access to the `pgillespie84/actual-insights` repo

All three containers must sit on the same Docker network so they can reach each
other by container name. Unraid's default `bridge` network does this. Container
names are used throughout instead of IP addresses on purpose: a container's IP
changes when it restarts, and a `DATABASE_URL` pinned to one breaks the next time
Postgres comes back up.

---

## Step 1: Create a GitHub personal access token

1. Go to **GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name like `unraid-ghcr`
4. Select the `read:packages` scope
5. Click **Generate token**
6. Copy the token — you'll need it in the next step

---

## Step 2: Authenticate Docker on Unraid

SSH into your Unraid server and run:

```bash
echo "YOUR_TOKEN_HERE" | docker login ghcr.io -u pgillespie84 --password-stdin
```

You should see `Login Succeeded`.

---

## Step 3: Create the Postgres container

Install `postgres:16-alpine` from Community Applications. There is no custom
template for this one — it's stock Postgres.

In the Unraid web UI:

1. Go to the **Docker** tab
2. Click **Add Container**
3. Fill in:

| Field | Value |
|---|---|
| **Name** | `actual-insights-db` |
| **Repository** | `postgres:16-alpine` |

4. Click **Add another Path, Port, Variable, Label or Device** and add these **3 variables**:

| Config Type | Name | Value |
|---|---|---|
| Variable | `POSTGRES_USER` | `postgres` |
| Variable | `POSTGRES_PASSWORD` | `postgres` |
| Variable | `POSTGRES_DB` | `actual_dashboard` |

The database is named `actual_dashboard`, not `actual_insights`. That is
deliberate — renaming it would mean migrating the data for no functional gain.

5. Add a **path** for persistent storage:

| Config Type | Name | Container Path | Host Path |
|---|---|---|---|
| Path | `data` | `/var/lib/postgresql/data` | `/mnt/user/appdata/actual-insights-db` |

6. Click **Apply** and wait for the container to start

---

## Step 4: Create the browserless container

Only needed for PDF reports and monthly email. Skip it if you don't want those.

Install from `unraid/actual-insights-browserless.xml`: Docker → Add Container →
paste the raw GitHub URL of that file. Set the `TOKEN` variable to a long random
string and keep it — the app container needs the same value as
`BROWSERLESS_TOKEN`.

---

## Step 5: Create the app container

Install from `unraid/actual-insights.xml` the same way, or fill it in by hand:

| Field | Value |
|---|---|
| **Name** | `actual-insights` |
| **Repository** | `ghcr.io/pgillespie84/actual-insights:latest` |

Port mapping:

| Config Type | Name | Container Port | Host Port |
|---|---|---|---|
| Port | `webui` | `3000` | `3100` |

Appdata path, for the Actual Budget sync cache:

| Config Type | Name | Container Path | Host Path |
|---|---|---|---|
| Path | `data` | `/data` | `/mnt/user/appdata/actual-insights` |

Required variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@actual-insights-db:5432/actual_dashboard` |
| `SITE_PASSWORD` | *(your chosen dashboard password)* |
| `ACTUAL_SERVER_URL` | `http://YOUR-SERVER-IP:5006` |
| `ACTUAL_PASSWORD` | *(your Actual Budget password)* |
| `ACTUAL_SYNC_ID` | *(your budget file UUID)* |
| `DASHBOARD_CONFIG_JSON` | *(your household config, as one line of JSON)* |

`DASHBOARD_CONFIG_JSON` is easy to skip and shouldn't be. Leave it empty and the
dashboard still boots, but it runs on the placeholder names from
`config/dashboard.example.json`, so every category filter and net-worth group
matches nothing real and the numbers look wrong in ways that aren't obvious.
Copy `config/dashboard.example.json`, fill in your real accounts and categories,
and flatten it to a single line. If you'd rather keep it in a file, put it on the
appdata path and set `DASHBOARD_CONFIG=/data/config.json` instead.

Optional variables, all safe to leave unset:

| Name | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the AI monthly insights. Without it the insight card is hidden. |
| `SPOTLIGHT_CATEGORIES` | Exactly 3 comma-separated category names. Invalid or unset hides the spotlight column. |
| `SYNC_CRON` | Cron expression for automatic syncs, e.g. `0 */6 * * *`. Empty disables. |
| `EMAIL_CRON` | Cron expression for the monthly email, e.g. `0 8 1 * *`. Empty disables. |
| `CRON_TIMEZONE` | Defaults to `America/New_York`. |
| `BROWSERLESS_URL` | `http://actual-insights-browserless:3000` |
| `BROWSERLESS_TOKEN` | Must match `TOKEN` on the browserless container. |
| `PDF_RENDER_BASE_URL` | `http://actual-insights:3000` |
| `PDF_RENDER_AUTH_TOKEN` | Long random string. Anyone holding it can read your dashboard without logging in. |
| `RESEND_API_KEY` | Resend API key. Empty disables email. |
| `EMAIL_FROM` | Verified sender address. |
| `EMAIL_RECIPIENTS` | Comma-separated recipient list. |
| `TRUSTED_PROXY` | Set only if a reverse proxy in front of the app rewrites `X-Forwarded-For`. |

Click **Apply**.

Database migrations run automatically on every container start, from
`docker-entrypoint.sh`. There is no separate migration step.

---

## Step 6: Run the initial data sync

This pulls your data from Actual Budget into Postgres. Run it against the
container you just started, so it picks up the environment you configured rather
than needing it passed in again:

```bash
docker exec -it actual-insights node scripts/sync.cjs
```

You should see output like:

```
Initializing Actual API...
Downloading budget...
Syncing accounts...
Syncing categories...
Syncing transactions...
Syncing budget amounts...
Sync complete! XXXX total records synced.
```

If you want the account balance history charts populated for dates before today,
run the one-time backfill afterwards:

```bash
docker exec -it actual-insights node scripts/backfill-snapshots.cjs
```

---

## Step 7: Access the dashboard

Open your browser and go to:

```
http://YOUR_UNRAID_IP:3100
```

Log in with the `SITE_PASSWORD` you set in Step 5.

---

## Step 8: Schedule the sync

The app has its own scheduler. Set `SYNC_CRON` on the app container and restart
it — for example `0 */6 * * *` to sync every six hours, or `0 2 * * *` for daily
at 2am. `EMAIL_CRON` schedules the monthly PDF email the same way, and
`CRON_TIMEZONE` controls what timezone both run in.

Don't use the User Scripts plugin for this. Earlier versions of this guide did,
and a `docker run` from User Scripts starts a second container with its own
config, which drifts from the one the app is actually using.

---

## Step 9 (optional): Cloudflare tunnel

When you're ready for external access:

1. Set up a Cloudflare Tunnel pointing to `http://YOUR_UNRAID_IP:3100`
2. No SSL configuration needed — Cloudflare handles it

---

## Updating

When new code is pushed to `main`, GitHub Actions builds a new image
automatically. To update on Unraid:

```bash
docker pull ghcr.io/pgillespie84/actual-insights:latest
```

Then restart the `actual-insights` container from the Unraid Docker UI.
Migrations apply themselves on start.

---

## Checking on it

```bash
docker logs actual-insights              # app and scheduler logs
docker logs actual-insights -f           # follow
docker logs actual-insights --since 1h   # last hour
```
