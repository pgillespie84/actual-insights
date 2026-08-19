import { test, expect } from "vitest";
import { sumBalanceDeltas, sumBalances } from "./accountSnapshots.ts";

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

// Same rule the balance follows: nothing known is not the same as no movement.
// A month whose history was never backfilled would otherwise report a
// confident "no change" for accounts that may well have moved.
test("sumBalanceDeltas returns null when no account has both boundaries", () => {
  const start = new Map([["a", 1000]]);
  const end = new Map([["b", 2000]]);

  expect(sumBalanceDeltas(["a", "b"], start, end)).toBeNull();
});

test("sumBalanceDeltas returns zero when a known account genuinely did not move", () => {
  const balances = new Map([["a", 1000]]);

  expect(sumBalanceDeltas(["a"], balances, balances)).toBe(0);
});

// A balance total skips accounts with no snapshot rather than counting them as
// zero, matching sumBalanceDeltas. An account that did not exist yet in the
// month being viewed should not drag the total down.
test("sumBalances adds the accounts it knows about and skips the rest", () => {
  const balances = new Map([
    ["a", 120_000],
    ["c", 5_000],
  ]);

  expect(sumBalances(["a", "b", "c"], balances)).toBe(125_000);
});

// The distinction that matters for the dashboard: nothing known is not the
// same as a balance of zero. The card shows an em dash for null and would show
// a confident $0.00 for zero.
test("sumBalances returns null when no account has a snapshot", () => {
  expect(sumBalances(["a", "b"], new Map())).toBeNull();
});

test("sumBalances returns zero when the known balances genuinely sum to zero", () => {
  const balances = new Map([
    ["a", 4_000],
    ["b", -4_000],
  ]);

  expect(sumBalances(["a", "b"], balances)).toBe(0);
});

test("sumBalances returns null for an empty account list", () => {
  expect(sumBalances([], new Map([["a", 100]]))).toBeNull();
});
