/**
 * Backfill ordering, kept separate from the database wiring so it can be
 * tested.
 *
 * The first version ran one unscoped `DELETE FROM "DailyInsight"` before
 * generating anything, so a failure partway through — a bad API key, a rate
 * limit, a dropped connection — left the table empty with nothing to restore
 * from. Scoping the delete to one month bounded that loss but did not remove
 * it, because the month in flight was still cleared before the API call that
 * might fail.
 *
 * Nothing is now deleted until the replacement content exists. A month is
 * generated first, then swapped in by `replaceMonth`, which deletes and
 * inserts in one transaction. A month that fails, or that has no data to
 * generate from, keeps whatever it already had.
 */

async function backfillMonths({ months, generateMonth, replaceMonth }) {
  for (const monthKey of months) {
    const content = await generateMonth(monthKey);
    if (content === undefined) continue;
    await replaceMonth(monthKey, content);
  }
}

module.exports = { backfillMonths };
