import { prisma } from "./prisma";

/**
 * Forward-filled balance for every requested account at one boundary, in a
 * single round trip.
 *
 * `DISTINCT ON` keeps the first row per accountId under the given ORDER BY,
 * which with `date DESC` is the latest snapshot at or before the boundary.
 * Accounts with no snapshot simply do not appear in the result.
 */
async function balancesOnOrBefore(
  accountIds: string[],
  date: Date
): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ accountId: string; balance: bigint | number }>>`
    SELECT DISTINCT ON ("accountId") "accountId", balance
    FROM "AccountBalanceSnapshot"
    WHERE "accountId" = ANY(${accountIds}) AND date <= ${date}
    ORDER BY "accountId", date DESC
  `;

  return new Map(rows.map((r) => [r.accountId, Number(r.balance)]));
}

/**
 * A total, plus how much of the requested group it actually covers.
 *
 * The counts are the point. A total alone cannot distinguish "nothing moved"
 * from "no history to compare", nor "the group moved $120" from "one of five
 * accounts moved $120 and the rest are unknown". Callers decide how to present
 * each case; this module refuses to guess by folding them together.
 */
export interface BalanceCoverage {
  /** Sum across the accounts with usable snapshots. Meaningless if known is 0. */
  total: number;
  /** How many of the requested accounts had the snapshots needed. */
  known: number;
  /** How many accounts were asked about. */
  requested: number;
}

/**
 * Sum of (endBalance - startBalance) across the given accounts, in cents, with
 * coverage.
 *
 * An account missing a snapshot at either boundary contributes nothing and is
 * excluded from `known`. Treating a missing snapshot as a zero balance instead
 * would report the entire opposite boundary as a swing, and an account that did
 * not exist yet in the period genuinely has no movement to report.
 */
export function sumBalanceDeltas(
  accountIds: string[],
  startBalances: Map<string, number>,
  endBalances: Map<string, number>
): BalanceCoverage {
  let total = 0;
  let known = 0;
  for (const accountId of accountIds) {
    const start = startBalances.get(accountId);
    const end = endBalances.get(accountId);
    if (start === undefined || end === undefined) continue;
    total += end - start;
    known += 1;
  }
  return { total, known, requested: accountIds.length };
}

/**
 * Total balance across the given accounts, in cents, with coverage.
 *
 * Missing accounts are skipped rather than counted as zero, matching
 * `sumBalanceDeltas`, so an account that did not exist yet in the month being
 * viewed does not drag the total down.
 */
export function sumBalances(
  accountIds: string[],
  balances: Map<string, number>
): BalanceCoverage {
  let total = 0;
  let known = 0;
  for (const accountId of accountIds) {
    const balance = balances.get(accountId);
    if (balance === undefined) continue;
    total += balance;
    known += 1;
  }
  return { total, known, requested: accountIds.length };
}

/**
 * Total balance across the given accounts at a point in time, forward-filled
 * from the last snapshot on or before that date.
 *
 * One query, same `DISTINCT ON` shape `getBalanceDelta` uses for each of its
 * two boundaries.
 */
export async function getBalanceAt(
  accountIds: string[],
  date: Date
): Promise<BalanceCoverage> {
  const balances = await balancesOnOrBefore(accountIds, date);
  return sumBalances(accountIds, balances);
}

/**
 * Two queries regardless of account count. This previously ran two queries per
 * account, which cost roughly 240 round trips per dashboard load.
 */
export async function getBalanceDelta(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<BalanceCoverage> {
  const [startBalances, endBalances] = await Promise.all([
    balancesOnOrBefore(accountIds, startDate),
    balancesOnOrBefore(accountIds, endDate),
  ]);

  return sumBalanceDeltas(accountIds, startBalances, endBalances);
}
