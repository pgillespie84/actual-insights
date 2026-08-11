import { test, expect } from "vitest";
import type {
  DashboardResponse,
  BudgetResponse,
  AnalyticsResponse,
  TrendsResponse,
} from "./api";

// Force module resolution — type-only imports are erased at runtime
const apiModule = await import("./api");
test("api types module is importable", () => {
  expect(apiModule).toBeDefined();
});

test("DashboardResponse shape has all required keys", () => {
  const stub: DashboardResponse = {
    monthKey: "2026-01",
    dailySpending: {
      currentMonth: [{ day: 1, cumulative: 100 }],
      previousMonth: [{ day: 1, cumulative: 90 }],
      currentLabel: "Jan 2026",
      previousLabel: "Dec 2025",
    },
    topPayees: [{ payee: "Store", amount: 500 }],
    cashFlowTrends: [{ month: "2026-01", label: "Jan 2026", income: 5000, expenses: 3000 }],
    topExpenseCategories: [{ name: "Food", amount: 800 }],
    categorySpotlights: [{ name: "Food", budgeted: 1000, spent: 800, remaining: 200, percentUsed: 80 }],
    savingsMetric: { monthDelta: 500, ytdDelta: 3000 },
    debtMetric: { monthDelta: -200, ytdDelta: -1000 },
    investmentsMetric: { monthDelta: 100, ytdDelta: 600, contributions: 400, growth: 200, trackingSince: "2025-01" },
    lastSync: { syncedAt: "2026-01-15T10:00:00Z", status: "success" },
    availableMonths: ["2026-01", "2025-12"],
    insight: { content: "Good month", createdAt: "2026-01-15T10:00:00Z" },
  };
  expect(stub.monthKey).toBeDefined();
  expect(stub.availableMonths).toBeInstanceOf(Array);
});

test("BudgetResponse shape has all required keys", () => {
  const stub: BudgetResponse = {
    summary: {
      monthKey: "2026-01",
      totalBudgeted: 5000,
      totalSpent: 3000,
      totalRemaining: 2000,
      percentUsed: 60,
      categories: [{
        id: "cat1",
        name: "Food",
        groupName: "Flexible",
        budgeted: 1000,
        spent: 800,
        remaining: 200,
        percentUsed: 80,
      }],
    },
    buckets: [{
      name: "Fixed",
      totalBudgeted: 2000,
      totalSpent: 1800,
      remaining: 200,
      percentUsed: 90,
      groups: [{
        name: "Housing",
        budgeted: 1500,
        spent: 1500,
        categories: [{ name: "Rent", budgeted: 1500, spent: 1500, isBusiness: false }],
      }],
    }],
    netWorth: {
      totalNetWorth: 100000,
      totalAssets: 150000,
      totalDebt: 50000,
      groups: [{
        name: "Savings",
        total: 20000,
        accounts: [{ name: "General Savings", balance: 20000 }],
        isDebt: false,
      }],
    },
    availableMonths: ["2026-01"],
  };
  expect(stub.summary.monthKey).toBeDefined();
  expect(stub.buckets).toBeInstanceOf(Array);
});

test("AnalyticsResponse shape has all required keys", () => {
  const stub: AnalyticsResponse = {
    budgetAccuracy: {
      accurateCount: 5,
      totalCount: 10,
      accuracyPercent: 50,
      categories: [{
        id: "cat1",
        name: "Food",
        groupName: "Flexible",
        budgeted: 1000,
        spent: 800,
        deviation: 200,
        accurate: true,
      }],
    },
    topPayees: [{ payee: "Store", amount: 500 }],
    savingsRateTrend: [{ month: "2026-01", label: "Jan", income: 5000, spending: 3000, savingsRate: 40 }],
    cashFlowForecast: [{ month: "2026-01", label: "Jan", spent: 3000, projected: false }],
    availableMonths: ["2026-01"],
    monthKey: "2026-01",
  };
  expect(stub.monthKey).toBeDefined();
  expect(stub.budgetAccuracy.categories).toBeInstanceOf(Array);
});

test("TrendsResponse shape has all required keys", () => {
  const stub: TrendsResponse = {
    trend: [{ month: "2026-01", label: "Jan", spent: 3000, budgeted: 4000 }],
    chronicOverspenders: [{
      id: "cat1",
      name: "Food",
      groupName: "Flexible",
      overMonths: 3,
      totalOver: 500,
      totalMonths: 6,
      frequency: "50%",
    }],
    categories: [{ id: "cat1", name: "Food", groupName: "Flexible" }],
    savingsRateTrend: [{ month: "2026-01", label: "Jan", income: 5000, spending: 3000, savingsRate: 40 }],
  };
  expect(stub.trend).toBeInstanceOf(Array);
  expect(stub.chronicOverspenders).toBeInstanceOf(Array);
});
