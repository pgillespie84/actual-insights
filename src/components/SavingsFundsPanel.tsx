"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_FUND_NAME_LENGTH } from "@/lib/savingsFundShape.cjs";
import { formatCents } from "@/lib/format";
import type { FundGroup, FundRow, SavingsFundRecord } from "@/lib/savingsFunds";

interface FundsReply {
  monthKey: string;
  groups: FundGroup[];
  funds: SavingsFundRecord[];
}

/** The sentinel the group picker uses for "somewhere new". */
const NEW_GROUP = "__new__";

/**
 * The amount as the box should show it: plain digits, no currency symbol and
 * no thousands separators.
 *
 * Deliberately not `formatCents`. The box is a thing to type over, and a
 * prefilled "$3,953.32" makes the household delete punctuation before they
 * can edit — while the parser accepts the punctuation anyway, so nothing is
 * gained by putting it there.
 */
function toInputValue(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/** `2026-09` as `Sep 2026`, for the markers where the month is an aside. */
function shortMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(month) - 1] ?? month} ${year}`;
}

/**
 * The months the picker offers: the current month and the two years before
 * it, newest first.
 *
 * A fixed window rather than the months that have data, because the point of
 * the picker is to reach a month that has none yet — either the one just
 * ended or an older one being backfilled by hand.
 */
function monthOptions(currentMonth: string): string[] {
  const months: string[] = [];
  let [year, month] = currentMonth.split("-").map(Number);
  for (let i = 0; i < 25; i++) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}

/**
 * Entering and managing savings funds.
 *
 * Two jobs on one screen, in the order they are done: type this month's
 * figures into the grid, and occasionally add, rename or archive a fund
 * underneath.
 *
 * The grid pre-fills every box with the figure the dashboard is currently
 * showing, carried ones included, so what is being overwritten is visible.
 * Only boxes that were actually changed are sent — see the save handler.
 */
export function SavingsFundsPanel({ currentMonth }: { currentMonth: string }) {
  const [monthKey, setMonthKey] = useState(currentMonth);
  const [groups, setGroups] = useState<FundGroup[]>([]);
  const [funds, setFunds] = useState<SavingsFundRecord[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /**
   * The month the figures on screen were loaded for.
   *
   * Kept separately from the month in the picker, because the two can
   * disagree: a load that fails leaves the old month's numbers in place while
   * the picker already reads the new one. Showing that grid would invite the
   * household to save September's figures against August, so the grid is
   * withheld until these two agree again.
   */
  const [shownMonth, setShownMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newGroupText, setNewGroupText] = useState("");

  const months = useMemo(() => monthOptions(currentMonth), [currentMonth]);

  const existingGroups = useMemo(() => {
    const seen: string[] = [];
    for (const fund of funds) if (!seen.includes(fund.group)) seen.push(fund.group);
    return seen;
  }, [funds]);

  /**
   * Fills the grid from a server reply.
   *
   * The typed values and the snapshot they are compared against are set from
   * the same reply, so "changed" always means changed against what the server
   * last said rather than against whatever was on screen before.
   */
  const fill = useCallback((data: FundsReply) => {
    setGroups(data.groups);
    setFunds(data.funds);
    const next: Record<string, string> = {};
    for (const group of data.groups) {
      for (const fund of group.funds) next[fund.id] = toInputValue(fund.balance);
    }
    setValues(next);
    setInitial(next);
    setShownMonth(data.monthKey);
  }, []);

  const load = useCallback(
    async (month: string) => {
      setError(null);
      // Cleared here rather than only on save: "Saved 3 figures for Sep 2026"
      // sitting above August's grid reads as a claim about August.
      setStatus(null);
      try {
        const res = await fetch(`/api/admin/funds?month=${encodeURIComponent(month)}`);
        if (!res.ok) {
          setError(res.status === 401 ? "Session expired — sign in again." : `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as FundsReply;
        // The server says which month it answered for, and that is what the
        // grid is labelled with — not the month that was asked for.
        fill({ ...data, monthKey: month });
      } catch (err) {
        console.error(err);
        setError("Could not reach the server.");
      }
    },
    [fill],
  );

  useEffect(() => {
    void load(monthKey);
  }, [load, monthKey]);

  const changed = useMemo(
    () => Object.keys(values).filter((id) => values[id].trim() !== (initial[id] ?? "").trim()),
    [values, initial],
  );

  async function save() {
    if (changed.length === 0) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/funds/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the boxes that changed. An untouched box holds a carried
        // figure, and sending it back would stamp it as this month's
        // confirmed entry — the dashboard would then stop saying the figure
        // is old, which is the one thing it most needs to say.
        body: JSON.stringify({
          monthKey,
          entries: changed.map((id) => ({ fundId: id, amount: values[id] })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        written?: number;
        cleared?: number;
        groups?: FundGroup[];
      };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.groups) fill({ monthKey, groups: data.groups, funds });
      const saved = data.written ?? 0;
      const cleared = data.cleared ?? 0;
      setStatus(
        `Saved ${saved} ${saved === 1 ? "figure" : "figures"} for ${shortMonth(monthKey)}` +
          (cleared > 0 ? `, cleared ${cleared}.` : "."),
      );
    } catch (err) {
      console.error(err);
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function addFund() {
    const group = newGroup === NEW_GROUP ? newGroupText.trim() : newGroup;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, group }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setNewName("");
      setNewGroupText("");
      // The group stays selected: funds arrive in batches, and the household
      // adding four clothes funds should type four names and nothing else.
      if (newGroup === NEW_GROUP) setNewGroup(group);
      setStatus(`Added ${newName.trim()}.`);
      await load(monthKey);
    } catch (err) {
      console.error(err);
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function patchFund(id: string, patch: Record<string, unknown>, done: string) {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/funds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus(done);
      await load(monthKey);
    } catch (err) {
      console.error(err);
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const button =
    "rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50";
  const field =
    "rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-text-primary";

  const canAdd =
    newName.trim() !== "" &&
    (newGroup === NEW_GROUP ? newGroupText.trim() !== "" : newGroup !== "");

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Savings funds</h2>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {status && <p className="text-sm text-text-secondary">{status}</p>}

      <div className="rounded-xl border border-card-border bg-card-bg p-5">
        <p className="max-w-2xl text-sm text-text-secondary">
          Where each fund stood at the end of the month. Typed in by hand — nothing here
          syncs from Actual, and no figure on this page changes the dashboard&rsquo;s
          savings balance or net worth.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Boxes are pre-filled with whatever the dashboard is showing now, so you can see
          what you are overwriting. Leave a fund alone and it keeps carrying its last
          known figure forward; empty a box to take back a figure you entered by mistake.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Month
            <select
              aria-label="Month"
              value={monthKey}
              onChange={(e) => {
                const next = e.target.value;
                // Nineteen boxes typed and one mis-click on the picker used to
                // throw the lot away without a word. Asking is the whole guard:
                // the figures live only in this form until Save.
                if (
                  changed.length > 0 &&
                  !window.confirm(
                    `${changed.length} ${changed.length === 1 ? "figure has" : "figures have"} not been saved. Switch months and lose them?`,
                  )
                ) {
                  return;
                }
                setMonthKey(next);
              }}
              className={field}
              disabled={busy}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            className={button}
            disabled={busy || changed.length === 0 || shownMonth !== monthKey}
            onClick={() => void save()}
          >
            {changed.length === 0
              ? "Nothing changed"
              : `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
          </button>
        </div>
      </div>

      {shownMonth !== monthKey ? (
        // Withheld rather than shown stale. The error banner above says what
        // went wrong when a load failed; what must not happen is one month's
        // figures sitting under another month's label.
        <p className="text-sm text-text-secondary">Loading {monthKey}…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No funds yet. Add one below, or import the spreadsheet with{" "}
          <span className="font-mono text-xs">scripts/import-fund-history.cjs</span>.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.group} className="rounded-xl border border-card-border bg-card-bg p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-text-primary">{group.group}</h3>
              <p className="text-sm tabular-nums text-text-secondary">
                {formatCents(group.total)}
                {group.carriedCount > 0 && (
                  <span className="ml-2 text-xs">
                    {group.carriedCount} carried forward
                  </span>
                )}
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {group.funds.map((fund) => (
                <FundEntryRow
                  key={fund.id}
                  fund={fund}
                  value={values[fund.id] ?? ""}
                  dirty={changed.includes(fund.id)}
                  busy={busy}
                  field={field}
                  onChange={(next) => setValues((prev) => ({ ...prev, [fund.id]: next }))}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <div className="rounded-xl border border-card-border bg-card-bg p-5">
        <h3 className="font-semibold text-text-primary">Add a fund</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={MAX_FUND_NAME_LENGTH}
            placeholder="Car Repair Fund"
            className={`w-64 ${field}`}
          />
          <select
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            className={field}
          >
            <option value="">Pick a group</option>
            {existingGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={NEW_GROUP}>New group…</option>
          </select>
          {newGroup === NEW_GROUP && (
            <input
              value={newGroupText}
              onChange={(e) => setNewGroupText(e.target.value)}
              placeholder="Medium Term"
              className={`w-44 ${field}`}
            />
          )}
          <button className={button} disabled={busy || !canAdd} onClick={() => void addFund()}>
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          Groups are offered from the ones already in use, so &ldquo;Short Term&rdquo; and
          &ldquo;Short term&rdquo; cannot become two blocks.
        </p>
      </div>

      {funds.length > 0 && (
        <details className="rounded-xl border border-card-border bg-card-bg p-5">
          <summary className="cursor-pointer font-semibold text-text-primary">
            Rename and archive
          </summary>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Archiving takes a fund off the grid and off the dashboard from that month on.
            Every figure it has is kept, and months before it still show the fund — so an
            archived fund never changes a month that has already been reported.
          </p>
          <ul className="mt-3 space-y-2">
            {funds.map((fund) => (
              <FundAdminRow
                key={`${fund.id}:${fund.name}`}
                fund={fund}
                groups={existingGroups}
                busy={busy}
                field={field}
                button={button}
                monthKey={monthKey}
                onPatch={patchFund}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function FundEntryRow({
  fund,
  value,
  dirty,
  busy,
  field,
  onChange,
}: {
  fund: FundRow;
  value: string;
  dirty: boolean;
  busy: boolean;
  field: string;
  onChange: (next: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-text-primary">{fund.name}</p>
        <p className="text-xs text-text-secondary">
          {fund.balance === null
            ? "never recorded"
            : fund.carried
              ? `carried from ${shortMonth(fund.asOf as string)}`
              : "entered for this month"}
        </p>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        aria-label={`${fund.name} balance`}
        placeholder="—"
        disabled={busy}
        className={`w-32 text-right tabular-nums ${field} ${
          dirty ? "border-accent" : ""
        }`}
      />
    </li>
  );
}

function FundAdminRow({
  fund,
  groups,
  busy,
  field,
  button,
  monthKey,
  onPatch,
}: {
  fund: SavingsFundRecord;
  groups: string[];
  busy: boolean;
  field: string;
  button: string;
  monthKey: string;
  onPatch: (id: string, patch: Record<string, unknown>, done: string) => Promise<void>;
}) {
  // Seeded once per mount. The caller keys this row on the name as well as
  // the id, so a rename that came back from the server remounts the row and
  // re-seeds the box — which is the same outcome as syncing state to a prop
  // in an effect, without the render-then-correct pass.
  const [name, setName] = useState(fund.name);

  const renamed = name.trim() !== "" && name.trim() !== fund.name;

  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_FUND_NAME_LENGTH}
        aria-label={`Rename ${fund.name}`}
        className={`w-64 ${field}`}
        disabled={busy}
      />
      <select
        value={fund.group}
        onChange={(e) => void onPatch(fund.id, { group: e.target.value }, `Moved ${fund.name}.`)}
        aria-label={`Group for ${fund.name}`}
        className={field}
        disabled={busy}
      >
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <button
        className={button}
        disabled={busy || !renamed}
        onClick={() => void onPatch(fund.id, { name: name.trim() }, `Renamed to ${name.trim()}.`)}
      >
        Rename
      </button>
      {fund.archivedFrom ? (
        <button
          className={button}
          disabled={busy}
          onClick={() => void onPatch(fund.id, { archivedFrom: null }, `${fund.name} is back.`)}
        >
          Un-archive (was {shortMonth(fund.archivedFrom)})
        </button>
      ) : (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void onPatch(
              fund.id,
              { archivedFrom: monthKey },
              `${fund.name} archived from ${shortMonth(monthKey)}.`,
            )
          }
        >
          Archive from {shortMonth(monthKey)}
        </button>
      )}
    </li>
  );
}
