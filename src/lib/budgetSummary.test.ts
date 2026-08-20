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

  expect(lines.some((l) => /^ {4}2025-01 /.test(l))).toBe(false);
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

  const detail = lines.filter((l) => /^ {4}\d{4}-\d{2} /.test(l));
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

// The log exists to answer "did the current month come through?", so the one
// case it must never be silent about is the current month not arriving at all.
// Filtering to months <= current made that the quiet failure: no detail line,
// and the alert iterates the same list so it could not fire either.
test("the current month missing from the API's month list is called out", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-06", "2026-07"],
    rows: [["2026-07", 5000, "grocery"]],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).toContain("2026-08 was not returned by getBudgetMonths");
});

test("no warning when the current month is present", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-07", "2026-08"],
    rows: [["2026-08", 5000, "grocery"]],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).not.toContain("not returned by getBudgetMonths");
});

// slice(-0) is slice(0), so the obvious way to write this returns every month
// rather than none — the opposite of what a caller asking for no detail wants.
test("a window of zero prints no detail lines", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-07", "2026-08"],
    rows: [["2026-07", 100, "a"], ["2026-08", 200, "b"]],
    currentMonth: "2026-08",
    window: 0,
  });

  expect(lines.filter((l) => /^ {4}\d{4}-\d{2} /.test(l))).toEqual([]);
});

// The alert reaches every past month deliberately, but its bound is the age of
// the budget file, so the rendering is capped even though the reach is not.
test("a long unbudgeted list is truncated with a count of the rest", () => {
  const months = Array.from({ length: 15 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`)
    .filter((m) => m <= "2025-12");
  const lines = formatBudgetMonthLines({ months, rows: [], currentMonth: "2026-08" });
  const alert = lines.find((l) => l.includes("no budgeted amount")) ?? "";

  expect(alert).toContain("2025-01");
  expect(alert).toContain("(+6 more)");
  expect(alert).not.toContain("2025-12");
});

test("the roll-up line breaks the hidden months into budgeted and not", () => {
  const months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const lines = formatBudgetMonthLines({
    months,
    rows: [["2026-03", 5000, "a"], ["2026-04", 0, "b"], ["2026-05", 0, "c"]],
    currentMonth: "2026-08",
    window: 3,
  });

  expect(lines.join("\n")).toContain("3 other months not shown (1 budgeted, 2 not budgeted)");
});

test("counts of one read as singular", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-08"],
    rows: [["2026-08", 100, "a"]],
    currentMonth: "2026-08",
  });

  expect(lines[0]).toContain("1 budget entry synced across 1 month");
});

// summariseBudgetMonths supports negative totals, so the sign has to land
// outside the dollar sign rather than rendering as "$-16.00".
test("a negative month total keeps the sign outside the dollar sign", () => {
  const lines = formatBudgetMonthLines({
    months: ["2026-08"],
    rows: [["2026-08", -1600, "pocket-money"]],
    currentMonth: "2026-08",
  });

  expect(lines.join("\n")).toContain("-$16.00");
});
