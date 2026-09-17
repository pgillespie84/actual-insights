import { test, expect } from "vitest";
import {
  MAX_NOTE_LENGTH,
  isValidMonthKey,
  noteCoversMonth,
  validateNote,
  normalizeNote,
  fetchNotesForMonth,
  formatNoteForPrompt,
} from "./monthNotes.cjs";

test("month keys are YYYY-MM with a real month number", () => {
  expect(isValidMonthKey("2026-09")).toBe(true);
  expect(isValidMonthKey("2026-12")).toBe(true);
  expect(isValidMonthKey("2026-13")).toBe(false);
  expect(isValidMonthKey("2026-00")).toBe(false);
  expect(isValidMonthKey("2026-9")).toBe(false);
  expect(isValidMonthKey("")).toBe(false);
  expect(isValidMonthKey(undefined)).toBe(false);
});

test("a note with no end month covers only its own month", () => {
  const note = { monthStart: "2026-09", monthEnd: null };
  expect(noteCoversMonth(note, "2026-09")).toBe(true);
  expect(noteCoversMonth(note, "2026-08")).toBe(false);
  expect(noteCoversMonth(note, "2026-10")).toBe(false);
});

test("a note with an end month covers the inclusive range, across a year boundary", () => {
  const note = { monthStart: "2026-11", monthEnd: "2027-01" };
  expect(noteCoversMonth(note, "2026-10")).toBe(false);
  expect(noteCoversMonth(note, "2026-11")).toBe(true);
  expect(noteCoversMonth(note, "2026-12")).toBe(true);
  expect(noteCoversMonth(note, "2027-01")).toBe(true);
  expect(noteCoversMonth(note, "2027-02")).toBe(false);
});

test("validation rejects a bad month, a backwards range, and an empty note", () => {
  expect(validateNote({ monthStart: "nope", note: "x" })).toMatch(/YYYY-MM/);
  expect(validateNote({ monthStart: "2026-09", monthEnd: "2026-13", note: "x" })).toMatch(
    /end month/,
  );
  expect(validateNote({ monthStart: "2026-09", monthEnd: "2026-08", note: "x" })).toMatch(
    /before the start/,
  );
  expect(validateNote({ monthStart: "2026-09", note: "   " })).toMatch(/Write something/);
  expect(
    validateNote({ monthStart: "2026-09", note: "x".repeat(MAX_NOTE_LENGTH + 1) }),
  ).toMatch(/under/);
});

test("validation accepts a note with no end month, and one with a blank end month", () => {
  expect(validateNote({ monthStart: "2026-09", note: "Redid the walkway" })).toBeNull();
  expect(
    validateNote({ monthStart: "2026-09", monthEnd: "", note: "Redid the walkway" }),
  ).toBeNull();
  expect(
    validateNote({ monthStart: "2026-09", monthEnd: "2026-09", note: "Redid the walkway" }),
  ).toBeNull();
});

test("normalize trims the text and turns a blank end month into null", () => {
  expect(
    normalizeNote({ monthStart: "2026-09", monthEnd: "", note: "  vacation  " }),
  ).toEqual({ monthStart: "2026-09", monthEnd: null, note: "vacation" });
});

test("fetching a month asks for notes whose range covers it", async () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const pool = {
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      return {
        rows: [
          { monthStart: "2026-09", monthEnd: null, note: "Redid the front walkway" },
          { monthStart: "2026-08", monthEnd: "2026-09", note: "Vacation" },
        ],
      };
    },
  };

  const notes = await fetchNotesForMonth(pool, "2026-09");

  expect(calls).toHaveLength(1);
  expect(calls[0].values).toEqual(["2026-09"]);
  expect(calls[0].text).toContain("COALESCE");
  expect(notes).toEqual([
    { monthStart: "2026-09", monthEnd: null, note: "Redid the front walkway" },
    { monthStart: "2026-08", monthEnd: "2026-09", note: "Vacation" },
  ]);
});

test("a bad month key never reaches the database", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };
  expect(await fetchNotesForMonth(pool, "not-a-month")).toEqual([]);
  expect(called).toBe(false);
});

test("a multi-month note says so in the prompt, a single-month one does not", () => {
  expect(
    formatNoteForPrompt({ monthStart: "2026-09", monthEnd: null, note: "Vacation" }),
  ).toBe("Vacation");
  expect(
    formatNoteForPrompt({ monthStart: "2026-09", monthEnd: "2026-09", note: "Vacation" }),
  ).toBe("Vacation");
  expect(
    formatNoteForPrompt({ monthStart: "2026-08", monthEnd: "2026-10", note: "Kitchen" }),
  ).toBe("Kitchen (spans 2026-08 to 2026-10)");
});
