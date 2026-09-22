/**
 * The shape of a savings fund: what a valid one looks like, how a typed
 * amount becomes cents, and how a month with no entry is filled in.
 *
 * Pure on purpose, and CJS for the same reason `monthNoteShape.cjs` is: the
 * admin form, the API route and `scripts/import-fund-history.cjs` all need
 * these rules, and the import script runs under plain node outside the Next
 * build. One copy means a figure typed into the form and the same figure
 * arriving from the spreadsheet are parsed by the same code.
 *
 * Nothing here touches the database. The queries live in `savingsFunds.ts`.
 */

const { isValidMonthKey } = require("./monthNoteShape.cjs");

/** Long enough for "College Fund for E - Joint Taxable", short enough to fit a row. */
const MAX_FUND_NAME_LENGTH = 60;

/** Same ceiling for the group; it is a label, not a sentence. */
const MAX_GROUP_NAME_LENGTH = 40;

/**
 * The largest balance the form accepts, in cents — ten million dollars.
 *
 * Not a statement about the household's savings. It is the difference between
 * a fat-fingered extra zero showing up as a wrong number on the dashboard and
 * showing up as an error while the right figure is still on the clipboard.
 */
const MAX_BALANCE_CENTS = 1_000_000_000;

/**
 * Turns what someone typed into cents.
 *
 * Accepts what a person actually pastes out of a spreadsheet: `$3,953.32`,
 * `3953.32`, `-$40.00`, `(40.00)` for the accounting negative, and a bare
 * `-`. Returns null for anything it cannot read, so the caller decides
 * whether that is an error or an empty box — the entry grid leaves boxes
 * blank far more often than it gets them wrong.
 *
 * Rounds rather than truncates: `10.005` typed by hand is a tenth of a cent
 * from 10.01, and floating point makes truncation land on 10.00 often enough
 * to matter over 19 funds.
 *
 * @param {unknown} input
 * @returns {number | null} cents, or null when the input is not a number
 */
function parseAmountToCents(input) {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  if (typeof input !== "string") return null;

  let text = input.trim();
  if (text === "") return null;

  // Parentheses are how a spreadsheet writes a negative, and they survive a
  // copy-paste. Handled before the strip so the sign is not lost with them.
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // The true minus sign (U+2212) appears in anything copied back off this
  // dashboard, which formats negatives with it.
  text = text.replace(/−/g, "-");

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1).trim();
  }

  text = text.replace(/[$,\s]/g, "");
  if (text === "" || !/^\d*\.?\d*$/.test(text) || text === ".") return null;

  const value = Number(text);
  if (!Number.isFinite(value)) return null;

  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/**
 * Checks a fund submitted from the form or built by the import.
 *
 * @returns {string | null} a message to show, or null when the fund is fine
 */
function validateFund({ name, group, archivedFrom } = {}) {
  const fundName = typeof name === "string" ? name.trim() : "";
  if (fundName.length === 0) return "Give the fund a name.";
  if (fundName.length > MAX_FUND_NAME_LENGTH) {
    return `Keep the fund name under ${MAX_FUND_NAME_LENGTH} characters.`;
  }

  const groupName = typeof group === "string" ? group.trim() : "";
  if (groupName.length === 0) return "Pick a group for the fund.";
  if (groupName.length > MAX_GROUP_NAME_LENGTH) {
    return `Keep the group name under ${MAX_GROUP_NAME_LENGTH} characters.`;
  }

  if (archivedFrom != null && archivedFrom !== "" && !isValidMonthKey(archivedFrom)) {
    return "The archive month has to be YYYY-MM format, or left blank.";
  }

  return null;
}

/**
 * Trims a submitted fund into the shape the database stores. An empty archive
 * month becomes null rather than "", so the column means one thing and
 * `isFundVisibleIn` does not have to treat "" as live.
 *
 * @param {{name: string, group: string, archivedFrom?: string | null}} input
 * @returns {{name: string, group: string, archivedFrom: string | null}}
 */
function normalizeFund({ name, group, archivedFrom }) {
  return {
    name: name.trim(),
    group: group.trim(),
    archivedFrom: archivedFrom ? archivedFrom : null,
  };
}

/**
 * Checks one balance from the entry grid.
 *
 * Negative balances are valid and deliberately not flagged — a fund can be
 * overdrawn against its own plan, and the household's spreadsheet is full of
 * them.
 *
 * @returns {string | null}
 */
function validateBalance({ monthKey, balance } = {}) {
  if (!isValidMonthKey(monthKey)) return "Pick a month in YYYY-MM format.";
  if (!Number.isInteger(balance)) return "That is not an amount.";
  if (Math.abs(balance) > MAX_BALANCE_CENTS) {
    return "That looks like a typo — check the number of zeros.";
  }
  return null;
}

/**
 * Whether a fund should appear when looking at `monthKey`.
 *
 * Archiving is recorded as the month the fund stopped counting, so a fund
 * archived in September is still there in March. Without that, tidying the
 * list today would silently rewrite every past month and the printed PDFs
 * would stop matching the ones already sent.
 */
function isFundVisibleIn(fund, monthKey) {
  return !fund.archivedFrom || monthKey < fund.archivedFrom;
}

/**
 * The balance to show for one fund in one month, and where it came from.
 *
 * `balances` is that fund's rows, any order. The newest row at or before
 * `monthKey` wins; if it is not from `monthKey` itself the figure is carried
 * forward, and `asOf` says which month it actually is. A fund with nothing at
 * or before the month has no balance at all — that is a genuine absence, not
 * a zero, and a zero would claim the fund is empty when nobody has ever said
 * so.
 *
 * @param {{monthKey: string, balance: number}[]} balances
 * @param {string} monthKey
 * @returns {{balance: number, asOf: string, carried: boolean} | null}
 */
function resolveBalance(balances, monthKey) {
  let best = null;
  for (const row of balances) {
    if (row.monthKey > monthKey) continue;
    if (best === null || row.monthKey > best.monthKey) best = row;
  }
  if (best === null) return null;
  return {
    balance: best.balance,
    asOf: best.monthKey,
    carried: best.monthKey !== monthKey,
  };
}

/**
 * Groups in the order they should appear.
 *
 * By the order the groups were first created, which the caller passes in as
 * `fundsInCreationOrder`. Alphabetical would put Long Term above Short Term,
 * which is upside down against how the household writes it; sorting by total
 * would let the blocks swap places from one month to the next. Creation order
 * comes out of the import matching the spreadsheet, and then never moves.
 *
 * @param {{group: string}[]} fundsInCreationOrder
 * @returns {string[]}
 */
function groupsInOrder(fundsInCreationOrder) {
  const seen = [];
  for (const fund of fundsInCreationOrder) {
    if (!seen.includes(fund.group)) seen.push(fund.group);
  }
  return seen;
}

module.exports = {
  MAX_FUND_NAME_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_BALANCE_CENTS,
  isValidMonthKey,
  parseAmountToCents,
  validateFund,
  normalizeFund,
  validateBalance,
  isFundVisibleIn,
  resolveBalance,
  groupsInOrder,
};
