import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMonthRange, expenseCategoryFilter, resolveMonth, mapWithConcurrency } from "./query-utils";
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

// An empty database has no available months, and `availableMonths[0]` was then
// undefined — parse(undefined) gave an Invalid Date that propagated into every
// downstream query instead of rendering an empty month.
test("resolveMonth falls back to the current month when nothing is available", () => {
  const r = resolveMonth(null, [], "2026-08");
  expect(r.monthKey).toBe("2026-08");
  expect(r.monthDate.getTime()).not.toBeNaN();
});

// `month` is a query parameter, so its value is whatever the caller sends. An
// unparseable one took the same path as a real key and produced NaN dates.
test.each(["garbage", "2026-13", "2026", "2026-1", ""])(
  "resolveMonth ignores the unparseable request %j",
  (requested) => {
    const r = resolveMonth(requested, ["2026-07"], "2026-08");
    expect(r.monthKey).toBe("2026-07");
    expect(r.monthDate.getTime()).not.toBeNaN();
  },
);

// /api/analytics runs four queries at once, two of which fan out over a month
// range that itself issues one or two queries per month. Unbounded, that put
// ~32 queries against a Prisma pool sized num_cpus * 2 + 1, so the surplus
// queued against the 10s pool_timeout.
test("mapWithConcurrency runs no more than the limit at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const release: Array<() => void> = [];

  const pending = mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((resolve) => release.push(resolve));
    inFlight--;
    return n;
  });

  // Let each started task settle, then release them one at a time so a slot
  // frees and the next task can start.
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    release[i]?.();
  }
  await pending;

  expect(peak).toBe(3);
});

test("mapWithConcurrency returns results in input order", async () => {
  const delays = [30, 0, 20, 10];
  const pending = mapWithConcurrency(delays, 2, async (ms, i) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return i;
  });

  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toEqual([0, 1, 2, 3]);
});
