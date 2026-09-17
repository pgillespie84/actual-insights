"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_NOTE_LENGTH, monthsCovered, nextMonthKey } from "@/lib/monthNoteShape.cjs";

/** The request never got an answer. */
class Unreachable extends Error {}

/** An answer arrived and could not be parsed. */
class UnreadableReply extends Error {}

/**
 * fetch, with a failure to reach the server marked as such at the point it
 * happens.
 *
 * Classifying here rather than by error type afterwards is the whole point. A
 * failed fetch rejects with a TypeError — but so does the most common bug in
 * the logic these try blocks also wrap: reading a property of undefined.
 * Deciding from the error class would call that bug a network failure and send
 * the reader off to check whether the container is up.
 */
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Unreachable("Could not reach the server.", { cause: err });
  }
}

/**
 * Reads a JSON body, marking a parse failure as its own kind of problem.
 *
 * A 200 with a truncated or non-JSON body — a proxy error page, a stream cut
 * short — means the server was reached and answered, so reporting it as
 * unreachable would be wrong. The rest of this panel is careful to claim only
 * what it can evidence; this keeps that true of its error messages too.
 */
async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch (err) {
    // Keeping the cause is the whole difference between a message the reader
    // can act on and one they cannot: the console then says whether this was a
    // proxy's HTML error page or a stream cut short.
    throw new UnreadableReply("The server's reply could not be read.", { cause: err });
  }
}

/**
 * What to tell the reader about a throw, claiming only what the error supports.
 *
 * Also logs. A caught error is not reported by the browser on its own, so
 * without this the message pointing at the console would send them somewhere
 * empty, and the cause kept above would go nowhere.
 */
export function describeFetchFailure(err: unknown): string {
  console.error(err);
  if (err instanceof Unreachable || err instanceof UnreadableReply) return err.message;
  return "Something went wrong — there may be more in the browser console.";
}

/**
 * The jobs endpoint's reply, with `jobs` optional on purpose: a 200 that parses
 * is not proof it came from this endpoint.
 */
interface JobsReply {
  jobs?: Record<string, { state: string; message: string | null }>;
}

/**
 * What waiting on the insights job can tell us.
 *
 * "ran" carries no message on purpose: the script exiting zero says nothing
 * about whether an insight was written, so there is nothing truthful to report
 * until the caller checks.
 */
type JobOutcome =
  | { state: "ran" }
  | { state: "failed"; message: string }
  | { state: "timeout"; message: string };

interface NotesPayload {
  notes: MonthNote[];
  insights: Record<string, string>;
}

interface MonthNote {
  id: string;
  monthStart: string;
  monthEnd: string | null;
  note: string;
  createdAt: string;
}

/**
 * The months whose insight has not seen this note yet.
 *
 * A note reaches an insight only when that month is regenerated, so a note
 * newer than an influenced month's insight is written down but not yet acted
 * on.
 *
 * Every influenced month is checked, not just the start month — see
 * `influencedMonths`. Checking one month would report the note as seen on the
 * strength of an insight that happened to be fresh, while the insight someone
 * actually reads never received it, which is precisely the "I added a note and
 * nothing happened" mystery this is here to prevent.
 */
export function staleMonths(
  note: MonthNote,
  insights: Record<string, string>,
  currentMonth: string,
): string[] {
  return influencedMonths(note, currentMonth).filter((month) => {
    const insight = insights[month];
    return !insight || insight < note.createdAt;
  });
}

/** How many months of context an in-progress insight gathers. */
const COMPARISON_MONTHS = 3;

/**
 * Every month whose insight can contain a note.
 *
 * The note's own months, obviously, since the fetch matches on its range. Plus
 * the current month, when it is close enough behind: `buildInsight` gathers the
 * previous three months alongside an in-progress month and `gatherMonthData`
 * puts each one's notes into its own payload, so an August note really is in
 * the September in-progress insight — and that is the insight someone reads.
 *
 * Only the current month, though. Exactly one month is in progress at a time;
 * every other month's stored insight is a completed recap, and a completed
 * payload has no comparison block at all. So once an intermediate month's
 * recap has been written it cannot hold the note, and listing it would offer a
 * paid Claude call that could not put the note where it claimed, then clear
 * the warning anyway because the timestamp moved. (A recap that was never
 * written is a different matter, and `possiblyQuotingMonths` handles it — but
 * that is a reason to offer a rewrite, not to claim a note has not landed.)
 *
 * Months ahead of the current one are excluded for a different reason:
 * `generate-insight.cjs` writes nothing for a month with no spending and
 * `--backfill` skips future months, so a future month could never stop being
 * stale — a warning and a button that do nothing however often they are
 * pressed. The note still reaches that month once it arrives.
 */
