import { test, expect } from "vitest";
import { staleMonths, monthsQuoting } from "./MonthNotesPanel";

const NOW = "2026-09-16T12:00:00.000Z";
const BEFORE = "2026-09-16T08:00:00.000Z";
const AFTER = "2026-09-16T18:00:00.000Z";
const CURRENT = "2026-09";

const note = {
  id: "1",
  monthStart: "2026-09",
  monthEnd: null,
  note: "Redid the front walkway",
  createdAt: NOW,
};

const spanning = { ...note, monthStart: "2026-08", monthEnd: "2026-10" };

test("a note written after the month's insight has not reached the model", () => {
  expect(staleMonths(note, { "2026-09": BEFORE }, CURRENT)).toEqual(["2026-09"]);
});

test("a note older than the insight has been seen", () => {
  expect(staleMonths(note, { "2026-09": AFTER }, CURRENT)).toEqual([]);
});

test("a month with no insight at all counts as stale", () => {
  expect(staleMonths(note, {}, CURRENT)).toEqual(["2026-09"]);
  // An insight for a different month says nothing about this one.
  expect(staleMonths(note, { "2026-08": AFTER }, CURRENT)).toEqual(["2026-09"]);
});

test("a spanning note is stale in every covered month the insight missed", () => {
  // The bug this guards: checking only the start month reports the note as
  // seen because August is fresh, while September never got it.
  expect(
    staleMonths(spanning, { "2026-08": AFTER, "2026-09": BEFORE }, CURRENT),
  ).toEqual(["2026-09"]);
});

test("a spanning note is clean only when every covered month so far has seen it", () => {
  expect(staleMonths(spanning, { "2026-08": AFTER, "2026-09": AFTER }, CURRENT)).toEqual([]);
});

test("a month that cannot hold an insight yet is never called stale", () => {
  // October is in the note's range and in the dropdown, but nothing writes an
  // insight for a month with no spending, so flagging it would leave a warning
  // and a button that can never clear.
  expect(staleMonths(spanning, {}, CURRENT)).not.toContain("2026-10");
  expect(staleMonths(spanning, {}, CURRENT)).toEqual(["2026-08", "2026-09"]);
  // Once October arrives it is checked like any other month.
  expect(staleMonths(spanning, {}, "2026-10")).toEqual(["2026-08", "2026-09", "2026-10"]);
});

test("only the insights that actually quote a note are worth redoing when it is deleted", () => {
  // September saw the note, August predates it. Offering August would spend a
  // Claude call rewriting an insight that never mentioned the note.
  expect(monthsQuoting(spanning, { "2026-08": BEFORE, "2026-09": AFTER }, CURRENT)).toEqual([
    "2026-09",
  ]);
});

test("a note deleted before any insight saw it leaves nothing to redo", () => {
  expect(monthsQuoting(note, {}, CURRENT)).toEqual([]);
  expect(monthsQuoting(note, { "2026-09": BEFORE }, CURRENT)).toEqual([]);
});

test("quoting and stale never claim the same month", () => {
  const insights = { "2026-08": AFTER, "2026-09": BEFORE };
  const stale = staleMonths(spanning, insights, CURRENT);
  const quoting = monthsQuoting(spanning, insights, CURRENT);
  expect(stale.filter((m) => quoting.includes(m))).toEqual([]);
});

test("a note is stale in the months whose in-progress insight also carries it", () => {
  // An in-progress insight gathers the previous three months and each carries
  // its own notes, so an August note is physically in the September insight.
  // Checking August alone would call the note seen while the insight someone
  // actually reads never received it.
  const august = { ...note, monthStart: "2026-08", monthEnd: null };
  expect(staleMonths(august, { "2026-08": AFTER }, CURRENT)).toEqual(["2026-09"]);
});

test("the comparison window stops at the current month", () => {
  const august = { ...note, monthStart: "2026-08", monthEnd: null };
  // August plus three would reach November; only months that can hold an
  // insight are asked.
  expect(staleMonths(august, {}, CURRENT)).toEqual(["2026-08", "2026-09"]);
  expect(staleMonths(august, {}, "2026-11")).toEqual([
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
});

test("deleting a note offers the later insights that carried it, not just its own month", () => {
  const august = { ...note, monthStart: "2026-08", monthEnd: null };
  expect(monthsQuoting(august, { "2026-08": AFTER, "2026-09": AFTER }, CURRENT)).toEqual([
    "2026-08",
    "2026-09",
  ]);
});
