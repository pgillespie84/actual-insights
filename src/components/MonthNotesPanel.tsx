"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_NOTE_LENGTH } from "@/lib/monthNotes.cjs";

interface MonthNote {
  id: string;
  monthStart: string;
  monthEnd: string | null;
  note: string;
  createdAt: string;
}

/**
 * Whether the model has seen a note yet.
 *
 * A note only reaches the insight when that month is regenerated, so a note
 * newer than its month's insight is written down but not yet acted on. Saying
 * so is what stops "I added a note and nothing happened" being a mystery.
 */
export function isPending(note: MonthNote, insights: Record<string, string>): boolean {
  const insight = insights[note.monthStart];
  return !insight || insight < note.createdAt;
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
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/notes?id=${encodeURIComponent(note.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(month: string) {
    setError(null);
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
    setError(null);
    window.alert(
      `Regenerating ${month}. It takes a few seconds — the Maintenance section above shows progress.`,
    );
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
                onChange={(e) => setMonthStart(e.target.value)}
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
            const pending = isPending(note, insights);
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
                    {pending && (
                      <p className="mt-2 text-sm text-warning-text">
                        Newer than this month&apos;s insight — the AI has not seen it yet.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {pending && (
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void regenerate(note.monthStart)}
                      >
                        Regenerate now
                      </button>
                    )}
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
