import { test, expect } from "vitest";
import { summariseBudgetMonths, formatBudgetMonthLines } from "./budgetSummary.cjs";

// The sync logged one total across every month, so a month whose categories
// are all zero looked exactly like a month that was never read. That cost a
// debugging session: Actual had no August budget, and the log could not say
// whether the step had run.

test("counts rows, funded categories and the month total", () => {
  const summary = summariseBudgetMonths([
    ["2026-07", 160000, "grocery"],
    ["2026-07", 0, "tools"],
    ["2026-07", 173886, "mortgage"],
  ]);

  expect(summary).toEqual([
    { month: "2026-07", rows: 3, funded: 2, totalCents: 333886 },
  ]);
});

// The distinction the whole change exists for.
test("a month present but entirely unbudgeted reports rows with no funding", () => {
  const summary = summariseBudgetMonths([
    ["2026-08", 0, "grocery"],
    ["2026-08", 0, "mortgage"],
  ]);

  expect(summary).toEqual([
    { month: "2026-08", rows: 2, funded: 0, totalCents: 0 },
  ]);
});

// summariseBudgetMonths knows only about rows, so it cannot invent a month.
// Naming the months that were read is formatBudgetMonthLines' job, below.
test("a month with no rows is absent rather than zeroed", () => {
  const months = summariseBudgetMonths([["2026-07", 100, "a"]]).map((m) => m.month);
  expect(months).toEqual(["2026-07"]);
  expect(months).not.toContain("2026-08");
});

test("months come back in the order they were first seen", () => {
  const summary = summariseBudgetMonths([
    ["2026-07", 100, "a"],
    ["2026-08", 200, "b"],
    ["2026-07", 300, "c"],
  ]);

  expect(summary.map((m) => m.month)).toEqual(["2026-07", "2026-08"]);
  expect(summary[0]).toEqual({ month: "2026-07", rows: 2, funded: 2, totalCents: 400 });
});

// Actual returns negative budgeted amounts when money is moved back out of a
// category. They are funded entries and they subtract from the month total.
test("negative amounts count as funded and reduce the total", () => {
  expect(summariseBudgetMonths([
    ["2026-07", -49776, "pocket-money"],
    ["2026-07", 60000, "grocery"],
  ])).toEqual([
    { month: "2026-07", rows: 2, funded: 2, totalCents: 10224 },
  ]);
});

test("no rows at all summarises to nothing", () => {
  expect(summariseBudgetMonths([])).toEqual([]);
});

// --- formatBudgetMonthLines -------------------------------------------------

// The first version of this derived everything from the rows, so a month that
// WAS read but returned nothing — empty categoryGroups, or every category
// filtered out for a null `budgeted` — disappeared exactly like a month the API
// never returned. That is the ambiguity the logging exists to remove, so the
// month list is now an input in its own right.
test("a read month with no rows is shown as zero categories, not omitted", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-07", "2026-08"],
    rows: [["2026-07", 160000, "grocery"]],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).toContain("2026-08  0 categories, 0 budgeted, $0.00");
});

test("detail lines report categories, funded count and the month total", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-08"],
    rows: [
      ["2026-08", 160000, "grocery"],
      ["2026-08", 0, "tools"],
    ],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).toContain("2026-08  2 categories, 1 budgeted, $1600.00");
});

// This budget is budgetType "tracking": nothing carries forward, so every month
// Actual returns beyond the current one is legitimately empty. Naming them all
// would fire the alert on every sync forever, which trains you to ignore it.
test("future months never trip the unbudgeted alert", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-08", "2026-09", "2027-07"],
    rows: [["2026-08", 5000, "grocery"]],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).not.toContain("no budgeted amount");
});

test("the current month with nothing budgeted does trip the alert", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-07", "2026-08", "2026-09"],
    rows: [
      ["2026-07", 5000, "grocery"],
      ["2026-08", 0, "grocery"],
    ],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).toContain("no budgeted amount in any category for: 2026-08");
});

// A past month with nothing budgeted is worth naming even when it falls outside
// the detail window, so the alert is not limited to the months it prints.
test("the alert reaches past months outside the detail window", () => {
  const months = ["2025-01", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const lines = formatBudgetMonthLines({
    months,
    rows: months.filter((m) => m !== "2025-01").map((m) => [m, 5000, "grocery"] as [string, number, string]),
    currentMonth: "2026-08",
    window: 3,
  });

  expect(lines.some((l) => l.includes("2025-01") && l.includes("categories"))).toBe(false);
  expect(lines.join("\n")).toContain("no budgeted amount in any category for: 2025-01");
});

// A sync every six hours against ~30 months would put ~120 lines a day into
// docker logs. Only the window anyone debugs is printed in full.
test("months outside the window are rolled into one line rather than printed", () => {
  const months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const lines = formatBudgetMonthLines({
    months,
    rows: months.map((m) => [m, m === "2026-09" ? 0 : 5000, "grocery"] as [string, number, string]),
    currentMonth: "2026-08",
    window: 2,
  });

  const detail = lines.filter((l) => l.includes("categories"));
  expect(detail.map((l) => l.trim().slice(0, 7))).toEqual(["2026-07", "2026-08"]);
  expect(lines.join("\n")).toContain("5 other months");
});

test("the total line names the row count and the month count", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-07", "2026-08"],
    rows: [["2026-07", 100, "a"], ["2026-08", 200, "b"]],
    currentMonth: "2026-08",
  });

  expect(lines[0]).toContain("2 budget entries synced across 2 months");
});
