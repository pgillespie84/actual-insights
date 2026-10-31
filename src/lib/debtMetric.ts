import type { BalanceMetric } from "./queries";

/**
 * Turns the raw balance metric for the debt accounts into the debt card's
 * figures.
 *
 * Debt balances are negative (liabilities) and the delta is end minus start,
 * so a raw delta of +1000 means the balance went from e.g. -10000 to -9000:
 * $1000 paid down. That is already the sign the cards want (positive = paid
 * down, negative = new debt), so the deltas pass through unchanged. Negating
 * them here once showed every paydown as debt added. The balance is reported
 * as the amount owed, matching how getNetWorth sums totalDebt.
 */
export function toDebtMetric(raw: BalanceMetric): BalanceMetric {
  return {
    ...raw,
    balance: raw.balance === null ? null : Math.abs(raw.balance),
  };
}
