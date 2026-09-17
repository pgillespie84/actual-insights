/**
 * Month notes: free text the household writes about a month, handed to the AI
 * as context so the insight can say *why* a category jumped.
 *
 * Nothing here computes. A note never changes a figure on the dashboard and
 * never suppresses an over-budget flag — the prompt is explicit that a note is
 * the household's own description of what happened, not data. The whole point
 * is that the numbers stay honest and gain an explanation.
 *
 * CJS because `insightData.cjs` and `generate-insight.cjs` are the main
 * consumers and run under plain node, outside the Next build.
 */

/** `YYYY-MM`, the same month key format used everywhere else. */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Long enough for a paragraph, short enough that it cannot flood the prompt. */
const MAX_NOTE_LENGTH = 1000;

function isValidMonthKey(value) {
  return typeof value === "string" && MONTH_KEY.test(value);
}

/**
 * Whether a note applies to a month.
 *
 * A note with no `monthEnd` covers exactly `monthStart`. With one, it covers
 * the inclusive range. Month keys are zero-padded and fixed width, so string
 * comparison is date comparison and no parsing is needed.
 */
function noteCoversMonth(note, monthKey) {
  if (!isValidMonthKey(monthKey) || !isValidMonthKey(note.monthStart)) return false;
  const end = note.monthEnd || note.monthStart;
  return monthKey >= note.monthStart && monthKey <= end;
}

/**
 * Checks a note submitted from the form. Returns a message to show the user,
 * or null when the note is fine.
 *
 * Validating here rather than in the route keeps the rules testable without a
 * request, and means the script path gets the same answers as the UI.
 */
function validateNote({ monthStart, monthEnd, note } = {}) {
  if (!isValidMonthKey(monthStart)) {
    return "Pick a month in YYYY-MM format.";
  }
  if (monthEnd != null && monthEnd !== "" && !isValidMonthKey(monthEnd)) {
    return "The end month has to be YYYY-MM format, or left blank.";
  }
  if (monthEnd && monthEnd < monthStart) {
    return "The end month cannot be before the start month.";
  }
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length === 0) {
    return "Write something in the note.";
  }
  if (text.length > MAX_NOTE_LENGTH) {
    return `Keep the note under ${MAX_NOTE_LENGTH} characters.`;
  }
  return null;
}

/**
 * Trims a submitted note into the shape the database stores. An empty end
 * month becomes null rather than "", so `monthEnd || monthStart` above does
 * the right thing and the column means one thing.
 *
 * @param {{monthStart: string, monthEnd?: string | null, note: string}} input
 * @returns {{monthStart: string, monthEnd: string | null, note: string}}
 */
function normalizeNote({ monthStart, monthEnd, note }) {
  return {
    monthStart,
    monthEnd: monthEnd ? monthEnd : null,
    note: note.trim(),
  };
}

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
  const result = await pool.query(
    `SELECT "monthStart", "monthEnd", note
     FROM "MonthNote"
     WHERE "monthStart" <= $1 AND COALESCE("monthEnd", "monthStart") >= $1
     ORDER BY "createdAt" ASC`,
    [monthKey],
  );
  return result.rows.map((r) => ({
    monthStart: r.monthStart,
    monthEnd: r.monthEnd ?? null,
    note: r.note,
  }));
}

/**
 * How a note is written into the AI payload.
 *
 * A multi-month note says so, because the model is looking at four months at
 * once and needs to know that the kitchen remodel in August is the same
 * kitchen remodel in September rather than a second one.
 */
function formatNoteForPrompt(note) {
  return note.monthEnd && note.monthEnd !== note.monthStart
    ? `${note.note} (spans ${note.monthStart} to ${note.monthEnd})`
    : note.note;
}

module.exports = {
  MAX_NOTE_LENGTH,
  isValidMonthKey,
  noteCoversMonth,
  validateNote,
  normalizeNote,
  fetchNotesForMonth,
  formatNoteForPrompt,
};
