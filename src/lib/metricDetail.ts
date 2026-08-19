import { formatDollars, formatSignedDollars } from "./format";
import type { Tone } from "./tone";

/**
 * What the sub-line under a metric's headline number should say.
 *
 * This lives apart from the component because it is where the honesty rules
 * are: an unknown movement must not read as "+$0 this month", a config
 * mismatch must not read as missing history, and a movement covering only some
 * of a group must say so. Those rules were the user-visible half of a bug that
 * unit tests on the query layer could not see, so they are stated here where
 * they can be tested directly.
 */
export interface MetricDetailInput {
  /** Null when no account in the group had usable snapshots. */
  monthDelta: number | null;
  /** True when some but not all accounts in the group had usable snapshots. */
  partial: boolean;
  /** False when the configured account names matched nothing in the database. */
  hasAccounts: boolean;
}

export interface MetricDetail {
  text: string;
  tone: Tone;
}

const NO_ACCOUNTS: MetricDetail = {
  text: "No matching accounts",
  tone: "neutral",
};

const NO_HISTORY: MetricDetail = {
  text: "No balance history",
  tone: "neutral",
};

/**
 * The group is covered only in part and there is no movement figure to qualify,
 * so the card has to say so on its own.
 *
 * Deliberately "coverage" rather than "history": the cause may be a missing
 * snapshot or a configured account name that matches nothing, and naming the
 * wrong one sends the reader after the wrong fix.
 */
const PARTIAL_ONLY: MetricDetail = {
  text: "Partial coverage",
  tone: "neutral",
};

/** Appended when the number is real but does not cover the whole group. */
function qualify(text: string, partial: boolean): string {
  return partial ? `${text} · partial coverage` : text;
}

function unavailable({
  monthDelta,
  partial,
  hasAccounts,
}: MetricDetailInput): MetricDetail | null {
  // Checked before the delta: a group whose names match nothing sends the
  // reader after a backfill when the real fix is a name in the config.
  if (!hasAccounts) return NO_ACCOUNTS;
  if (monthDelta === null) return partial ? PARTIAL_ONLY : NO_HISTORY;
  return null;
}

export function savingsDetail(input: MetricDetailInput): MetricDetail {
  const blocked = unavailable(input);
  if (blocked) return blocked;

  const delta = input.monthDelta as number;
  return {
    text: qualify(`${formatSignedDollars(delta)} this month`, input.partial),
    tone: delta >= 0 ? "positive" : "negative",
  };
}

export function debtDetail(input: MetricDetailInput): MetricDetail {
  const blocked = unavailable(input);
  if (blocked) return blocked;

  // A positive delta means the balance owed fell, which is the good direction.
  const delta = input.monthDelta as number;
  const paidDown = delta >= 0;
  return {
    text: qualify(
      `${formatDollars(Math.abs(delta))} ${paidDown ? "paid down" : "added"}`,
      input.partial,
    ),
    tone: paidDown ? "positive" : "negative",
  };
}
