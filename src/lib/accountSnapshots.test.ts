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
  expect(sumBalanceDeltas(["a", "b", "c"], start, end)).toEqual({
    total: 500,
    known: 1,
    requested: 3,
  });
});

// Nothing known is not the same as no movement. A period whose history was
// never backfilled has an unknown movement, and reporting it as "no change"
// is a confident wrong number.
test("sumBalanceDeltas reports nothing known when no account has both boundaries", () => {
  const start = new Map([["a", 1000]]);
  const end = new Map([["b", 2000]]);

  expect(sumBalanceDeltas(["a", "b"], start, end)).toEqual({
    total: 0,
    known: 0,
    requested: 2,
  });
});

test("sumBalanceDeltas reports full coverage when a known account did not move", () => {
  const balances = new Map([["a", 1000]]);

  expect(sumBalanceDeltas(["a"], balances, balances)).toEqual({
    total: 0,
    known: 1,
    requested: 1,
  });
});

test("sumBalances adds the accounts it knows about and counts the rest as unknown", () => {
  const balances = new Map([
    ["a", 120_000],
    ["c", 5_000],
  ]);

  expect(sumBalances(["a", "b", "c"], balances)).toEqual({
    total: 125_000,
    known: 2,
    requested: 3,
  });
});

test("sumBalances reports nothing known for an empty map", () => {
  expect(sumBalances(["a", "b"], new Map())).toEqual({
    total: 0,
    known: 0,
    requested: 2,
  });
});

test("sumBalances reports a genuine zero as fully known", () => {
  const balances = new Map([
    ["a", 4_000],
    ["b", -4_000],
  ]);

  expect(sumBalances(["a", "b"], balances)).toEqual({
    total: 0,
    known: 2,
    requested: 2,
  });
});

test("an empty account list is fully covered rather than unknown", () => {
  expect(sumBalances([], new Map([["a", 100]]))).toEqual({
    total: 0,
    known: 0,
    requested: 0,
  });
});
