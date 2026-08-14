import { test, expect } from "vitest";
import { parseInsightArgs } from "./insightArgs.cjs";

// The admin page regenerates one month at a time. --backfill rebuilds every
// month, which is a sequential Claude call each, so it is the rare case.

test("no flags means the default previous-plus-current run", () => {
  expect(parseInsightArgs([])).toEqual({ mode: "default" });
});

test("a month that is not YYYY-MM is rejected", () => {
  // The admin page puts this on the command line from a browser request.
  // spawn() takes an argument array with no shell, so there is nothing to
  // inject, but a junk month would silently generate an insight for nothing.
  expect(() => parseInsightArgs(["--month=july"])).toThrow(/YYYY-MM/);
  expect(() => parseInsightArgs(["--month=2026-13"])).toThrow(/YYYY-MM/);
  expect(() => parseInsightArgs(["--month="])).toThrow(/YYYY-MM/);
});

test("--backfill rebuilds every month", () => {
  expect(parseInsightArgs(["--backfill"])).toEqual({ mode: "backfill" });
});

test("--month picks a single month", () => {
  expect(parseInsightArgs(["--month=2026-07"])).toEqual({
    mode: "month",
    month: "2026-07",
  });
});
