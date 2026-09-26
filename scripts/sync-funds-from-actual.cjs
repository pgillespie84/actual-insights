/**
 * Fills the synced savings fund group from Actual account balances.
 *
 * The sync already does this at the end of every run; this script is for
 * previewing it the first time, or re-running it without a full sync. It
 * reads only what is already in Postgres — the accounts and the daily balance
 * snapshots — so it never talks to the Actual server.
 *
 * Usage:
 *   node scripts/sync-funds-from-actual.cjs --dry-run
 *   node scripts/sync-funds-from-actual.cjs
 *   docker exec -it actual-insights node scripts/sync-funds-from-actual.cjs --dry-run
 *
 * The group comes from SYNCED_FUND_GROUP in the household config. See
 * src/lib/fundsFromActual.cjs for how funds are matched to accounts and which
 * months are overwritten.
 */

const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");
const { syncedFundGroup, syncFundsFromActual } = require("../src/lib/fundsFromActual.cjs");
const { getCurrentMonthKeyET } = require("../src/lib/timezone.cjs");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const group = syncedFundGroup(loadConfig());
  if (!group) {
    console.error(
      'SYNCED_FUND_GROUP is not set in the household config. Add e.g. "SYNCED_FUND_GROUP": "Others".',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (dryRun) console.log("--- Dry run, nothing written ---");
    await syncFundsFromActual(pool, { group, currentMonth: getCurrentMonthKeyET(), dryRun });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
