This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Configuration

### Household config

Your account names, category skip lists, and net-worth groupings live in a JSON file, separate from the code:

```bash
cp config/dashboard.example.json config/dashboard.json
```

Edit `config/dashboard.json` to match your Actual Budget setup. It is gitignored — it describes your real accounts, so keep it out of version control. If it is missing, the app falls back to `config/dashboard.example.json` and starts with placeholder names.

In production, mount it on a volume and point `DASHBOARD_CONFIG` at it (`/data/config.json` in the supplied compose file) so it survives image updates.

### Environment variables

Everything else is provided via environment variables (`.env` for local dev, container env in production).

### Required

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
| `ANTHROPIC_API_KEY` | Enables AI-generated monthly insights via Claude. If unset, the AI Insight card is hidden. |
| `SPOTLIGHT_CATEGORIES` | Comma-separated list of **exactly 3** Actual Budget category names to show as spotlight cards on the dashboard (e.g. `Grocery,Takeout,Subscriptions`). Whitespace around entries is trimmed. If unset or invalid, the spotlight column is hidden. |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# actual_dashboard
