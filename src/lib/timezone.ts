/**
 * Typed re-export of the shared Eastern-Time helpers.
 *
 * The implementation lives in `timezone.cjs` so the CJS scripts can require the
 * same code; see the note there.
 */

export {
  getCurrentMonthKeyET,
  getCurrentDayET,
  getDaysInMonth,
  getPreviousMonthKey,
} from "./timezone.cjs";
