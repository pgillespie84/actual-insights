/**
 * Turning the household's savings spreadsheet into fund rows.
 *
 * The sheet is wide — one row per fund, one column per month — because that
 * is what exports out of it without a manual transpose. Everything in this
 * file is pure text-in, rows-out, so the awkward parts (which columns are
 * months, which rows are totals, which zeros are real) are testable without a
 * database or a file.
 *
 * Used by `scripts/import-fund-history.cjs`, which is the only caller and
 * does nothing but read the file, print what this returned, and write it.
 */

const { parseAmountToCents } = require("./savingsFundShape.cjs");

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** The column that names the fund, whichever the sheet calls it. */
const NAME_HEADERS = ["account", "fund", "name"];

/** The column that names the group, if the sheet has one. */
const GROUP_HEADERS = ["group", "mapping", "horizon"];

/**
 * The opening-balance column, which carries no year of its own.
 *
 * Named rather than matched loosely: "Start of the Year" is the sheet's
 * wording, and treating any unrecognised header as an opening balance would
 * silently import a stray notes column as money.
 */
const OPENING_HEADERS = ["start of the year", "start of year", "opening", "opening balance"];

/**
 * Splits CSV text into rows of cells, honouring quotes.
 *
 * Written out rather than pulled from a dependency because the input is one
 * spreadsheet export a household runs once, and the failure mode of a wrong
 * parse here is visible immediately in the dry run. Handles doubled quotes
 * inside a quoted cell, CRLF, and a trailing newline. Tabs are accepted as a
 * separator too, so a block pasted straight out of the sheet works.
 */
function parseDelimited(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  // Chosen once from the first line rather than per row, so a comma inside an
  // unquoted cell of a tab-separated paste cannot switch the parser mid-file.
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Reads a column header as a month.
 *
 * Accepts `Jan-26`, `Jan-2026`, `January 2026`, `2026-01` and `01/2026`. A
 * two-digit year means 2000s, which is the only reading that makes sense for
 * a household budget sheet.
 *
 * @returns {string | null} `YYYY-MM`, or null when the header is not a month
 */
function parseMonthHeader(header) {
  const text = String(header ?? "").trim().toLowerCase();
  if (text === "") return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const month = Number(iso[2]);
    return month >= 1 && month <= 12 ? `${iso[1]}-${String(month).padStart(2, "0")}` : null;
  }

  const numeric = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? `${numeric[2]}-${String(month).padStart(2, "0")}` : null;
  }

  const named = text.match(/^([a-z]{3,9})[-/\s](\d{2}|\d{4})$/);
  if (named) {
    const index = MONTH_NAMES.indexOf(named[1].slice(0, 3));
    if (index === -1) return null;
    const year = named[2].length === 2 ? 2000 + Number(named[2]) : Number(named[2]);
    return `${year}-${String(index + 1).padStart(2, "0")}`;
  }

  return null;
}

function isOpeningHeader(header) {
  return OPENING_HEADERS.includes(String(header ?? "").trim().toLowerCase());
}

/**
 * The month immediately before the earliest real month column.
 *
 * The opening column carries no date of its own, only the sense of "where
 * this fund stood before the first column". For the household's sheet, which
 * runs January to December, that is the previous December — but reading the
 * rule as "December" rather than "the month before" files the opening a whole
 * year early on any sheet that starts in another month, and on a sheet
 * running December to November it would also collide with a real column.
 */
