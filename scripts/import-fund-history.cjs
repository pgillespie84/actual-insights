/**
 * One-time import of the household's savings fund history from a spreadsheet
 * export.
 *
 * The sheet is the source: one row per fund, one column per month. Everything
 * that decides what the file means — which columns are months, which rows are
 * totals, which zeros are months that have not happened yet — lives in
 * `src/lib/fundImport.cjs` and is unit-tested. This file reads, reports and
 * writes.
 *
 * Usage:
 *   node scripts/import-fund-history.cjs funds.csv --dry-run
 *   node scripts/import-fund-history.cjs funds.csv
 *   docker exec -it actual-insights node scripts/import-fund-history.cjs /data/funds.csv
 *
 * Options:
 *   --dry-run        print what would be written and change nothing
 *   --group=<name>   the group for sheets with no Group or Mapping column
 *
 * Idempotent, with one exception: funds are matched by name and balances
 * upsert on (fund, month), so re-running a corrected file fixes the figures
 * rather than duplicating them — but it does not fix the *order*. A fund that
 * already exists keeps the createdAt it was first given, and that is what the
 * dashboard reads group order off. Reordering the sheet and re-running will
 * not reorder the dashboard.
 *
 * To fix an order, update the timestamps:
 *
 *   UPDATE "SavingsFund" SET "createdAt" = '<a UTC time before the next fund>'
 *   WHERE name = '<fund>';
 *
 * UTC, because that is the clock both writers here use — see the note on
 * importedAt below.
 *
 * Deleting the funds and re-importing also works and is worse: balances
 * cascade with the fund, so every month it ever held goes with it, and a
 * re-run only restores the months the current sheet still carries. Since this
 * script deliberately drops trailing empty months and never deletes — on the
 * grounds that the sheet may simply have been trimmed — that is a real way to
 * lose history the database was keeping on purpose.
 *
 * It never deletes: a row that has dropped out of the sheet stays in the
 * database, because the sheet may simply have been trimmed.
 */

