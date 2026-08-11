// Shared sub-types

export interface PayeeEntry {
  payee: string;
  amount: number;
}

export interface SavingsRatePoint {
  month: string;
  label: string;
  income: number;
  spending: number;
  savingsRate: number;
}

export interface TrendPoint {
  month: string;
  label: string;
  spent: number;
  budgeted: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  groupName: string | null;
}

export interface AccuracyCategory {
  id: string;
  name: string;
  groupName: string | null;
  budgeted: number;
  spent: number;
  deviation: number;
  accurate: boolean;
}

// Dashboard

export interface DashboardResponse {
  monthKey: string;
  dailySpending: {
    currentMonth: Array<{ day: number; cumulative: number }>;
    previousMonth: Array<{ day: number; cumulative: number }>;
    currentLabel: string;
    previousLabel: string;
  };
  topPayees: PayeeEntry[];
  cashFlowTrends: Array<{
    month: string;
    label: string;
    income: number;
    expenses: number;
  }>;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  categorySpotlights: Array<{
    name: string;
    budgeted: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  }>;
  savingsMetric: { monthDelta: number; ytdDelta: number };
  debtMetric: { monthDelta: number; ytdDelta: number };
  investmentsMetric: {
    monthDelta: number;
    ytdDelta: number;
    contributions: number;
    growth: number;
    trackingSince: string | null;
  };
  lastSync: { syncedAt: string; status: string } | null;
  availableMonths: string[];
  insight: { content: string; createdAt: string } | null;
}

// Budget

export interface BudgetResponse {
  summary: {
    monthKey: string;
    totalBudgeted: number;
    totalSpent: number;
    totalRemaining: number;
    percentUsed: number;
    categories: Array<{
      id: string;
      name: string;
      groupName: string | null;
      budgeted: number;
      spent: number;
      remaining: number;
      percentUsed: number;
    }>;
  };
  buckets: Array<{
    name: string;
    totalBudgeted: number;
    totalSpent: number;
    remaining: number;
    percentUsed: number;
    groups: Array<{
      name: string;
      budgeted: number;
      spent: number;
      categories: Array<{
        name: string;
        budgeted: number;
        spent: number;
        isBusiness: boolean;
      }>;
    }>;
  }>;
  netWorth: {
    totalNetWorth: number;
    totalAssets: number;
    totalDebt: number;
    groups: Array<{
      name: string;
      total: number;
      accounts: Array<{ name: string; balance: number }>;
      isDebt: boolean;
    }>;
  };
  availableMonths: string[];
}

// Analytics

export interface AnalyticsResponse {
  budgetAccuracy: {
    accurateCount: number;
    totalCount: number;
    accuracyPercent: number;
    categories: AccuracyCategory[];
  };
  topPayees: PayeeEntry[];
  savingsRateTrend: SavingsRatePoint[];
  cashFlowForecast: Array<{
    month: string;
    label: string;
    spent: number;
    projected: boolean;
  }>;
  availableMonths: string[];
  monthKey: string;
}

// Trends

export interface TrendsResponse {
  trend: TrendPoint[];
  chronicOverspenders: Array<{
    id: string;
    name: string;
    groupName: string | null;
    overMonths: number;
    totalOver: number;
    totalMonths: number;
    frequency: string;
  }>;
  categories: CategoryOption[];
  savingsRateTrend: SavingsRatePoint[];
}
