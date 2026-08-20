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
function formatBudgetMonthLines({ months, rows, currentMonth, window = 6 }) {
  const byMonth = new Map(summariseBudgetMonths(rows).map((m) => [m.month, m]));
  const at = (month) =>
    byMonth.get(month) ?? { month, rows: 0, funded: 0, totalCents: 0 };

  // YYYY-MM sorts and compares correctly as a string, so no date parsing.
  const upToNow = months.filter((m) => m <= currentMonth).sort();
  const shown = new Set(upToNow.slice(-window));

  const lines = [
    `  ${rows.length} budget entries synced across ${months.length} months`,
  ];

  for (const month of upToNow.filter((m) => shown.has(m))) {
    const m = at(month);
    const dollars = (m.totalCents / 100).toFixed(2);
    lines.push(`    ${m.month}  ${m.rows} categories, ${m.funded} budgeted, $${dollars}`);
  }

  const rest = months.length - shown.size;
  if (rest > 0) {
    const others = months.filter((m) => !shown.has(m));
    const funded = others.filter((m) => at(m).funded > 0).length;
    lines.push(`    ${rest} other months not shown (${funded} budgeted, ${rest - funded} empty)`);
  }

  const unbudgeted = upToNow.filter((m) => at(m).funded === 0);
  if (unbudgeted.length > 0) {
    lines.push(`  no budgeted amount in any category for: ${unbudgeted.join(", ")}`);
  }

  return lines;
}

module.exports = { summariseBudgetMonths, formatBudgetMonthLines };
