import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMonthRange, expenseCategoryFilter } from "./query-utils";
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
