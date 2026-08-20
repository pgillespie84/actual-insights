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

module.exports = { summariseBudgetMonths };
