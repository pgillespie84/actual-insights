/**
 * One-time backfill script: reconstructs daily AccountBalanceSnapshot history
 * for Savings and Debt — Loans accounts by walking transactions backwards from
 * each account's current balance.
 *
 * Investment accounts are intentionally skipped (would be inaccurate without
 * true historical snapshots).
 *
 * Usage:
 *   docker exec -it actual-dashboard node scripts/backfill-snapshots.cjs
 *
 * Idempotent: re-running overwrites existing rows via ON CONFLICT ... DO UPDATE.
 */

const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");

const { NET_WORTH_GROUPS } = loadConfig();

const TARGET_ACCOUNTS = [...NET_WORTH_GROUPS["Savings"], ...NET_WORTH_GROUPS["Debt — Loans"]];

/**
 * Return today's date string in Eastern Time as YYYY-MM-DD.
 */
function getTodayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

/**
 * Add one day to a YYYY-MM-DD string and return the next date string.
 */
function addDay(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z"); // noon UTC to avoid DST edge cases
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const todayET = getTodayET();

  console.log(`Backfilling account balance snapshots (today ET: ${todayET})`);
  console.log(`Target accounts: ${TARGET_ACCOUNTS.join(", ")}\n`);

  let accountsProcessed = 0;
  let totalRows = 0;
  let earliestDate = null;
  let latestDate = null;

  try {
    for (const accountName of TARGET_ACCOUNTS) {
      // Look up account by name
      const acctResult = await pool.query(
        `SELECT id, name, balance FROM "Account" WHERE name = $1`,
        [accountName]
      );

      if (acctResult.rows.length === 0) {
        console.log(`  SKIP: Account "${accountName}" not found in DB`);
        continue;
      }

      const account = acctResult.rows[0];

      // Get all transactions for this account, ordered by date DESC
      const txResult = await pool.query(
        `SELECT date, amount FROM "Transaction"
         WHERE "accountId" = $1
         ORDER BY date DESC`,
        [account.id]
      );

      if (txResult.rows.length === 0) {
        console.log(`  SKIP: Account "${accountName}" has no transactions`);
        continue;
      }

      // Group transactions by date and sum amounts per day
      const txByDate = new Map();
      for (const tx of txResult.rows) {
        const dateStr = tx.date.toISOString().slice(0, 10);
        txByDate.set(dateStr, (txByDate.get(dateStr) || 0) + tx.amount);
      }

      // Determine date range
      const sortedDates = [...txByDate.keys()].sort();
      const firstTxDate = sortedDates[0];

      // Walk backwards from today with balance = current account balance.
      // For each day going back to the earliest transaction, compute end-of-day
      // balance by subtracting that day's transactions (since those transactions
      // brought us from previous day's balance to today's).
      //
      // We iterate forward from firstTxDate to todayET, but we compute balances
      // by starting from todayET and working backwards.
      let balance = account.balance;
      const dailyBalances = new Map();

      // Start at today, walk backwards to firstTxDate
      let cursor = todayET;
      while (cursor >= firstTxDate) {
        dailyBalances.set(cursor, balance);
        // Subtract this day's transactions to get previous day's end-of-day balance
        const dayAmount = txByDate.get(cursor) || 0;
        balance -= dayAmount;
        // Move to previous day
        const d = new Date(cursor + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }

      // Batch upsert all snapshot rows
      let rowCount = 0;
      for (const [dateStr, bal] of dailyBalances) {
        await pool.query(
          `INSERT INTO "AccountBalanceSnapshot" ("accountId", date, balance)
           VALUES ($1, $2, $3)
           ON CONFLICT ("accountId", date) DO UPDATE SET balance = EXCLUDED.balance`,
          [account.id, dateStr, bal]
        );
        rowCount++;
      }

      console.log(`  OK: "${accountName}" — ${rowCount} snapshots (${firstTxDate} to ${todayET})`);
      accountsProcessed++;
      totalRows += rowCount;

      if (!earliestDate || firstTxDate < earliestDate) earliestDate = firstTxDate;
      if (!latestDate || todayET > latestDate) latestDate = todayET;
    }

    console.log("\n--- Summary ---");
    console.log(`Accounts processed: ${accountsProcessed}`);
    console.log(`Total rows upserted: ${totalRows}`);
    if (earliestDate && latestDate) {
      console.log(`Date range: ${earliestDate} to ${latestDate}`);
    }
  } catch (error) {
    console.error("Backfill failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
