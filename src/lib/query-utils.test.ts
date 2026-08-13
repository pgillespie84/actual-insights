import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMonthRange, expenseCategoryFilter, resolveMonth } from "./query-utils";
import { SKIP_CATEGORIES, SKIP_INCOME } from "./constants";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test("generateMonthRange returns N entries in chronological order", () => {
  vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  const range = generateMonthRange(3);

  expect(range).toHaveLength(3);
  expect(range[0].monthKey).toBe("2026-01");
  expect(range[1].monthKey).toBe("2026-02");
  expect(range[2].monthKey).toBe("2026-03");
});

test("generateMonthRange entries have correct shape", () => {
  vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
  const [entry] = generateMonthRange(1);

  expect(entry.monthKey).toBe("2026-05");
  expect(entry.label).toBe("May 2026");
  expect(entry.start.getDate()).toBe(1);
  expect(entry.end.getDate()).toBeGreaterThanOrEqual(28);
  expect(entry.monthDate).toBeInstanceOf(Date);
});

test("generateMonthRange accepts anchor date", () => {
  const anchor = new Date("2025-06-20T12:00:00Z");
  const range = generateMonthRange(2, anchor);

  expect(range[0].monthKey).toBe("2025-05");
  expect(range[1].monthKey).toBe("2025-06");
});

// Asserts against the loaded config rather than literal category names. The
// live values are in gitignored config/dashboard.json — hardcoding them here
// would put them back into the repo, and would fail on a fresh clone that
// falls back to config/dashboard.example.json.
test("expenseCategoryFilter returns skip-list where clause", () => {
  expect(expenseCategoryFilter()).toEqual({
    isIncome: false,
    hidden: false,
    name: { notIn: [...SKIP_CATEGORIES, ...SKIP_INCOME] },
  });
});

// Extracted from three API routes that carried a byte-identical copy. The
// fallback is the interesting part: when the current ET month has no data yet
// (early in a month, before a sync), the newest month that does is used.
test("resolveMonth falls back to the newest available month", () => {
  const available = ["2026-07", "2026-06"];
  expect(resolveMonth(null, available, "2026-08").monthKey).toBe("2026-07");
});

test("resolveMonth prefers the current month when data exists for it", () => {
  const available = ["2026-08", "2026-07"];
  expect(resolveMonth(null, available, "2026-08").monthKey).toBe("2026-08");
});

test("resolveMonth honours an explicit request", () => {
  const r = resolveMonth("2026-06", ["2026-08", "2026-07", "2026-06"], "2026-08");
  expect(r.monthKey).toBe("2026-06");
  expect(r.monthDate.getFullYear()).toBe(2026);
  expect(r.monthDate.getMonth()).toBe(5);
});
