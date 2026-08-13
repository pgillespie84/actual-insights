import { test, expect } from "vitest";
import { backfillMonths } from "./backfill.cjs";

// The old code ran a single unscoped DELETE across every month before
// generating anything, so one failed API call left the table empty. Nothing may
// be deleted for a month the run has not reached.
test("a mid-run failure leaves later months' insights untouched", async () => {
  const deleted: string[] = [];

  await expect(
    backfillMonths({
      months: ["2026-01", "2026-02", "2026-03"],
      deleteMonth: async (m: string) => {
        deleted.push(m);
      },
      generateMonth: async (m: string) => {
        if (m === "2026-02") throw new Error("api down");
      },
    }),
  ).rejects.toThrow("api down");

  expect(deleted).not.toContain("2026-03");
});
