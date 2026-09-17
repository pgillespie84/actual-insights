/**
 * Reading month notes out of the database.
 *
 * The free text the household writes about a month, handed to the AI as
 * context so the insight can say *why* a category jumped. Nothing here
 * computes: a note never changes a figure on the dashboard and never
 * suppresses an over-budget flag.
 *
 * The pure half — validation, coverage, prompt formatting — lives in
 * monthNoteShape.cjs so the admin form can use it without pulling this query
 * into the browser bundle. Re-exported here so server callers have one import.
 *
 * CJS because `insightData.cjs` and `generate-insight.cjs` run under plain
 * node, outside the Next build.
 */

const shape = require("./monthNoteShape.cjs");
const { isValidMonthKey, MAX_NOTES_PER_MONTH } = shape;

/**
 * The notes covering one month, oldest first.
 *
 * The range test is done in SQL so a month with no notes costs one cheap
 * indexed query rather than reading the whole table. `COALESCE` gives the
 * single-month case its implicit end.
 *
 * @param {{query: Function}} pool a pg Pool, or anything with the same `query`
 * @param {string} monthKey `YYYY-MM`
 * @returns {Promise<{note: string, monthStart: string, monthEnd: string|null}[]>}
 */
async function fetchNotesForMonth(pool, monthKey) {
  if (!isValidMonthKey(monthKey)) return [];
  // Newest first in SQL so the LIMIT drops the oldest notes, then reversed so
  // the prompt reads them in the order they were written.
  const result = await pool.query(
    `SELECT "monthStart", "monthEnd", note
     FROM "MonthNote"
     WHERE "monthStart" <= $1 AND COALESCE("monthEnd", "monthStart") >= $1
     ORDER BY "createdAt" DESC
     LIMIT $2`,
    [monthKey, MAX_NOTES_PER_MONTH],
  );
  return result.rows
    .map((r) => ({
      monthStart: r.monthStart,
      monthEnd: r.monthEnd ?? null,
      note: r.note,
    }))
    .reverse();
}

module.exports = { ...shape, fetchNotesForMonth };
