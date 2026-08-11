# Actual Budget Dashboard — Unraid Setup Guide

## Prerequisites

- Unraid server with Docker enabled
- Actual Budget running on your LAN (e.g., `http://YOUR-SERVER-IP:5006`)
- GitHub account with access to the `pgillespie84/actual-insights` repo

---

## Step 1: Create a GitHub Personal Access Token

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

## Step 3: Create the Postgres Container

In the Unraid web UI:

1. Go to the **Docker** tab
2. Click **Add Container**
3. Fill in:

| Field | Value |
|---|---|
| **Name** | `actual-dashboard-db` |
| **Repository** | `postgres:16-alpine` |

4. Click **Add another Path, Port, Variable, Label or Device** and add these **3 variables**:

| Config Type | Name | Value |
|---|---|---|
| Variable | `POSTGRES_USER` | `postgres` |
| Variable | `POSTGRES_PASSWORD` | `postgres` |
| Variable | `POSTGRES_DB` | `actual_dashboard` |

5. Add a **path** for persistent storage:

| Config Type | Name | Container Path | Host Path |
|---|---|---|---|
| Path | `data` | `/var/lib/postgresql/data` | `/mnt/user/appdata/actual-dashboard-db` |

6. Click **Apply** and wait for the container to start

---

## Step 4: Get the Postgres Container IP

SSH into Unraid and run:

```bash
docker inspect actual-dashboard-db | grep IPAddress
```

Note the IP address (e.g., `172.17.0.X`). You'll use this as `DB_IP` in the steps below.

---

## Step 5: Run the Database Migration

This creates the tables in Postgres. Replace `DB_IP` with the IP from Step 4:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://postgres:postgres@DB_IP:5444/actual_dashboard" \
  ghcr.io/pgillespie84/actual-insights:latest \
  npx prisma migrate deploy
```

---

## Step 6: Create the App Container

In the Unraid web UI:

1. Go to the **Docker** tab
2. Click **Add Container**
3. Fill in:

| Field | Value |
|---|---|
| **Name** | `actual-dashboard` |
| **Repository** | `ghcr.io/pgillespie84/actual-insights:latest` |

4. Add a **port mapping**:

| Config Type | Name | Container Port | Host Port |
|---|---|---|---|
| Port | `webui` | `3000` | `3100` |

5. Add these **5 variables** (replace `DB_IP` with the IP from Step 4):

| Config Type | Name | Value |
|---|---|---|
| Variable | `DATABASE_URL` | `postgresql://postgres:postgres@DB_IP:5432/actual_dashboard` |
| Variable | `SITE_PASSWORD` | *(your chosen dashboard password)* |
| Variable | `ACTUAL_SERVER_URL` | `http://YOUR-SERVER-IP:5006` |
| Variable | `ACTUAL_PASSWORD` | *(your Actual Budget password)* |
| Variable | `ACTUAL_SYNC_ID` | `YOUR-BUDGET-SYNC-ID` |

6. Click **Apply**

---

## Step 7: Run the Initial Data Sync

This pulls all your data from Actual Budget into Postgres. Replace `DB_IP`:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://postgres:postgres@DB_IP:5444/actual_dashboard" \
  -e ACTUAL_SERVER_URL="http://YOUR-SERVER-IP:5006" \
  -e ACTUAL_PASSWORD="RjPjG-11" \
  -e ACTUAL_SYNC_ID="YOUR-BUDGET-SYNC-ID" \
  ghcr.io/pgillespie84/actual-insights:latest \
  node scripts/sync.cjs
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

---

## Step 8: Access the Dashboard

Open your browser and go to:

```
http://YOUR_UNRAID_IP:3100
```

Log in with the `SITE_PASSWORD` you set in Step 6.

---

## Step 9: Set Up Daily Sync (User Scripts Plugin)

1. Install the **User Scripts** plugin from Community Applications if you don't have it
2. Go to **Settings > User Scripts**
3. Click **Add New Script**, name it `actual-dashboard-sync`
4. Click the gear icon and **Edit Script**, paste:

```bash
#!/bin/bash
docker run --rm \
  -e DATABASE_URL="postgresql://postgres:postgres@DB_IP:5432/actual_dashboard" \
  -e ACTUAL_SERVER_URL="http://YOUR-SERVER-IP:5006" \
  -e ACTUAL_PASSWORD="YOUR_ACTUAL_PASSWORD" \
  -e ACTUAL_SYNC_ID="YOUR-BUDGET-SYNC-ID" \
  ghcr.io/pgillespie84/actual-insights:latest \
  node scripts/sync.cjs
```

5. Set the schedule to **Custom** and enter: `0 2 * * *` (runs daily at 2 AM)
6. Click **Apply**

---

## Step 10 (Optional): Cloudflare Tunnel

When you're ready for external access:

1. Set up a Cloudflare Tunnel pointing to `http://YOUR_UNRAID_IP:3100`
2. No SSL configuration needed — Cloudflare handles it

---

## Updating the Dashboard

When new code is pushed to `main`, GitHub Actions builds a new image automatically. To update on Unraid:

```bash
docker pull ghcr.io/pgillespie84/actual-insights:latest
```

Then restart the `actual-dashboard` container from the Unraid Docker UI.