const fs = require("node:fs");
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { buildImport } = require("../src/lib/fundImport.cjs");
const { validateFund, validateBalance } = require("../src/lib/savingsFundShape.cjs");

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseArgs(argv) {
  const args = { file: null, dryRun: false, group: undefined };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--group=")) args.group = arg.slice("--group=".length).trim();
    else if (!arg.startsWith("--") && args.file === null) args.file = arg;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error("Usage: node scripts/import-fund-history.cjs <file.csv> [--dry-run] [--group=Name]");
    process.exit(1);
  }
  if (!fs.existsSync(args.file)) {
    console.error(`No such file: ${args.file}`);
    process.exit(1);
  }

  const text = fs.readFileSync(args.file, "utf8");
  const { funds, balances, warnings, droppedMonths } = buildImport(text, { group: args.group });

  console.log(`Read ${args.file}`);
  console.log(`  ${funds.length} funds, ${balances.length} balances`);
  if (droppedMonths.length > 0) {
    // Named rather than counted: "skipped 3 months" invites the reader to
    // assume they were the right three.
    console.log(`  Skipped months with no figures anywhere: ${droppedMonths.join(", ")}`);
  }
  for (const warning of warnings) console.log(`  WARNING: ${warning}`);

  // A fund the API would reject must not reach the database through the side
  // door — the form and the import agree on what a valid fund is.
  const invalid = funds
    .map((fund) => ({ fund, problem: validateFund(fund) }))
    .filter((entry) => entry.problem);
  if (invalid.length > 0) {
    for (const entry of invalid) {
      console.error(`  INVALID: "${entry.fund.name}" — ${entry.problem}`);
    }
    console.error("Nothing was written. Fix the file and run again.");
    process.exit(1);
  }

  // Balances are held to the same ceiling the admin form applies. Without
  // this a cell with an extra zero reaches Postgres, where anything over
  // 2,147,483,647 cents overflows an integer column and aborts the run
  // halfway with a raw driver error instead of the report above.
  const badBalances = balances
    .map((b) => ({ b, problem: validateBalance({ monthKey: b.monthKey, balance: b.balance }) }))
    .filter((entry) => entry.problem);
  if (badBalances.length > 0) {
    for (const entry of badBalances) {
      console.error(`  INVALID: "${entry.b.name}" ${entry.b.monthKey} — ${entry.problem}`);
    }
    console.error("Nothing was written. Fix the file and run again.");
    process.exit(1);
  }

  if (funds.length === 0) {
    console.error("Nothing to import.");
    process.exit(1);
  }

  // A sheet whose headers were all unreadable would otherwise write every
  // fund with no history at all, and the script never deletes, so a corrected
  // re-run would leave those empty funds behind.
  if (balances.length === 0) {
    console.error("No balances were read — check the month column headers.");
    process.exit(1);
  }

  const byGroup = new Map();
  for (const fund of funds) byGroup.set(fund.group, (byGroup.get(fund.group) ?? 0) + 1);
  for (const [group, count] of byGroup) console.log(`  ${group}: ${count} funds`);

  const months = [...new Set(balances.map((b) => b.monthKey))].sort();
  if (months.length > 0) {
    console.log(`  Months: ${months[0]} to ${months[months.length - 1]}`);
  }

  if (args.dryRun) {
    console.log("\n--- Dry run, nothing written ---");
    for (const fund of funds) {
      const mine = balances.filter((b) => b.name === fund.name);
      const last = mine[mine.length - 1];
      console.log(
        `  ${fund.group} / ${fund.name}: ${mine.length} months` +
          (last ? `, latest ${last.monthKey} ${formatCents(last.balance)}` : ""),
      );
    }
    console.log("Done.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let createdFunds = 0;
  let writtenBalances = 0;

  try {
    // One transaction: a half-imported sheet is harder to reason about than
    // one that did not import, and the whole thing is a few hundred rows.
    await pool.query("BEGIN");

    const idByName = new Map();

    // The order the sheet had, written down rather than inferred from how
    // fast the inserts happened.
    //
    // clock_timestamp() was the first attempt and is not enough: createdAt is
    // TIMESTAMP(3), so its microseconds are stored to the nearest
    // millisecond, and nineteen round trips to a database on the same host
    // regularly finish several inside one. Tied rows fall through to the id,
    // which is a random UUID — so the sheet's order would have held most of
    // the time and silently inverted the rest, which is the worst of both.
    //
    // One base instant plus the row's index is strictly increasing and does
    // not depend on timing at all. It makes createdAt mean "imported, in this
    // position" rather than a true instant; the column is only ever read for
    // ordering.
    //
    // The base is UTC, because that is what the other writer uses.
    //
    // createdAt is TIMESTAMP *without* time zone, so whatever wall clock is
    // written is stored verbatim, and the two writers have to agree. The
    // column's DEFAULT is CURRENT_TIMESTAMP — database-local — but the admin
    // route never reaches it: `createdAt` is `@default(now())`, which Prisma
    // evaluates itself and sends as a UTC parameter, so the default never
    // fires.
    //
    // Checked rather than reasoned about, because this was got wrong once in
    // the other direction: against a database set to Europe/Berlin, a fund
    // added from the admin page nineteen seconds after an import using
    // CURRENT_TIMESTAMP stored 17:42 against the sheet's 19:42, and sorted
    // ahead of every fund in it. Verifying on a database west of UTC hides
    // that, since UTC is then ahead and the order comes out right by luck.
    const importedAt = Date.now();

    for (const [index, fund] of funds.entries()) {
      // The group is deliberately not updated on an existing fund. Once the
      // household has moved a fund on the admin page, re-running the import
      // must not drag it back to wherever the spreadsheet still files it.
      const existing = await pool.query(`SELECT id FROM "SavingsFund" WHERE name = $1`, [
        fund.name,
      ]);
      if (existing.rows.length > 0) {
        idByName.set(fund.name, existing.rows[0].id);
        continue;
      }
      // createdAt is passed rather than defaulted. The column default is
      // CURRENT_TIMESTAMP, which in Postgres is the *transaction* start time,
      // so every fund in this one transaction would land on the same instant
      // — and the dashboard reads group order off createdAt. See importedAt.
      const created = await pool.query(
        `INSERT INTO "SavingsFund" (id, name, "group", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id`,
        // One base instant plus the row's index: strictly increasing, and it
        // does not depend on how fast the inserts ran.
        [fund.name, fund.group, new Date(importedAt + index).toISOString()],
      );
      idByName.set(fund.name, created.rows[0].id);
      createdFunds++;
    }

    for (const balance of balances) {
      await pool.query(
        `INSERT INTO "SavingsFundBalance" ("fundId", "monthKey", balance)
         VALUES ($1, $2, $3)
         ON CONFLICT ("fundId", "monthKey") DO UPDATE SET balance = EXCLUDED.balance`,
        [idByName.get(balance.name), balance.monthKey, balance.balance],
      );
      writtenBalances++;
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await pool.end();
  }

  console.log("\n--- Summary ---");
  console.log(`Funds created: ${createdFunds} (${funds.length - createdFunds} already existed)`);
  console.log(`Balances written: ${writtenBalances}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