function influencedMonths(note: MonthNote, currentMonth: string): string[] {
  const covered = coveredSoFar(note, currentMonth);
  if (covered.length === 0) return [];

  const last = covered[covered.length - 1];
  if (currentMonth <= last) return covered;

  // Within the comparison window, so the in-progress insight carries it.
  return windowAfter(last).includes(currentMonth) ? [...covered, currentMonth] : covered;
}

/**
 * Every month whose stored insight might still contain a note, including ones
 * that were in progress when they were written.
 *
 * Wider than `influencedMonths` on purpose, and the asymmetry is the point.
 * That one decides whether to claim a note has not landed yet, where being
 * wrong means offering a regenerate that cannot help and then reporting the
 * note as seen. This one decides whether to offer to rewrite an insight after
 * its note was deleted, where being wrong costs a redundant Claude call the
 * user chose to spend, and being silent leaves an insight quoting something
 * that no longer exists anywhere.
 *
 * The case it catches: an August note is picked up by September's in-progress
 * insight. Normally October's run replaces that with a completed recap, which
 * has no comparison months and so drops the note. But if that never happened —
 * generation off for a month, no API key, the container down at the rollover —
 * September's stored row is still the in-progress text quoting the note.
 */
function possiblyQuotingMonths(note: MonthNote, currentMonth: string): string[] {
  const covered = coveredSoFar(note, currentMonth);
  if (covered.length === 0) return [];

  const later = windowAfter(covered[covered.length - 1]).filter(
    (m) => m <= currentMonth && !covered.includes(m),
  );
  return [...covered, ...later];
}

/** The note's own months, up to the current one. */
function coveredSoFar(note: MonthNote, currentMonth: string): string[] {
  return (monthsCovered(note) as string[]).filter((m) => m <= currentMonth);
}

/** The COMPARISON_MONTHS months following the given one. */
function windowAfter(month: string): string[] {
  const months: string[] = [];
  let next = month;
  for (let i = 0; i < COMPARISON_MONTHS; i++) {
    next = nextMonthKey(next) as string;
    months.push(next);
  }
  return months;
}

/**
 * The months whose stored insight was generated after this note, and so may
 * quote it.
 *
 * Used when a note is deleted: those insights describe something that is no
 * longer written down anywhere. A note deleted while still stale was never in
 * any insight, so there is nothing to redo — and each of these buttons is a
 * paid Claude call, so offering one that would rewrite an insight identically
 * is worse than offering nothing.
 *
 * "May" rather than "does": a completed-month recap is regenerated without
 * comparison months, so a later insight that once carried the note may have
 * dropped it already. Erring towards offering the regenerate is the right way
 * round — the alternative is an insight quoting a note that no longer exists,
 * with nothing on screen saying so.
 */
export function monthsQuoting(
  note: MonthNote,
  insights: Record<string, string>,
  currentMonth: string,
): string[] {
  return possiblyQuotingMonths(note, currentMonth).filter((month) => {
    const insight = insights[month];
    return Boolean(insight) && insight >= note.createdAt;
  });
}

function describeRange(note: MonthNote): string {
  return note.monthEnd && note.monthEnd !== note.monthStart
    ? `${note.monthStart} to ${note.monthEnd}`
    : note.monthStart;
}

