import { test, expect } from "vitest";
import { backfillMonths } from "./backfill.cjs";

// The old code ran a single unscoped DELETE across every month before
// generating anything, so one failed API call left the table empty. Nothing may
// be deleted for a month the run has not reached.
test("a mid-run failure leaves later months' insights untouched", async () => {
  const replaced: string[] = [];

  await expect(
    backfillMonths({
      months: ["2026-01", "2026-02", "2026-03"],
      generateMonth: async (m: string) => {
        if (m === "2026-02") throw new Error("api down");
        return `insight for ${m}`;
      },
      replaceMonth: async (m: string) => {
        replaced.push(m);
      },
    }),
  ).rejects.toThrow("api down");

  expect(replaced).not.toContain("2026-03");
});

// Scoping the delete to one month bounded the loss but did not remove it: the
// month in flight was cleared before the API call that failed. Generating
// first means a failure costs nothing at all.
test("a failed month keeps the insight it already had", async () => {
  const replaced: string[] = [];

  await expect(
    backfillMonths({
      months: ["2026-01", "2026-02"],
      generateMonth: async (m: string) => {
        if (m === "2026-02") throw new Error("api down");
        return `insight for ${m}`;
      },
      replaceMonth: async (m: string) => {
        replaced.push(m);
      },
    }),
  ).rejects.toThrow("api down");

  expect(replaced).toEqual(["2026-01"]);
});

// generateInsight returns nothing for a month with no spending and no budget.
// Deleting first wiped the stored insight for those months and put nothing
// back.
test("a month with no data keeps its existing insight", async () => {
  const replaced: string[] = [];

  await backfillMonths({
    months: ["2026-01", "2026-02"],
    generateMonth: async (m: string) =>
      m === "2026-01" ? undefined : `insight for ${m}`,
    replaceMonth: async (m: string) => {
      replaced.push(m);
    },
  });

  expect(replaced).toEqual(["2026-02"]);
});

test("the generated content is what gets stored", async () => {
  const stored: Array<[string, string]> = [];

  await backfillMonths({
    months: ["2026-01"],
    generateMonth: async (m: string) => `insight for ${m}`,
    replaceMonth: async (m: string, content: string) => {
      stored.push([m, content]);
    },
  });

  expect(stored).toEqual([["2026-01", "insight for 2026-01"]]);
});
