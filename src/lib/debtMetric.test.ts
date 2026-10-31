import { test, expect } from "vitest";
import { sumBalanceDeltas } from "./accountSnapshots.ts";
import { toDebtMetric } from "./debtMetric.ts";
import { debtDetail } from "./metricDetail.ts";

// Runs the real snapshot arithmetic through the conversion, so a sign flip at
// either step fails here rather than showing a paydown as debt added.
function debtFrom(startBalance: number, endBalance: number) {
  const delta = sumBalanceDeltas(
    ["card"],
    new Map([["card", startBalance]]),
    new Map([["card", endBalance]]),
  );
  return toDebtMetric({
    balance: endBalance,
    monthDelta: delta.total,
    ytdDelta: delta.total,
    partial: false,
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
  expect(metric).toMatchObject({ balance: 1_000_000, monthDelta: -300_000 });
  expect(debtDetail(metric)).toEqual({ text: "$3,000 added", tone: "negative" });
});

test("unknown figures stay unknown", () => {
  const metric = toDebtMetric({
    balance: null, monthDelta: null, ytdDelta: null, partial: false, hasAccounts: true,
  });
  expect(metric).toMatchObject({ balance: null, monthDelta: null, ytdDelta: null });
});
