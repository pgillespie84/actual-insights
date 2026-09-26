/**
 * Savings funds whose figures come from Actual instead of being typed in.
 *
 * Every fund in one configured group (`SYNCED_FUND_GROUP`) is matched by name
 * to an Actual account, and each month's figure is that account's balance at
 * the end of the month, read off the snapshots the sync already keeps. The
 * rest of the funds are untouched: they are earmarks inside a shared savings
 * account, and no account in Actual knows how that money is split.
 *
 * The figures overwrite whatever is in the table for the months the
 * snapshots cover, typed ones included. For these funds the account is the
 * source of truth and the ledger is a copy of it. Months before the first
 * snapshot are left alone, so history imported from the spreadsheet survives
 * where Actual has nothing to say.
 *
 * `planFundsFromActual` is pure and does the deciding. `syncFundsFromActual`
 * reads and writes, and is shared by `scripts/sync.cjs` and
 * `scripts/sync-funds-from-actual.cjs`.
 */

const { validateBalance } = require("./savingsFundShape.cjs");
const { insertRows } = require("./batchInsert.cjs");

/**
 * The configured group, or null when the feature is off.
 *
 * Optional, so every config written before the key existed keeps booting and
 * keeps every fund hand-typed. Anything that is not a non-empty string counts
 * as off rather than as an error: the cost of a typo is that the funds stay
 * as typed, which is how they were before.
 *
 * @param {{SYNCED_FUND_GROUP?: unknown}} config
 * @returns {string | null}
 */
function syncedFundGroup(config) {
  const value = config.SYNCED_FUND_GROUP;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** `2026-09` → `2026-10`. */
function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Account names compared the way a person would read them.
 *
 * Case and surrounding spaces are ignored because the two names are typed in
 * two different apps, and "Travel fund" against "Travel Fund" failing to match
 * would be a silent nothing: the fund just keeps its old figure.
 */
function sameName(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Decides what to write.
 *
 * A month's figure is the last snapshot dated in or before that month, so a
 * month with no sync in it takes the balance from the last one there was —
 * which is what the account held, since nothing synced means nothing was
 * seen to change. Months run from the account's first snapshot to
 * `currentMonth`; the current month's figure is today's balance and moves
 * with every sync until the month closes.
 *
 * @param {Object} input
 * @param {{id: string, name: string, archivedFrom: string | null}[]} input.funds
 *   the funds in the synced group
 * @param {{id: string, name: string}[]} input.accounts
 * @param {{accountId: string, date: string, balance: number}[]} input.snapshots
 *   `date` as `YYYY-MM-DD`
 * @param {string} input.currentMonth `YYYY-MM`
 * @returns {{
 *   rows: {fundId: string, name: string, monthKey: string, balance: number}[],
 *   problems: string[],
 * }}
 */
function planFundsFromActual({ funds, accounts, snapshots, currentMonth }) {
  const rows = [];
  const problems = [];

  for (const fund of funds) {
    const matches = accounts.filter((a) => sameName(a.name, fund.name));
    if (matches.length === 0) {
      problems.push(`"${fund.name}" has no Actual account with that name — left as typed.`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`"${fund.name}" matches ${matches.length} Actual accounts — left as typed.`);
      continue;
    }

    const own = snapshots
      .filter((s) => s.accountId === matches[0].id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (own.length === 0) {
      problems.push(`"${fund.name}" has no balance history yet — run a sync first.`);
      continue;
    }

    let i = 0;
    let balance = null;
    for (let month = own[0].date.slice(0, 7); month <= currentMonth; month = nextMonthKey(month)) {
      while (i < own.length && own[i].date.slice(0, 7) <= month) {
        balance = own[i].balance;
        i += 1;
      }
      // An archived fund is not shown from its archive month on, so writing
      // figures there would only fill the table with rows nothing reads.
      if (fund.archivedFrom && month >= fund.archivedFrom) break;

      const problem = validateBalance({ monthKey: month, balance });
      if (problem) {
        problems.push(`"${fund.name}" ${month}: ${problem} Skipped.`);
        continue;
      }
      rows.push({ fundId: fund.id, name: fund.name, monthKey: month, balance });
    }
  }

  return { rows, problems };
}

function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Reads the group's funds and their accounts' history, and writes the figures
 * that differ from what is stored.
 *
 * Only changed rows are written and reported, so the sync log says "2 fund
 * figures updated" on a normal day rather than restating every month.
 *
 * @param {import("pg").Pool} pool
 * @param {{group: string, currentMonth: string, dryRun?: boolean,
 *   log?: (line: string) => void}} options
 * @returns {Promise<{written: number, problems: string[]}>}
 */
async function syncFundsFromActual(pool, { group, currentMonth, dryRun = false, log = console.log }) {
  const { rows: funds } = await pool.query(
    `SELECT id, name, "archivedFrom" FROM "SavingsFund" WHERE "group" = $1`,
    [group],
  );
  if (funds.length === 0) {
    const problem = `No savings funds are in the group "${group}" — nothing to fill from Actual.`;
    log(`  ${problem}`);
    return { written: 0, problems: [problem] };
  }

  const { rows: accounts } = await pool.query(`SELECT id, name FROM "Account"`);
  // to_char, not the column itself: node-postgres turns a DATE into a JS Date
  // at local midnight, and a container on UTC and a Mac on Eastern would then
  // disagree about which month a snapshot on the 1st belongs to.
  const { rows: snapshots } = await pool.query(
    `SELECT "accountId", to_char(date, 'YYYY-MM-DD') AS date, balance
     FROM "AccountBalanceSnapshot"`,
  );
  const { rows: existing } = await pool.query(
    `SELECT "fundId", "monthKey", balance FROM "SavingsFundBalance"
     WHERE "fundId" = ANY($1)`,
    [funds.map((f) => f.id)],
  );

  const { rows, problems } = planFundsFromActual({
    funds,
    accounts,
    snapshots: snapshots.map((s) => ({ ...s, balance: Number(s.balance) })),
    currentMonth,
  });

  const stored = new Map(existing.map((e) => [`${e.fundId} ${e.monthKey}`, Number(e.balance)]));
  const changed = rows.filter((r) => stored.get(`${r.fundId} ${r.monthKey}`) !== r.balance);

  for (const problem of problems) log(`  WARNING: ${problem}`);
  for (const r of changed) {
    const before = stored.get(`${r.fundId} ${r.monthKey}`);
    log(
      `  ${r.name} ${r.monthKey}: ` +
        (before === undefined ? "" : `${formatCents(before)} → `) +
        formatCents(r.balance),
    );
  }

  if (!dryRun) {
    await insertRows(
      pool,
      {
        table: "SavingsFundBalance",
        columns: ["fundId", "monthKey", "balance"],
        conflictTarget: ["fundId", "monthKey"],
      },
      changed.map((r) => [r.fundId, r.monthKey, r.balance]),
    );
  }
  log(
    `  ${changed.length} fund ${changed.length === 1 ? "figure" : "figures"} ` +
      `${dryRun ? "would be updated" : "updated"} from Actual (group "${group}")`,
  );

  return { written: dryRun ? 0 : changed.length, problems };
}

module.exports = { syncedFundGroup, planFundsFromActual, syncFundsFromActual, nextMonthKey };
