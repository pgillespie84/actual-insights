import { test, expect } from "vitest";
import { savingsDetail, debtDetail } from "./metricDetail.ts";

const full = { monthDelta: 124_000, partial: false, hasAccounts: true };

test("savings names the movement and reads as positive", () => {
  expect(savingsDetail(full)).toEqual({
    text: "+$1,240 this month",
    tone: "positive",
  });
});

test("savings reads as negative when money left", () => {
  expect(savingsDetail({ ...full, monthDelta: -64_000 })).toEqual({
    text: "−$640 this month",
    tone: "negative",
  });
});

// The bug this whole seam exists for: an unknown movement must not render as
// a confident "+$0 this month".
test("savings says the history is missing rather than showing zero", () => {
  expect(savingsDetail({ ...full, monthDelta: null })).toEqual({
    text: "No balance history",
    tone: "neutral",
  });
});

// A different cause needs a different sentence. No matching accounts means the
// configured names do not match the database — telling someone to backfill
// snapshots would send them after the wrong problem.
test("savings names a config mismatch as its own cause", () => {
  expect(savingsDetail({ monthDelta: null, partial: false, hasAccounts: false })).toEqual({
    text: "No matching accounts",
    tone: "neutral",
  });
});

test("a config mismatch is reported even if a delta somehow arrived", () => {
  expect(savingsDetail({ monthDelta: 5_000, partial: false, hasAccounts: false }).text).toBe(
    "No matching accounts",
  );
});

// Some accounts covered, others not: the number is real but it is not the
// whole group, and the card has to say so.
test("savings qualifies a partially covered movement", () => {
  expect(savingsDetail({ ...full, partial: true })).toEqual({
    text: "+$1,240 this month · partial history",
    tone: "positive",
  });
});

// The case that slipped through the first cut of this module: the balance
// covers some accounts and there is no movement figure at all. Falling back to
// "No balance history" would have printed a partial balance with no hint that
// it is partial.
test("savings says the coverage is partial even when the movement is unknown", () => {
  expect(savingsDetail({ monthDelta: null, partial: true, hasAccounts: true })).toEqual({
    text: "Partial history",
    tone: "neutral",
  });
});

test("debt says the coverage is partial even when the movement is unknown", () => {
  expect(debtDetail({ monthDelta: null, partial: true, hasAccounts: true })).toEqual({
    text: "Partial history",
    tone: "neutral",
  });
});

test("debt reads a positive delta as paid down", () => {
  expect(debtDetail({ ...full, monthDelta: 38_400 })).toEqual({
    text: "$384 paid down",
    tone: "positive",
  });
});

test("debt reads a negative delta as added", () => {
  expect(debtDetail({ ...full, monthDelta: -38_400 })).toEqual({
    text: "$384 added",
    tone: "negative",
  });
});

test("debt says the history is missing rather than showing zero", () => {
  expect(debtDetail({ ...full, monthDelta: null })).toEqual({
    text: "No balance history",
    tone: "neutral",
  });
});

test("debt qualifies a partially covered movement", () => {
  expect(debtDetail({ ...full, monthDelta: 38_400, partial: true })).toEqual({
    text: "$384 paid down · partial history",
    tone: "positive",
  });
});
