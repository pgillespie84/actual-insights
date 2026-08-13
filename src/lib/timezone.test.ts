import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

test("getCurrentMonthKeyET returns YYYY-MM in Eastern Time", async () => {
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  const { getCurrentMonthKeyET } = await import("./timezone.ts");
  expect(getCurrentMonthKeyET()).toBe("2026-01");
});

test("getCurrentMonthKeyET uses ET not UTC at month boundary", async () => {
  // 2026-03-01 04:00 UTC = 2026-02-28 23:00 EST (still February in ET!)
  vi.setSystemTime(new Date("2026-03-01T04:00:00Z"));
  const { getCurrentMonthKeyET } = await import("./timezone.ts");
  expect(getCurrentMonthKeyET()).toBe("2026-02");
});

test("getCurrentDayET returns day number in Eastern Time", async () => {
  vi.setSystemTime(new Date("2026-07-20T15:00:00Z"));
  const { getCurrentDayET } = await import("./timezone.ts");
  expect(getCurrentDayET()).toBe(20);
});

test("getCurrentDayET respects EDT at midnight UTC", async () => {
  // 2026-07-15 03:00 UTC = 2026-07-14 23:00 EDT (still the 14th in ET!)
  vi.setSystemTime(new Date("2026-07-15T03:00:00Z"));
  const { getCurrentDayET } = await import("./timezone.ts");
  expect(getCurrentDayET()).toBe(14);
});

test("getCurrentMonthKeyET handles DST spring-forward boundary", async () => {
  vi.setSystemTime(new Date("2026-03-08T06:30:00Z"));
  const { getCurrentMonthKeyET } = await import("./timezone.ts");
  expect(getCurrentMonthKeyET()).toBe("2026-03");
});

// Consolidating three copies of this helper: the script's version, the
// scheduler's version, and this one. The year boundary is where they could
// silently disagree.
test("getPreviousMonthKey rolls back across a year boundary", async () => {
  const { getPreviousMonthKey } = await import("./timezone.ts");
  expect(getPreviousMonthKey("2026-01")).toBe("2025-12");
  expect(getPreviousMonthKey("2026-03")).toBe("2026-02");
});

test("getDaysInMonth handles leap years", async () => {
  const { getDaysInMonth } = await import("./timezone.ts");
  expect(getDaysInMonth(2024, 2)).toBe(29);
  expect(getDaysInMonth(2026, 2)).toBe(28);
  expect(getDaysInMonth(2026, 4)).toBe(30);
});
