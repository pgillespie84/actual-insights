import { prisma } from "./prisma";

/**
 * Returns the balance (in cents) of the account as of the most recent
 * snapshot whose date is on or before `date` (forward-fill). Returns null
 * if no such snapshot exists.
 */
export async function getSnapshotOnOrBefore(
  accountId: string,
  date: Date
): Promise<number | null> {
  const row = await prisma.accountBalanceSnapshot.findFirst({
    where: { accountId, date: { lte: date } },
    orderBy: { date: "desc" },
    select: { balance: true },
  });
  return row ? row.balance : null;
}

/**
 * Sum of (endBalance - startBalance) across the given accounts, in cents.
 * Missing snapshots (no data at/before a boundary for an account) contribute
 * 0 to the delta for that account.
 */
export async function getBalanceDelta(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<number> {
  let total = 0;
  for (const accountId of accountIds) {
    const [start, end] = await Promise.all([
      getSnapshotOnOrBefore(accountId, startDate),
      getSnapshotOnOrBefore(accountId, endDate),
    ]);
    if (start === null || end === null) continue;
    total += end - start;
  }
  return total;
}
