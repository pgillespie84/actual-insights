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
 * Sum of (endBalance - startBalance) across the given accounts, in cents.
 *
 * An account missing a snapshot at either boundary contributes 0. Treating a
 * missing snapshot as a zero balance instead would report the entire opposite
 * boundary as a swing.
 */
export function sumBalanceDeltas(
  accountIds: string[],
  startBalances: Map<string, number>,
  endBalances: Map<string, number>
): number {
  let total = 0;
  for (const accountId of accountIds) {
    const start = startBalances.get(accountId);
    const end = endBalances.get(accountId);
    if (start === undefined || end === undefined) continue;
    total += end - start;
  }
  return total;
}

/**
 * Two queries regardless of account count. This previously ran two queries per
 * account, which cost roughly 240 round trips per dashboard load.
 */
export async function getBalanceDelta(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<number> {
  const [startBalances, endBalances] = await Promise.all([
    balancesOnOrBefore(accountIds, startDate),
    balancesOnOrBefore(accountIds, endDate),
  ]);

  return sumBalanceDeltas(accountIds, startBalances, endBalances);
}
