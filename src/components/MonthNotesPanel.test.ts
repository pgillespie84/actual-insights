import { test, expect } from "vitest";
import { staleMonths } from "./MonthNotesPanel";

const note = {
  id: "1",
  monthStart: "2026-09",
  monthEnd: null,
  note: "Redid the front walkway",
  createdAt: "2026-09-16T12:00:00.000Z",
};

const spanning = { ...note, monthStart: "2026-08", monthEnd: "2026-10" };

test("a note written after the month's insight has not reached the model", () => {
  expect(staleMonths(note, { "2026-09": "2026-09-16T08:00:00.000Z" })).toEqual(["2026-09"]);
});

test("a note older than the insight has been seen", () => {
  expect(staleMonths(note, { "2026-09": "2026-09-16T18:00:00.000Z" })).toEqual([]);
});

test("a month with no insight at all counts as stale", () => {
  expect(staleMonths(note, {})).toEqual(["2026-09"]);
  // An insight for a different month says nothing about this one.
  expect(staleMonths(note, { "2026-08": "2027-01-01T00:00:00.000Z" })).toEqual(["2026-09"]);
});

test("a spanning note is stale in every covered month the insight missed", () => {
  // The bug this guards: checking only the start month reports the note as
  // seen because August is fresh, while September and October never got it.
  expect(
    staleMonths(spanning, {
      "2026-08": "2026-09-16T18:00:00.000Z",
      "2026-09": "2026-09-16T08:00:00.000Z",
    }),
  ).toEqual(["2026-09", "2026-10"]);
});

test("a spanning note is clean only when every covered month has seen it", () => {
  const seen = "2026-09-16T18:00:00.000Z";
  expect(
    staleMonths(spanning, { "2026-08": seen, "2026-09": seen, "2026-10": seen }),
  ).toEqual([]);
});
