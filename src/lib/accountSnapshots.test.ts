import { test, expect } from "vitest";
import { sumBalanceDeltas } from "./accountSnapshots.ts";

// An account missing a snapshot at either boundary contributes 0 rather than
// being treated as a balance of zero, which would report the whole of the other
// boundary as a swing.
test("accounts missing a snapshot at either boundary contribute nothing", () => {
  const start = new Map([
    ["a", 1000],
    ["b", 500],
  ]);
  const end = new Map([
    ["a", 1500],
    ["c", 9999],
  ]);

  // a: +500. b: no end snapshot. c: no start snapshot.
  expect(sumBalanceDeltas(["a", "b", "c"], start, end)).toBe(500);
});