export function MonthNotesPanel({
  months,
  currentMonth,
}: {
  months: string[];
  currentMonth: string;
}) {
  // The current month may have no budget rows yet, so it is not always in the
  // list the admin page derived from CategoryBudget — and it is the month you
  // are most likely to be annotating.
  const monthOptions = months.includes(currentMonth) ? months : [currentMonth, ...months];

  const [notes, setNotes] = useState<MonthNote[]>([]);
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [monthStart, setMonthStart] = useState(currentMonth);
  const [monthEnd, setMonthEnd] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [orphaned, setOrphaned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Reloads the notes and the insight timestamps, and hands the caller what it
   * read. `regenerate` needs the value rather than the state, so it can tell
   * whether an insight was actually written.
   */
  const load = useCallback(async (): Promise<NotesPayload | null> => {
    // Never throws. Callers treat null as "no evidence", and a rejection here
    // would escape through an onClick and take the caller's own error message
    // with it — leaving a panel that reports nothing at all.
    try {
      const res = await request("/api/admin/notes");
      if (!res.ok) {
        setError(res.status === 401 ? "Session expired — sign in again." : `HTTP ${res.status}`);
        return null;
      }
      const data = await readJson<NotesPayload>(res);
      setNotes(data.notes);
      setInsights(data.insights);
      return data;
    } catch (err) {
      setError(describeFetchFailure(err));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await request("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthStart, monthEnd: monthEnd || undefined, note: text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setText("");
      setMonthEnd("");
      await load();
    } catch (err) {
      setError(describeFetchFailure(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: MonthNote) {
    const ok = window.confirm(`Delete this note?\n\n${note.note}`);
    if (!ok) return;

    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await request(`/api/admin/notes?id=${encodeURIComponent(note.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }

      // The stored insights that quoted this note still contain whatever it
      // explained, and the note is no longer in the list to say so. Merged
      // rather than replaced, so deleting a second note does not drop the
      // first one's months off the banner.
      const quoting = monthsQuoting(note, insights, currentMonth);
      if (quoting.length > 0) {
        setOrphaned((prev) => [...new Set([...prev, ...quoting])].sort());
      }
      await load();
    } catch (err) {
      setError(describeFetchFailure(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Starts the insights job for one month, then waits for it to settle and
   * reloads.
   *
   * Without the reload the note keeps saying the AI has not seen it long after
   * it has, which defeats the point of showing the state at all. The job
   * registry runs one job at a time, so polling its status is how we know the
   * insight has actually been written.
   */
  async function regenerate(month: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await request("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "insights", month }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }

      setStatus(`Regenerating ${month}…`);
      const before = insights[month];
      const result = await waitForInsightsJob();

      // A failure belongs in the red box with the other errors, not in the
      // muted status line where it reads like progress.
      if (result.state === "failed") {
        setStatus(null);
        // The reload runs first and the job's reason is set after it, so a
        // reload that also fails cannot bury why the regeneration failed.
        // A 401 makes both fail, and "sign in again" is the useful half.
        await load();
        setError(result.message);
        return;
      }

      const after = await load();

      if (result.state === "timeout") {
        setStatus(result.message);
        return;
      }

      // The reload is the evidence, so without it there is nothing to claim.
      // load() has already put its own error on screen; clearing the banner
      // here would throw away the thing that would prompt a retry.
      if (after === null) {
        setStatus(null);
        return;
      }

      // The job exits zero whether or not it wrote anything: a month with no
      // spending is skipped and still counts as success, and the script's last
      // line is always "Done." so the runner's summary cannot tell us either.
      // Whether the insight moved is the only honest signal, and saying
      // "regenerated" without it is the never-clearing loop one layer up.
      if (after.insights[month] === before) {
        setStatus(
          `Nothing was written for ${month} — there is no spending recorded for it yet.`,
        );
        return;
      }

      setStatus("Insight regenerated.");
      setOrphaned((months) => months.filter((m) => m !== month));
    } catch (err) {
      setStatus(null);
      setError(describeFetchFailure(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Polls the jobs endpoint until the insights job settles.
   *
   * Only "success" and "failed" count as settled. "idle" is what the registry
   * reports after a restart took the job down with it, and calling that
   * success would tell the user an insight was written when it was not.
   */
  async function waitForInsightsJob(): Promise<JobOutcome> {
    // Whether anything ever answered, so the message at the end can tell
    // "the job is taking a while" apart from "nothing replied for two
    // minutes" — the second being what a container restart looks like, which
    // is exactly when a job is likely to have been in flight.
    let everAnswered = false;

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      // A dropped connection partway through a two-minute poll is not evidence
      // about the job, so it is worth another go round. Running out of
      // iterations is already reported honestly as a timeout.
      // `jobs` is optional in the parsed type rather than only on this
      // declaration, so the compiler requires the check below instead of
      // narrowing it away on the assignment. A body that parses but is not
      // this endpoint's is a real possibility, and a type that denies it would
      // let a tidy-up delete the guard as redundant.
      let jobs: JobsReply["jobs"];
      try {
        const res = await request("/api/admin/jobs");
        // A resolved request is the evidence that something answered. Whether
        // its body parses is a separate question, and a jobs endpoint
        // returning 500 for two minutes is a server that replied sixty times.
        everAnswered = true;
        if (res.status === 401) {
          return { state: "failed", message: "Session expired — sign in again." };
        }
        if (!res.ok) continue;
        ({ jobs } = await readJson<JobsReply>(res));
      } catch (err) {
        // The only failure path that does not reach describeFetchFailure, so
        // it has to log for itself. A wait that ran two minutes and learned
        // nothing is the one most worth leaving a trace of.
        console.error(err);
        continue;
      }

      if (!jobs) {
        // Parsed, but not from this endpoint — a proxy answering 200 with its
        // own envelope. It costs an attempt like any other non-answer, and it
        // is logged for the same reason the catch above is: otherwise this is
        // a silent two-minute wait with an empty console.
        console.error("The jobs endpoint answered without a jobs object.");
        continue;
      }

      const job = jobs.insights;
      if (job?.state === "failed") {
        return { state: "failed", message: `Regeneration failed: ${job.message ?? "no message"}` };
      }
      if (job?.state === "success") {
        // Only that the script exited zero. Whether an insight was actually
        // written is the caller's question.
        return { state: "ran" };
      }
    }
    // Ran out of patience, not evidence of failure. The job may well be fine,
    // so this belongs in the status line rather than the red box.
    return {
      state: "timeout",
      message: everAnswered
        ? "Still running — reload the page to see where it got to."
        : "Nothing answered while waiting — reload the page to see where it got to.",
    };
  }

  const button =
    "rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50";
  const field =
    "rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-text-primary";

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Month notes</h2>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {status && <p className="text-sm text-text-secondary">{status}</p>}

      {orphaned.length > 0 && (
        <div className="rounded-lg border border-card-border bg-card-bg px-4 py-3 text-sm text-text-secondary">
          <p>
            The {orphaned.length === 1 ? "insight" : "insights"} for{" "}
            {orphaned.join(", ")} may still quote the note you just deleted.
            Regenerate any that should be written without it.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {orphaned.map((month) => (
              <button
                key={month}
                className={button}
                disabled={busy}
                onClick={() => void regenerate(month)}
              >
                Regenerate {month}
              </button>
            ))}
            <button
              className={button}
              disabled={busy}
              onClick={() => setOrphaned([])}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-card-border bg-card-bg p-5">
        <p className="max-w-2xl text-sm text-text-secondary">
          Context for the AI insight. Write what happened and why, and the insight will
          explain the figures instead of guessing at them. Notes change no number on the
          dashboard and excuse nothing — a category over budget stays over budget, it just
          gets the reason attached.
        </p>

        <div className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            placeholder="Redid the front walkway, around $800, planned and paid from short-term savings."
            className={`w-full ${field}`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Month
              <select
                value={monthStart}
                onChange={(e) => {
                  const next = e.target.value;
                  setMonthStart(next);
                  // The "Through" options are filtered to months at or after
                  // the start, so a stale end month would sit in state with no
                  // option to show it — a blank select that fails on save.
                  if (monthEnd && monthEnd < next) setMonthEnd("");
                }}
                className={field}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Through
              <select
                value={monthEnd}
                onChange={(e) => setMonthEnd(e.target.value)}
                className={field}
              >
                <option value="">just that month</option>
                {monthOptions
                  .filter((m) => m >= monthStart)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            </label>
            <button className={button} disabled={busy || text.trim() === ""} onClick={() => void save()}>
              Save note
            </button>
          </div>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-text-secondary">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const stale = staleMonths(note, insights, currentMonth);
            return (
              <li
                key={note.id}
                className="rounded-xl border border-card-border bg-card-bg p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="font-mono text-xs text-text-secondary">
                      {describeRange(note)}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">{note.note}</p>
                    {stale.length > 0 && (
                      <p className="mt-2 text-sm text-warning-text">
                        {stale.length === 1
                          ? `The ${stale[0]} insight has not seen this note yet.`
                          : `The insights for ${stale.join(", ")} have not seen this note yet.`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* One button per stale month: the job registry runs one at
                        a time, so firing several at once would just collide. */}
                    {stale.map((month) => (
                      <button
                        key={month}
                        className={button}
                        disabled={busy}
                        onClick={() => void regenerate(month)}
                      >
                        {stale.length === 1 ? "Regenerate now" : `Regenerate ${month}`}
                      </button>
                    ))}
                    <button className={button} disabled={busy} onClick={() => void remove(note)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