function monthBeforeEarliest(monthKeys) {
  if (monthKeys.length === 0) return null;
  const earliest = monthKeys.reduce((min, m) => (m < min ? m : min));
  const [year, month] = earliest.split("-").map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/**
 * The group a row belongs to.
 *
 * A `Mapping` column reading "Short Term 1" is the sheet's own numbering, so
 * the trailing number comes off and the group is "Short Term". That is what
 * makes the sheet importable as-is; a `Group` column, if there is one, is
 * taken at face value.
 */
function groupFromRow(value, fallback) {
  const text = String(value ?? "").trim();
  if (text === "") return fallback;
  const stripped = text.replace(/\s+\d+$/, "").trim();
  return stripped === "" ? fallback : stripped;
}

/**
 * A row that totals other rows rather than being a fund.
 *
 * The sheet's "Short Term Total" line sums the block above it, and importing
 * it would double every figure in the group. Matched on either column, since
 * the sheet labels the total in the mapping column and calls the account
 * simply "Total".
 */
function isTotalRow(name, mapping) {
  return /(^|\s)totals?$/i.test(String(name ?? "").trim()) ||
    /(^|\s)totals?$/i.test(String(mapping ?? "").trim());
}

/**
 * Builds the funds and balances a CSV describes.
 *
 * Two rules worth knowing, both of which exist because the sheet fills every
 * cell whether or not there is a figure behind it:
 *
 *  - Month columns that are zero or blank for *every* fund, at the end of the
 *    sheet, are dropped. Those are the months of the year that have not
 *    happened yet, and importing them would read as every fund emptying out.
 *    The test is across all funds, not per fund, so a fund legitimately
 *    sitting at zero in June keeps its zero.
 *  - A blank cell in a month that is kept is skipped rather than stored as
 *    zero. No entry means the fund carries forward, which is the whole
 *    convention the dashboard reads.
 *
 * @param {string} text the CSV or tab-separated export
 * @param {{group?: string}} [options] a fallback group for sheets with no group column
 */
function buildImport(text, options = {}) {
  const rows = parseDelimited(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    return { funds: [], balances: [], warnings: ["The file is empty."], droppedMonths: [] };
  }

  // The header is the first row carrying a name column, not simply the first
  // row: the sheet has a title line above the table often enough that
  // assuming row one would import the title as a fund.
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => NAME_HEADERS.includes(cell.trim().toLowerCase())),
  );
  if (headerIndex === -1) {
    return {
      funds: [],
      balances: [],
      warnings: [`No column called ${NAME_HEADERS.join(", ")} — that column names the fund.`],
      droppedMonths: [],
    };
  }

  const header = rows[headerIndex].map((cell) => cell.trim());
  const nameCol = header.findIndex((cell) => NAME_HEADERS.includes(cell.toLowerCase()));
  const groupCol = header.findIndex((cell) => GROUP_HEADERS.includes(cell.toLowerCase()));

  const monthCols = [];
  const openingCols = [];
  header.forEach((cell, index) => {
    const monthKey = parseMonthHeader(cell);
    if (monthKey) monthCols.push({ index, monthKey });
    else if (isOpeningHeader(cell)) openingCols.push(index);
  });

  const warnings = [];
  if (monthCols.length === 0) {
    warnings.push("No month columns were recognised — expected headers like Jan-26.");
  }

  const opening = monthBeforeEarliest(monthCols.map((c) => c.monthKey));
  for (const index of openingCols) {
    if (opening) monthCols.push({ index, monthKey: opening });
  }
  if (openingCols.length > 0 && !opening) {
    warnings.push("An opening-balance column was ignored: no month column gave it a year.");
  }

  const dataRows = rows.slice(headerIndex + 1).filter((row) => {
    const name = (row[nameCol] ?? "").trim();
    if (name === "") return false;
    return !isTotalRow(name, groupCol === -1 ? "" : row[groupCol]);
  });

  // Which month columns to keep. Walked from the latest month backwards, and
  // stops at the first month anyone recorded anything in, so a gap earlier in
  // the year is never dropped.
  const ordered = [...monthCols].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const dropped = new Set();
  for (let i = ordered.length - 1; i >= 0; i--) {
    const col = ordered[i];
    const hasFigure = dataRows.some((row) => {
      const cents = parseAmountToCents(row[col.index]);
      return cents !== null && cents !== 0;
    });
    if (hasFigure) break;
    dropped.add(col);
  }

  // Dropped by column, not by month. Filtering on the month would take a
  // month's other column with it — so a month carried twice, empty in one
  // column and filled in the other, would lose the figures and still be
  // printed under "skipped months with no figures anywhere", which the reader
  // is being asked to check against the sheet.
  const keptCols = ordered.filter((col) => !dropped.has(col));
  const droppedMonths = [];
  for (const col of ordered) {
    if (!dropped.has(col)) continue;
    // A month kept in another column is not a skipped month.
    if (keptCols.some((kept) => kept.monthKey === col.monthKey)) continue;
    if (!droppedMonths.includes(col.monthKey)) droppedMonths.push(col.monthKey);
  }

  // Two columns landing on the same month is quiet otherwise: both write a
  // row, the upsert lets whichever came last win, and the dry run counts the
  // month twice. It happens for real when a sheet spans December to November
  // and so carries that December both as "Start of the Year" and as its own
  // column.
  const deduped = [];
  for (const col of keptCols) {
    if (deduped.some((kept) => kept.monthKey === col.monthKey)) {
      warnings.push(
        `Two columns are both ${col.monthKey} — the first one was used and the other ignored.`,
      );
      continue;
    }
    deduped.push(col);
  }

  const funds = [];
  const balances = [];
  const seen = new Set();

  for (const row of dataRows) {
    const name = (row[nameCol] ?? "").trim();
    const group = groupFromRow(groupCol === -1 ? "" : row[groupCol], options.group);
    if (!group) {
      warnings.push(`"${name}" has no group — add a Group or Mapping column, or pass --group.`);
      continue;
    }
    // A name repeated in the sheet is one fund with two sets of figures, and
    // the second block would silently overwrite the first. Reported, then the
    // row is left out, so the household decides which block is right.
    if (seen.has(name.toLowerCase())) {
      warnings.push(`"${name}" appears more than once — the later rows were skipped.`);
      continue;
    }
    seen.add(name.toLowerCase());
    funds.push({ name, group });

    for (const col of deduped) {
      const raw = row[col.index];
      if (raw === undefined || String(raw).trim() === "") continue;
      const cents = parseAmountToCents(raw);
      if (cents === null) {
        warnings.push(`"${name}" ${col.monthKey}: could not read "${String(raw).trim()}".`);
        continue;
      }
      balances.push({ name, monthKey: col.monthKey, balance: cents });
    }
  }

  return { funds, balances, warnings, droppedMonths };
}

module.exports = {
  parseDelimited,
  parseMonthHeader,
  monthBeforeEarliest,
  groupFromRow,
  isTotalRow,
  buildImport,
};
