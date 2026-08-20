/**
 * Per-month counts for the budget rows a sync is about to write.
 *
 * The sync used to log one total across every month. That number cannot answer
 * the question people actually ask of it — "did the current month come through?"
 * — because a month whose categories are all zero and a month that was never
 * read both contribute nothing to it. A month with no budget at all is a normal
 * state in a tracking budget, where nothing carries forward, so the log has to
 * tell the two apart rather than leaving it to be guessed.
 *
 * `funded` is the count that matters: rows is how many categories the month
 * returned, funded is how many carry a non-zero amount.
 *
 * @param {Array<[string, number, string]>} rows [month, budgetedAmount, categoryId]
 * @returns {Array<{month: string, rows: number, funded: number, totalCents: number}>}
 *   one entry per month, in the order the months were first seen
 */
const DEFAULT_WINDOW = 6;

function summariseBudgetMonths(rows) {
  const byMonth = new Map();

  for (const [month, amount] of rows) {
    let entry = byMonth.get(month);
    if (entry === undefined) {
      entry = { month, rows: 0, funded: 0, totalCents: 0 };
      byMonth.set(month, entry);
    }
    entry.rows += 1;
    // Negative is funded too: Actual writes one when money moves back out of a
    // category, and it still means someone budgeted this month.
    if (amount !== 0) entry.funded += 1;
    entry.totalCents += amount;
  }

  return [...byMonth.values()];
}

/**
 * The sync's budget log, as lines.
 *
 * `months` is what the API was asked for and `rows` is what came back, and the
 * two are deliberately separate inputs. Deriving everything from the rows —
 * which is how this started — leaves a month that WAS read but returned nothing
 * looking identical to a month the API never mentioned: sync.cjs contributes no
 * rows when `categoryGroups` is missing, when a group's `categories` is empty,
 * and for any category whose `budgeted` is null. Passing the month list in
 * means absent from the log has exactly one meaning, which is the whole point
 * of the log.
 *
 * Two things are deliberately not printed in full. Every month gets a detail
 * line only inside a recent window, because a six-hourly sync over ~30 months
 * would otherwise write ~120 lines a day into `docker logs`. And the
 * unbudgeted alert covers only months up to the current one: this budget is
 * budgetType "tracking", where nothing carries forward, so every future month
 * Actual returns is legitimately empty and naming them would fire the alert on
 * every sync forever. The alert is not limited to the window, though — a past
 * month with nothing budgeted is worth hearing about wherever it falls.
 *
 * @param {{months: string[], rows: Array<[string, number, string]>,
 *   currentMonth: string, window?: number}} input
 * @returns {string[]}
 */
function formatBudgetMonthLines({ months, rows, currentMonth, window = DEFAULT_WINDOW }) {
  const byMonth = new Map(summariseBudgetMonths(rows).map((m) => [m.month, m]));
  const at = (month) =>
    byMonth.get(month) ?? { month, rows: 0, funded: 0, totalCents: 0 };

  // YYYY-MM sorts and compares correctly as a string, so no date parsing.
  // Deduped because the roll-up below reasons about repeated month keys, and a
  // repeat would otherwise print the same detail line twice.
  const upToNow = [...new Set(months.filter((m) => m <= currentMonth))].sort();
  // Sliced from a computed start rather than a negative end: slice(-0) is
  // slice(0) and returns everything, so the obvious spelling gives a caller
  // asking for no detail the most output there is. NaN survives Math.max and
  // slices from 0 for the same reason, hence the integer guard.
  const size = Number.isInteger(window) ? window : DEFAULT_WINDOW;
  const detail = upToNow.slice(Math.max(0, upToNow.length - size));
  const shown = new Set(detail);

  const lines = [
    `  ${plural(rows.length, "budget entry", "budget entries")} synced across ` +
      `${plural(months.length, "month", "months")}`,
  ];

  for (const month of detail) {
    const m = at(month);
    lines.push(
      `    ${m.month}  ${plural(m.rows, "category", "categories")}, ` +
        `${m.funded} budgeted, ${dollars(m.totalCents)}`
    );
  }

  // Both halves come off the same array: deriving the count from months.length
  // and the breakdown from a filtered copy lets them disagree if a month key
  // ever repeats.
  const others = months.filter((m) => !shown.has(m));
  if (others.length > 0) {
    const funded = others.filter((m) => at(m).funded > 0).length;
    // "not budgeted" rather than "empty": most of these are future months,
    // which are legitimately unfilled in a tracking budget.
    lines.push(
      `    ${plural(others.length, "other month", "other months")} not shown ` +
        `(${funded} budgeted, ${others.length - funded} not budgeted)`
    );
  }

  const unbudgeted = upToNow.filter((m) => at(m).funded === 0);
  if (unbudgeted.length > 0) {
    lines.push(`  no budgeted amount in any category for: ${truncate(unbudgeted)}`);
  }

  // The one thing this log exists to answer is whether the current month came
  // through. Everything above is scoped to months <= currentMonth, so without
  // this a missing current month leaves no trace at all: no detail line, and
  // nothing for the alert to iterate.
  if (!months.includes(currentMonth)) {
    lines.push(`  WARNING: ${currentMonth} was not returned by getBudgetMonths`);
  }

  return lines;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sign outside the dollar sign, so a negative total is -$16.00 not $-16.00. */
function dollars(cents) {
  return `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The alert reaches every past month on purpose, but its length is bounded by
 * the age of the budget file rather than by the detail window, so an imported
 * history would put an unbounded list on one line four times a day.
 *
 * The oldest months are the ones dropped. Capping the other way round read
 * naturally and was wrong: `months` arrives ascending, so a file with a long
 * unbudgeted history pushed the newest months — the current one among them —
 * off the end, in precisely the case the cap exists for.
 */
function truncate(months, limit = DEFAULT_WINDOW) {
  if (months.length <= limit) return months.join(", ");
  return `(+${months.length - limit} earlier) ${months.slice(-limit).join(", ")}`;
}

module.exports = { summariseBudgetMonths, formatBudgetMonthLines };
