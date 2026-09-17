import { test, expect } from "vitest";
import { isPending } from "./MonthNotesPanel";

const note = {
  id: "1",
  monthStart: "2026-09",
  monthEnd: null,
  note: "Redid the front walkway",
  createdAt: "2026-09-16T12:00:00.000Z",
};

test("a note written after the month's insight has not reached the model", () => {
  expect(isPending(note, { "2026-09": "2026-09-16T08:00:00.000Z" })).toBe(true);
});

test("a note older than the insight has been seen", () => {
  expect(isPending(note, { "2026-09": "2026-09-16T18:00:00.000Z" })).toBe(false);
});

test("a month with no insight at all counts as pending", () => {
  expect(isPending(note, {})).toBe(true);
  // An insight for a different month says nothing about this one.
  expect(isPending(note, { "2026-08": "2027-01-01T00:00:00.000Z" })).toBe(true);
});
