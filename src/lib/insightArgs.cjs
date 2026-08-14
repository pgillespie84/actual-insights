/** Month keys are YYYY-MM in Eastern Time, with a real month number. */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Parses generate-insight.cjs's arguments.
 *
 * Extracted because the admin page needs a single-month regenerate, and the
 * script previously only understood "everything" (--backfill) or "previous
 * plus current" (no flags).
 *
 * @param {string[]} argv arguments only, without the node and script paths
 * @returns {{mode: "default" | "backfill" | "month", month?: string}}
 */
function parseInsightArgs(argv) {
  if (argv.includes("--backfill")) return { mode: "backfill" };

  const monthArg = argv.find((a) => a.startsWith("--month="));
  if (monthArg) {
    const month = monthArg.slice("--month=".length);
    if (!MONTH_KEY.test(month)) {
      throw new Error(`--month must be YYYY-MM, got "${month}"`);
    }
    return { mode: "month", month };
  }

  return { mode: "default" };
}

module.exports = { parseInsightArgs };
