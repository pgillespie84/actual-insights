/**
 * Eastern-Time date helpers, shared by the Next server code and the CJS
 * scripts.
 *
 * This is CJS, like loadConfig.cjs, because `scripts/*.cjs` require it at
 * runtime and cannot import TypeScript. `src/lib/timezone.ts` re-exports it so
 * application code keeps a typed import.
 *
 * These used to exist in three separate copies — here, in the scheduler, and in
 * generate-insight.cjs — which could disagree at month and year boundaries.
 */

const ET_TIME_ZONE = "America/New_York";

function etParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return {
    year: parts.find((p) => p.type === "year").value,
    month: parts.find((p) => p.type === "month").value,
    day: parts.find((p) => p.type === "day").value,
    hour: parts.find((p) => p.type === "hour").value,
  };
}

/** Current month in Eastern Time as `YYYY-MM`. */
function getCurrentMonthKeyET() {
  const { year, month } = etParts();
  return `${year}-${month}`;
}

/** Day of the month in Eastern Time. */
function getCurrentDayET() {
  return Number(etParts().day);
}

/**
 * Hour of the day in Eastern Time, 0-23.
 *
 * `hourCycle: "h23"` matters: the default for en-US is h12, which renders
 * midnight as "24" and would put the greeting an hour out once a day.
 */
function getCurrentHourET() {
  return Number(etParts().hour);
}

/** Days in a month. `month` is 1-based, so February is 2. */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** The `YYYY-MM` before the given `YYYY-MM`, rolling back across years. */
function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

module.exports = {
  getCurrentMonthKeyET,
  getCurrentDayET,
  getCurrentHourET,
  getDaysInMonth,
  getPreviousMonthKey,
};
