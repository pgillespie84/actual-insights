import { test, expect } from "vitest";
import { summariseBudgetMonths } from "./budgetSummary.cjs";

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

// A month that was never read has no rows at all, so it cannot appear — which
// is what separates it from the case above.
test("a month with no rows is absent rather than zeroed", () => {
  expect(summariseBudgetMonths([["2026-07", 100, "a"]]).map((m) => m.month)).toEqual([
    "2026-07",
  ]);
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
