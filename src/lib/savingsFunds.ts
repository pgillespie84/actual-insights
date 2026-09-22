/**
 * Reading and writing savings funds.
 *
 * The rules — what a valid fund is, how a typed amount becomes cents, which
 * figure a month with no entry shows — live in `savingsFundShape.cjs`, which
 * is pure and shared with the import script and the admin form. This file is
 * only the Prisma half.
 *
 * Every figure here was typed in by hand. Nothing in this file is derived
 * from Actual, feeds net worth, or is compared against a real account
 * balance.
 */

import { prisma } from "./prisma";
import {
  isFundVisibleIn,
  resolveBalance,
  groupsInOrder,
} from "./savingsFundShape.cjs";
import { getPreviousMonthKey } from "./timezone";

export interface SavingsFundRecord {
  id: string;
  name: string;
  group: string;
  archivedFrom: string | null;
}

/** One fund as the entry grid and the dashboard widget see it. */
export interface FundRow extends SavingsFundRecord {
  /** Cents, or null when no figure has ever been recorded at or before the month. */
  balance: number | null;
  /** The month the shown figure was actually recorded for. Null with no balance. */
  asOf: string | null;
  /** True when the figure comes from an earlier month than the one being viewed. */
  carried: boolean;
  /** True when a row exists for this exact month — what the grid overwrites. */
  entered: boolean;
  /**
   * Change against the previous month's figure, in cents, or null when there
   * is nothing to compare against.
   *
   * Null rather than zero for a first month deliberately: a fund that has
   * just appeared has not "held steady", and +$0 would say it had.
   */
  change: number | null;
}

export interface FundGroup {
  group: string;
  funds: FundRow[];
  /**
   * The group's total, in cents, counting every fund with a known balance —
   * carried figures included, since a fund nobody checked still holds money.
   */
  total: number;
  /** How many of the group's funds are showing a carried figure. */
  carriedCount: number;
}

/**
 * Every fund, oldest first. Creation order is what fixes the group order.
 *
 * `id` breaks a tie, so the answer is at least the same answer twice. It is a
 * backstop and not the mechanism: ids are random, so a tie resolves to an
 * arbitrary order rather than the sheet's. What actually keeps the sheet's
 * order is the import writing an explicit, increasing createdAt per row —
 * see `scripts/import-fund-history.cjs`. A fund added from the admin page
 * gets the column default and lands last, which is where a new fund belongs.
 */
export async function listFunds(): Promise<SavingsFundRecord[]> {
  const funds = await prisma.savingsFund.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return funds.map((f) => ({
    id: f.id,
    name: f.name,
    group: f.group,
    archivedFrom: f.archivedFrom,
  }));
}

/**
 * The funds as they stood at the end of `monthKey`, grouped and totalled.
 *
 * One query for the funds and one for the balances, rather than a per-fund
 * query or a join: nineteen funds with a few years of history is a few
 * hundred rows, and reading them whole is cheaper than the round trips.
 * Balances after the month are excluded in SQL so viewing March does not pull
 * September's figures across the wire to throw them away.
 */
export async function getFundGroups(monthKey: string): Promise<FundGroup[]> {
  const previous = getPreviousMonthKey(monthKey);

  const [funds, balances] = await Promise.all([
    listFunds(),
    prisma.savingsFundBalance.findMany({
      where: { monthKey: { lte: monthKey } },
      select: { fundId: true, monthKey: true, balance: true },
    }),
  ]);

  const byFund = new Map<string, { monthKey: string; balance: number }[]>();
  for (const row of balances) {
    const rows = byFund.get(row.fundId);
    if (rows) rows.push(row);
    else byFund.set(row.fundId, [row]);
  }

  const visible = funds.filter((f) => isFundVisibleIn(f, monthKey));
  const groups = groupsInOrder(visible) as string[];

  return groups.map((group) => {
    const rows: FundRow[] = visible
      .filter((f) => f.group === group)
      .map((fund) => {
        const history = byFund.get(fund.id) ?? [];
        const now = resolveBalance(history, monthKey);
        // Resolved the same way, so a fund whose September figure is carried
        // from June compares against June rather than against nothing — the
        // change then reads as 0, which is the truth about the recorded
        // figures even when it is not the truth about the money.
        const before = resolveBalance(history, previous);

        return {
          ...fund,
          balance: now ? now.balance : null,
          asOf: now ? now.asOf : null,
          carried: now ? now.carried : false,
          entered: now ? now.asOf === monthKey : false,
          change: now && before ? now.balance - before.balance : null,
        };
      })
      // Largest balance first, within the group. A fund with no figure at all
      // sorts last rather than as zero: it is unknown, not empty.
      //
      // The null pair is branched on rather than folded into the subtraction.
      // Two -Infinity sentinels subtract to NaN, which the language forgives —
      // it coerces a NaN comparison to "equal" and sort has been stable since
      // ES2019, so the order held. It held by accident, through a rule nobody
      // reading the line would think to check, in the ordinary case of any
      // month at or before the first figure anyone recorded. Saying what
      // should happen to two unknowns costs three lines.
      .sort((a, b) => {
        if (a.balance === null && b.balance === null) return 0;
        if (a.balance === null) return 1;
        if (b.balance === null) return -1;
        return b.balance - a.balance;
      });

    return {
      group,
      funds: rows,
      total: rows.reduce((sum, f) => sum + (f.balance ?? 0), 0),
      carriedCount: rows.filter((f) => f.carried).length,
    };
  });
}

/**
 * Writes one month's entries.
 *
 * A `null` balance deletes that fund's row for the month, which is how a
 * mistyped entry is taken back: the fund then carries forward again rather
 * than being stuck at a figure nobody meant. Entries the form did not send
 * are left alone — that is what makes a skipped fund stay honestly carried
 * instead of quietly becoming a confirmed figure for this month.
 */
export async function saveBalances(
  monthKey: string,
  entries: { fundId: string; balance: number | null }[],
): Promise<{ written: number; cleared: number }> {
  const writes = entries.filter((e) => e.balance !== null);
  const clears = entries.filter((e) => e.balance === null).map((e) => e.fundId);

  await prisma.$transaction([
    ...writes.map((e) =>
      prisma.savingsFundBalance.upsert({
        where: { fundId_monthKey: { fundId: e.fundId, monthKey } },
        create: { fundId: e.fundId, monthKey, balance: e.balance as number },
        update: { balance: e.balance as number },
      }),
    ),
    prisma.savingsFundBalance.deleteMany({
      where: { monthKey, fundId: { in: clears } },
    }),
  ]);

  return { written: writes.length, cleared: clears.length };
}
