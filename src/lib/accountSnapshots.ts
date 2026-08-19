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
 * Sum of (endBalance - startBalance) across the given accounts, in cents, or
 * null when not one account has a snapshot at both boundaries.
 *
 * An account missing a snapshot at either boundary contributes nothing.
 * Treating a missing snapshot as a zero balance instead would report the
 * entire opposite boundary as a swing.
 *
 * Null and zero are kept apart for the same reason `sumBalances` keeps them
 * apart: a month whose history was never backfilled has an unknown movement,
 * and reporting it as "no change" is a confident wrong number.
 */
export function sumBalanceDeltas(
  accountIds: string[],
  startBalances: Map<string, number>,
  endBalances: Map<string, number>
): number | null {
  let total = 0;
  let known = 0;
  for (const accountId of accountIds) {
    const start = startBalances.get(accountId);
    const end = endBalances.get(accountId);
    if (start === undefined || end === undefined) continue;
    total += end - start;
    known += 1;
  }
  return known === 0 ? null : total;
}

/**
 * Total balance across the given accounts, in cents, or null when not one of
 * them has a snapshot.
 *
 * Missing accounts are skipped rather than counted as zero, which matches
 * `sumBalanceDeltas` and means an account that did not exist yet in the month
 * being viewed does not drag the total down. Null and zero are kept apart on
 * purpose: the card renders null as an em dash, and rendering it as $0.00
 * would be a confident wrong number on a month whose history was never
 * backfilled.
 */
export function sumBalances(
  accountIds: string[],
  balances: Map<string, number>
): number | null {
  let total = 0;
  let known = 0;
  for (const accountId of accountIds) {
    const balance = balances.get(accountId);
    if (balance === undefined) continue;
    total += balance;
    known += 1;
  }
  return known === 0 ? null : total;
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
): Promise<number | null> {
  if (accountIds.length === 0) return null;

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
): Promise<number | null> {
  const [startBalances, endBalances] = await Promise.all([
    balancesOnOrBefore(accountIds, startDate),
    balancesOnOrBefore(accountIds, endDate),
  ]);

  return sumBalanceDeltas(accountIds, startBalances, endBalances);
}
