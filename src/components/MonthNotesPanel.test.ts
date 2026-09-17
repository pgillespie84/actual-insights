import { test, expect, vi } from "vitest";
import {
  staleMonths,
  monthsQuoting,
  describeFetchFailure,
  waitingMessage,
} from "./MonthNotesPanel";

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

const august = { ...note, monthStart: "2026-08", monthEnd: null };

test("a note is stale in the in-progress month whose insight also carries it", () => {
  // An in-progress insight gathers the previous three months and each carries
  // its own notes, so an August note is physically in the September insight.
  // Checking August alone would call the note seen while the insight someone
  // actually reads never received it.
  expect(staleMonths(august, { "2026-08": AFTER }, CURRENT)).toEqual(["2026-09"]);
});

test("only the current month is added, never an intermediate one", () => {
  // Exactly one month is in progress. September's and October's stored
  // insights are completed recaps, and a completed payload has no comparison
  // block, so neither can hold an August note. Offering them would be a paid
  // call that could not do what the button says, followed by a false "seen".
  expect(staleMonths(august, {}, "2026-11")).toEqual(["2026-08", "2026-11"]);
});

test("past the comparison window the current month is not carrying it either", () => {
  // August plus three is November. By December the in-progress insight reaches
  // back only to September, so August is not in it.
  expect(staleMonths(august, {}, "2026-12")).toEqual(["2026-08"]);
});

test("a note in the current month is not also blamed on a later one", () => {
  expect(staleMonths(note, {}, CURRENT)).toEqual(["2026-09"]);
});

test("deleting a note offers the in-progress insight that carried it too", () => {
  expect(monthsQuoting(august, { "2026-08": AFTER, "2026-09": AFTER }, CURRENT)).toEqual([
    "2026-08",
    "2026-09",
  ]);
});

test("the window is measured from the note's last month, not its first", () => {
  // October is the last covered month, so the in-progress insight still
  // carries this note in December — two months later, not five.
  expect(staleMonths(spanning, {}, "2026-12")).toEqual([
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-12",
  ]);
});

test("a note with no insight anywhere is stale in its own month", () => {
  expect(staleMonths(august, {}, CURRENT)).toEqual(["2026-08", "2026-09"]);
});

test("deleting a note offers months whose insight may still quote it, wider than stale", () => {
  // The asymmetry is deliberate. A September insight that was never replaced
  // by its completed recap still holds the August note, and missing it leaves
  // an insight quoting something that no longer exists. Being wrong here costs
  // a redundant call the user chose to make; being wrong in staleMonths
  // reports a note as seen when it is not.
  const insights = { "2026-08": AFTER, "2026-09": AFTER, "2026-11": AFTER };
  expect(monthsQuoting(august, insights, "2026-11")).toEqual([
    "2026-08",
    "2026-09",
    "2026-11",
  ]);
  expect(staleMonths(august, insights, "2026-11")).toEqual([]);
});

test("a throw that says nothing about the network is not described as if it did", () => {
  // The branch that matters. A failed fetch rejects with a TypeError, but so
  // does the likeliest bug in the logic these try blocks also wrap — reading a
  // property of undefined. Classifying by error class would call that bug a
  // network failure and send the reader to check whether the container is up,
  // which is why unreachability is decided at the fetch instead.
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(describeFetchFailure(new TypeError("Cannot read properties of undefined"))).toBe(
      "Something went wrong — there may be more in the browser console.",
    );
    expect(describeFetchFailure("a bare string")).toBe(
      "Something went wrong — there may be more in the browser console.",
    );
    // Caught errors are not reported by the browser, so pointing at the
    // console only helps if something put them there.
    expect(logged).toHaveBeenCalledTimes(2);
  } finally {
    logged.mockRestore();
  }
});

const RELOAD = "reload the page to see where it got to";
const IN_FRONT = "check what is in front of the app";

test("a wait that reached the endpoint is the only one that says the job may still be running", () => {
  expect(waitingMessage(true, { kind: "unreachable" }, null)).toBe(`Still running — ${RELOAD}.`);
  expect(waitingMessage(false, { kind: "reached" }, null)).toBe(`Still running — ${RELOAD}.`);
});

test("each way of failing to read the job points somewhere different", () => {
  // A status code carries no provenance, so only the gateway ones — what a
  // proxy returns for a backend it could not use — point past the app.
  expect(waitingMessage(false, { kind: "http", status: 500 }, null)).toBe(
    `The jobs endpoint answered HTTP 500 — ${RELOAD}.`,
  );
  expect(waitingMessage(false, { kind: "http", status: 502 }, null)).toBe(
    `Got HTTP 502 while waiting — ${IN_FRONT}.`,
  );
  expect(waitingMessage(false, { kind: "no-jobs" }, null)).toContain(IN_FRONT);
  expect(waitingMessage(false, { kind: "unreadable" }, null)).toContain(IN_FRONT);
  expect(waitingMessage(false, { kind: "unexpected" }, null)).toContain("browser console");
});

test("only a wait where nothing ever replied claims the whole wait", () => {
  expect(waitingMessage(false, { kind: "unreachable" }, null)).toBe(
    `Nothing answered while waiting — ${RELOAD}.`,
  );
  expect(waitingMessage(false, { kind: "unreachable" }, { kind: "no-jobs" })).toBe(
    `The last attempt got no answer. Before that: Something answered while waiting, but not the jobs endpoint — ${IN_FRONT}.`,
  );
});

test("a wait that ended before checking anything says that, rather than assuming the job runs", () => {
  expect(waitingMessage(false, null, null)).toBe(
    `The wait ended before anything was checked — ${RELOAD}.`,
  );
});

test("an observation from outside the type system fails loudly instead of rendering nothing", () => {
  // Returning undefined here would set the status line to an empty string —
  // the silent no-op this panel exists to remove.
  expect(() =>
    waitingMessage(false, { kind: "from-the-future" } as unknown as Parameters<
      typeof waitingMessage
    >[1], null),
  ).toThrow(/Unhandled poll observation/);
});

test("the type refuses to remember a non-answer as the answer", () => {
  // Not a runtime assertion — the point is that these lines do not compile.
  // tsconfig includes this file, so `tsc --noEmit` enforces it, and if
  // AnsweredObservation ever widens to admit them the unused @ts-expect-error
  // becomes the failure.

  // @ts-expect-error a dropped connection is not an answer
  waitingMessage(false, { kind: "unreachable" }, { kind: "unreachable" });

  // @ts-expect-error a throw from elsewhere establishes nothing about the server
  waitingMessage(false, { kind: "unreachable" }, { kind: "unexpected" });

  // @ts-expect-error reaching the job is carried by reachedJobsEndpoint, not remembered here
  waitingMessage(false, { kind: "unreachable" }, { kind: "reached" });

  expect(waitingMessage(false, { kind: "unreachable" }, { kind: "no-jobs" })).toContain(
    "Before that:",
  );
});
