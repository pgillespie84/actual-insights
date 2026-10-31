import { test, expect } from "vitest";
import { sumBalanceDeltas } from "./accountSnapshots.ts";
import { toDebtMetric } from "./debtMetric.ts";
import { debtDetail } from "./metricDetail.ts";

// Covers snapshot arithmetic -> debt conversion -> card text, so a sign flip
// at any of those steps fails here rather than showing a paydown as debt
// added. It skips accountBalanceMetric, which is safe because that passes
// getBalanceDelta's total through unchanged (it only maps "nothing known" to
// null).
function debtFrom(startBalance: number, endBalance: number, partial = false) {
  const delta = sumBalanceDeltas(
    ["card"],
    new Map([["card", startBalance]]),
    new Map([["card", endBalance]]),
  );
  return toDebtMetric({
    balance: endBalance,
    monthDelta: delta.total,
    ytdDelta: delta.total,
    partial,
    hasAccounts: true,
  });
}

test("a falling balance owed reads as paid down", () => {
  const metric = debtFrom(-1_000_000, -700_000);
  expect(metric).toMatchObject({ balance: 700_000, monthDelta: 300_000, ytdDelta: 300_000 });
  expect(debtDetail(metric)).toEqual({ text: "$3,000 paid down", tone: "positive" });
});

test("a rising balance owed reads as added", () => {
  const metric = debtFrom(-700_000, -1_000_000);
  expect(metric).toMatchObject({ balance: 1_000_000, monthDelta: -300_000, ytdDelta: -300_000 });
  expect(debtDetail(metric)).toEqual({ text: "$3,000 added", tone: "negative" });
});

test("unknown figures stay unknown", () => {
  const metric = toDebtMetric({
    balance: null, monthDelta: null, ytdDelta: null, partial: false, hasAccounts: true,
  });
  expect(metric).toMatchObject({ balance: null, monthDelta: null, ytdDelta: null });
  expect(debtDetail(metric).text).not.toMatch(/paid down|added/);
});

test("the partial and hasAccounts flags come through", () => {
  expect(debtFrom(-1_000_000, -700_000, true)).toMatchObject({
    partial: true,
    hasAccounts: true,
  });
});
