/**
 * Reading and writing savings funds.
 *
 * The rules — what a valid fund is, how a typed amount becomes cents, which
 * figure a month with no entry shows — live in `savingsFundShape.cjs`, which
 * is pure and shared with the import script and the admin form. This file is
 * only the Prisma half.
 *
 * Figures are typed in by hand, except for the one group the sync fills from
 * Actual account balances (`SYNCED_FUND_GROUP`, see `fundsFromActual.cjs`).
 * Nothing here feeds net worth or is compared against a real account balance.
 */

import { prisma } from "./prisma";
import {
  isFundVisibleIn,
  resolveBalance,
  monthsEndingAt,
  groupsInOrder,
} from "./savingsFundShape.cjs";
import { getPreviousMonthKey } from "./timezone";
import { SYNCED_FUND_GROUP } from "./constants";

/**
 * How many month-ends the dashboard's sparkline covers.
 *
 * A year, so the shape of a fund's year is the thing being shown: the tax
 * fund's saw, a fund draining steadily. Shorter would make a single large
 * movement fill the whole line.
 */
export const SPARKLINE_MONTHS = 12;

/**
 * How long a fund has to sit at zero before the dashboard stops listing it.
 *
 * Six months. Short enough that funds set up and never funded drop off, long
 * enough that a fund drained on purpose — a tax fund paid out, a holiday fund
 * spent — is still on the page through the months you would be asking what
 * happened to it.
 */
export const DORMANT_MONTHS = 6;

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
   * True when the sync fills this fund from the Actual account of the same
   * name. A figure typed into the grid for it lasts only until the next sync.
   */
  synced: boolean;
  /**
   * Change against the previous month's figure, in cents, or null when there
   * is nothing to compare against.
   *
   * Null rather than zero for a first month deliberately: a fund that has
   * just appeared has not "held steady", and +$0 would say it had.
   */
  change: number | null;
  /**
   * Zero now, and nothing but zero for `DORMANT_MONTHS`.
   *
   * A fund that exists and is not being used: opened and never funded, or
   * emptied long enough ago that nobody is still wondering where it went. The
   * dashboard leaves these out of its list and says how many it left out; the
   * admin grid shows them regardless, since a dormant fund is exactly the one
   * you need a box for when it starts being used again.
   *
   * Archiving is the other tool and means something different — a fund that
   * is finished. A dormant fund is expected back.
   */
  dormant: boolean;
  /**
   * The last `SPARKLINE_MONTHS` month-ends, oldest first, carried forward the
   * same way the headline figure is.
   *
   * A month before this fund's first entry is null rather than zero, so the
   * line starts where the fund's history does instead of climbing out of a
   * floor that was never recorded.
   */
  history: (number | null)[];
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
  const window: string[] = monthsEndingAt(monthKey, SPARKLINE_MONTHS);
  // The dormancy window is the tail of the sparkline's, so one resolution
  // pass serves both. Clamped because both lengths are exported constants: a
  // sparkline shortened below the dormancy window would otherwise take
  // slice() past the start, quietly deciding dormancy on fewer months than
  // DORMANT_MONTHS claims.
  const dormantFrom = Math.max(0, window.length - DORMANT_MONTHS);

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
        const balancesFor = byFund.get(fund.id) ?? [];
        const now = resolveBalance(balancesFor, monthKey);
        const before = resolveBalance(balancesFor, previous);

        const history = window.map((month) => {
          const at = resolveBalance(balancesFor, month);
          return at ? at.balance : null;
        });

        return {
          ...fund,
          // Resolved per month rather than read off the rows, so a fund with
          // one figure in January and one in September draws eleven months of
          // line rather than two points pretending to be neighbours.
          history,
          // Every month in the window has to be a recorded zero, not merely
          // "not a figure". Accepting nulls made the six months meaningless
          // for a new fund: entering $0.00 for a fund created this month left
          // five nulls and one zero, which counted as dormant, and the fund
          // vanished from the dashboard the moment it was saved — which reads
          // as the entry not having saved at all.
          //
          // A carried zero counts, since resolveBalance fills the window
          // forward: a fund that went to zero in January is still recorded at
          // zero in June.
          dormant:
            now !== null &&
            now.balance === 0 &&
            history.slice(dormantFrom).every((value) => value === 0),
          balance: now ? now.balance : null,
          asOf: now ? now.asOf : null,
          carried: now ? now.carried : false,
          entered: now ? now.asOf === monthKey : false,
          synced: SYNCED_FUND_GROUP !== null && fund.group === SYNCED_FUND_GROUP,
          // No change is claimed for a carried figure. Both months resolve to
          // the same old entry, so the subtraction is a June figure minus
          // itself: it would render as "+$0" beside "as of Jun", which says
          // the fund held steady when what actually happened is that nobody
          // looked. The marker explains the absence; a zero would contradict
          // it.
          change:
            now && before && !now.carried ? now.balance - before.balance : null,
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
