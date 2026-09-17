/**
 * The shape of a month note: what a valid one looks like, which months it
 * covers, and how it is written into the AI prompt.
 *
 * Split from monthNotes.cjs, which carries the SQL and the pg query. The admin
 * form needs the limits and the coverage rule, and importing them from the
 * data layer pulls raw query text into the browser bundle for nothing.
 * Everything here is pure and safe on either side.
 */

/** Long enough for a paragraph, short enough that one note cannot flood the prompt. */
const MAX_NOTE_LENGTH = 1000;

/**
 * How many notes for one month reach the prompt.
 *
 * Notes are an unbounded input to a paid API call: the in-progress payload
 * carries four months at once, and nothing stops a month accumulating them.
 * Newest wins, since the older ones were already described by the insights
 * generated at the time.
 */
const MAX_NOTES_PER_MONTH = 20;

/**
 * The delimiter the prompt names when it tells the model that everything
 * inside is the household's own words and never an instruction.
 */
const NOTE_TAG_OPEN = "<household_note>";
const NOTE_TAG_CLOSE = "</household_note>";

/** `YYYY-MM`, the same month key format used everywhere else. */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidMonthKey(value) {
  return typeof value === "string" && MONTH_KEY.test(value);
}

/** The `YYYY-MM` after the given one, rolling forward across years. */
function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Every month a note applies to, in order.
 *
 * A note with no `monthEnd` covers exactly `monthStart`. With one, it covers
 * the inclusive range — and it genuinely reaches all of them, because
 * `fetchNotesForMonth` matches on the range. Anything that asks "has the model
 * seen this note" has to ask it of every month here, not just the first: a
 * fresh August insight says nothing about whether September got the note.
 */
function monthsCovered(note) {
  if (!isValidMonthKey(note.monthStart)) return [];
  const end = isValidMonthKey(note.monthEnd) ? note.monthEnd : note.monthStart;
  if (end < note.monthStart) return [note.monthStart];

  const months = [];
  for (let m = note.monthStart; m <= end; m = nextMonthKey(m)) {
    months.push(m);
    // A malformed range cannot spin forever. Nothing legitimate spans this
    // long, and the alternative is a hung render.
    if (months.length >= 120) break;
  }
  return months;
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
 * Removes the delimiter from a note's text, repeatedly, until it stays removed.
 *
 * One pass is not enough, and the reason is worth spelling out: removing a tag
 * joins the text either side of it, and that join can spell the tag again.
 * `</household</household_note>_note>` contains one literal closing tag; strip
 * it and the halves meet as `</household_note>` — a live delimiter in the
 * output, which is exactly the escape the tag exists to prevent. Each pass
 * strictly shortens the string, so this terminates.
 */
function stripNoteTags(text) {
  let out = text;
  for (;;) {
    const next = out.split(NOTE_TAG_OPEN).join("").split(NOTE_TAG_CLOSE).join("");
    if (next === out) return out;
    out = next;
  }
}

/**
 * How a note is written into the AI payload.
 *
 * A multi-month note says so, because the model is looking at four months at
 * once and needs to know that the kitchen remodel in August is the same
 * kitchen remodel in September rather than a second one.
 */
function formatNoteForPrompt(note) {
  const span =
    note.monthEnd && note.monthEnd !== note.monthStart
      ? ` (spans ${note.monthStart} to ${note.monthEnd})`
      : "";
  // Wrapped in a tag the prompt names, so the boundary between the household's
  // words and the instructions is structural rather than a matter of the model
  // taking the prompt's word for it. The text is stripped of the delimiter
  // itself and nothing more — the only author and the only reader are the same
  // household, so the point is not to defend against them, it is that a note
  // reading like an instruction should still arrive visibly marked as data.
  return `${NOTE_TAG_OPEN}${stripNoteTags(note.note)}${span}${NOTE_TAG_CLOSE}`;
}

module.exports = {
  NOTE_TAG_OPEN,
  stripNoteTags,
  NOTE_TAG_CLOSE,
  MAX_NOTE_LENGTH,
  MAX_NOTES_PER_MONTH,
  isValidMonthKey,
  nextMonthKey,
  monthsCovered,
  validateNote,
  normalizeNote,
  formatNoteForPrompt,
};
