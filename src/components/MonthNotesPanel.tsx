"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_NOTE_LENGTH, monthsCovered } from "@/lib/monthNoteShape.cjs";

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
 * newer than a covered month's insight is written down but not yet acted on.
 *
 * Every covered month is checked, not just the start month. A note spanning
 * August to September feeds both months' insights, so a fresh August insight
 * says nothing about September — checking only the start month would report
 * the note as seen while September never received it, which is precisely the
 * "I added a note and nothing happened" mystery this is here to prevent.
 */
export function staleMonths(
  note: MonthNote,
  insights: Record<string, string>,
  currentMonth: string,
): string[] {
  return coveredSoFar(note, currentMonth).filter((month) => {
    const insight = insights[month];
    return !insight || insight < note.createdAt;
  });
}

/**
 * The months a note covers that can actually hold an insight yet.
 *
 * A note can legitimately run into a future month — a remodel booked through
 * October, written in September — and Actual Budget hands us budget months
 * ahead of today, so those months appear in the dropdown. But
 * `generate-insight.cjs` writes nothing for a month with no spending and
 * `--backfill` skips future months outright, so a future month can never stop
 * being stale. Flagging it would leave a warning and a button that do nothing
 * however many times they are pressed, which is the loop this feature exists
 * to remove. The note still reaches that month's insight once the month
 * arrives, because the fetch matches on the range.
 */
function coveredSoFar(note: MonthNote, currentMonth: string): string[] {
  return (monthsCovered(note) as string[]).filter((month) => month <= currentMonth);
}

/**
 * The months whose stored insight actually quotes this note.
 *
 * Used when a note is deleted: those insights now describe something that is
 * no longer written down anywhere. A note deleted while still stale was never
 * in any insight, so there is nothing to redo — and each of these buttons is a
 * paid Claude call, so offering one that would rewrite an insight identically
 * is worse than offering nothing.
 */
export function monthsQuoting(
  note: MonthNote,
  insights: Record<string, string>,
  currentMonth: string,
): string[] {
  return coveredSoFar(note, currentMonth).filter((month) => {
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

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notes");
    if (!res.ok) {
      setError(res.status === 401 ? "Session expired — sign in again." : `HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as { notes: MonthNote[]; insights: Record<string, string> };
    setNotes(data.notes);
    setInsights(data.insights);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notes", {
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
      const res = await fetch(`/api/admin/notes?id=${encodeURIComponent(note.id)}`, {
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
      const res = await fetch("/api/admin/jobs", {
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
      const result = await waitForInsightsJob();
      // A failure belongs in the red box with the other errors, not in the
      // muted status line where it reads like progress.
      if (result.ok) {
        setStatus(result.message);
        setOrphaned((months) => months.filter((m) => m !== month));
      } else {
        setStatus(null);
        setError(result.message);
      }
      await load();
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
  async function waitForInsightsJob(): Promise<
    { ok: true; message: string } | { ok: false; message: string }
  > {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch("/api/admin/jobs");
      if (res.status === 401) {
        return { ok: false, message: "Session expired — sign in again." };
      }
      if (!res.ok) continue;
      const { jobs } = (await res.json()) as {
        jobs: Record<string, { state: string; message: string | null }>;
      };
      const job = jobs.insights;
      if (job?.state === "failed") {
        return { ok: false, message: `Regeneration failed: ${job.message ?? "no message"}` };
      }
      if (job?.state === "success") {
        return { ok: true, message: "Insight regenerated." };
      }
    }
    return { ok: false, message: "Still running — reload the page to see where it got to." };
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
            {orphaned.join(", ")} still {orphaned.length === 1 ? "quotes" : "quote"} the
            note you just deleted. Regenerate to write {orphaned.length === 1 ? "it" : "them"}{" "}
            without it.
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
