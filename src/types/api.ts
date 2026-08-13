/**
 * Response shapes for the dashboard API routes.
 *
 * These are derived from the query functions rather than written out by hand.
 * The previous version restated every field, which meant a change to a query's
 * return shape left the client types silently stale until something broke at
 * runtime. Deriving them makes that a compile error instead.
 *
 * Each type mirrors exactly what its route passes to `NextResponse.json`.
 */

import type {
  getAvailableMonths,
  getBudgetAccuracy,
  getBudgetByBucket,
  getCashFlowForecast,
  getCashFlowTrends,
  getCategorySpotlight,
  getCategoryTrend,
  getChronicOverspenders,
  getCurrentMonthSummary,
  getDailySpending,
  getDebtMetric,
  getInvestmentsMetric,
  getLastSync,
  getLatestInsight,
  getMonthlySpendingTrend,
  getNetWorth,
  getSavingsMetric,
  getSavingsRateTrend,
  getTopExpenseCategories,
  getTopPayees,
  getTrendCategories,
} from "@/lib/queries";

/**
 * What a value becomes once it has been through `NextResponse.json`.
 *
 * Deriving straight from a query's return type would be wrong: the client
 * never sees a `Date`, it sees the ISO string `JSON.stringify` produced. This
 * is what the hand-written types got right and a naive derivation gets wrong.
 */
type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

/** A query function's return type as the client receives it. */
type Returns<T extends (...args: never[]) => unknown> = Serialized<
  Awaited<ReturnType<T>>
>;

/** One entry of an array-returning query. */
type Element<T> = T extends readonly (infer U)[] ? U : never;

export type PayeeEntry = Element<Returns<typeof getTopPayees>>;
export type SavingsRatePoint = Element<Returns<typeof getSavingsRateTrend>>;
export type TrendPoint = Element<Returns<typeof getCategoryTrend>>;
export type CategoryOption = Element<Returns<typeof getTrendCategories>>;
export type AccuracyCategory = Element<Returns<typeof getBudgetAccuracy>>;

export interface DashboardResponse {
  monthKey: string;
  dailySpending: Returns<typeof getDailySpending>;
  topPayees: Returns<typeof getTopPayees>;
  lastSync: Returns<typeof getLastSync>;
  availableMonths: Returns<typeof getAvailableMonths>;
  insight: Returns<typeof getLatestInsight>;
  cashFlowTrends: Returns<typeof getCashFlowTrends>;
  topExpenseCategories: Returns<typeof getTopExpenseCategories>;
  categorySpotlights: Returns<typeof getCategorySpotlight>;
  savingsMetric: Returns<typeof getSavingsMetric>;
  debtMetric: Returns<typeof getDebtMetric>;
  investmentsMetric: Returns<typeof getInvestmentsMetric>;
}

export interface BudgetResponse {
  summary: Returns<typeof getCurrentMonthSummary>;
  buckets: Returns<typeof getBudgetByBucket>;
  netWorth: Returns<typeof getNetWorth>;
  availableMonths: Returns<typeof getAvailableMonths>;
}

export interface AnalyticsResponse {
  budgetAccuracy: Returns<typeof getBudgetAccuracy>;
  topPayees: Returns<typeof getTopPayees>;
  savingsRateTrend: Returns<typeof getSavingsRateTrend>;
  cashFlowForecast: Returns<typeof getCashFlowForecast>;
  availableMonths: Returns<typeof getAvailableMonths>;
  monthKey: string;
}

export interface TrendsResponse {
  trend: Returns<typeof getMonthlySpendingTrend>;
  chronicOverspenders: Returns<typeof getChronicOverspenders>;
  categories: Returns<typeof getTrendCategories>;
  savingsRateTrend: Returns<typeof getSavingsRateTrend>;
}
