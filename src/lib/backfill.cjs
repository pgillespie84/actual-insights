/**
 * Backfill ordering, kept separate from the database wiring so it can be
 * tested.
 *
 * The previous version ran one unscoped `DELETE FROM "DailyInsight"` before
 * generating anything, so a failure partway through — a bad API key, a rate
 * limit, a dropped connection — left the table empty with nothing to restore
 * from. Each month is now cleared only when the run reaches it, which bounds
 * the loss to the month actually being replaced.
 */

async function backfillMonths({ months, deleteMonth, generateMonth }) {
  for (const monthKey of months) {
    await deleteMonth(monthKey);
    await generateMonth(monthKey);
  }
}

module.exports = { backfillMonths };
