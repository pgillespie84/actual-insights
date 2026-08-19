import { prisma } from "./prisma";
import { BUDGET_BUCKETS, BUSINESS_CATEGORIES, NET_WORTH_GROUPS, EXCLUDED_ACCOUNTS, getSavingsAccountNames, getPayableDebtAccountNames, getInvestmentAccountNames } from "./constants";
import { getBalanceAt, getBalanceDelta } from "./accountSnapshots";
import { startOfYear, parse } from "date-fns";
import { getSpotlightCategories } from "./spotlightConfig";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { getCurrentMonthKeyET, getCurrentDayET } from "./timezone";
import { generateMonthRange, expenseCategoryFilter, mapWithConcurrency, MONTH_QUERY_CONCURRENCY, type MonthEntry } from "./query-utils";

const catFilter = expenseCategoryFilter();

/** One month loop, with a bounded number of months in flight. */
function mapMonths<T>(
  range: MonthEntry[],
  fn: (entry: MonthEntry) => Promise<T>,
): Promise<T[]> {
  return mapWithConcurrency(range, MONTH_QUERY_CONCURRENCY, fn);
}

export async function getCurrentMonthSummary(monthDate: Date) {
  const { start, end, monthKey } = generateMonthRange(1, monthDate)[0];

  const [spending, budgets] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        date: { gte: start, lte: end },
        category: catFilter,
      },
      _sum: { amount: true },
    }),
    prisma.categoryBudget.findMany({
      where: {
        month: monthKey,
        category: catFilter,
      },
      include: { category: true },
    }),
  ]);

  const spendingMap = new Map(
    spending.map((s) => [s.categoryId, Math.abs(s._sum.amount || 0)])
  );

  const categories = budgets.map((b) => {
    const spent = spendingMap.get(b.categoryId) || 0;
    return {
      id: b.categoryId,
      name: b.category.name,
      groupName: b.category.groupName,
      budgeted: b.budgetedAmount,
      spent,
      remaining: b.budgetedAmount - spent,
      percentUsed: b.budgetedAmount > 0 ? (spent / b.budgetedAmount) * 100 : 0,
    };
  });

  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);

  return {
    monthKey,
    totalBudgeted,
    totalSpent,
    totalRemaining: totalBudgeted - totalSpent,
    percentUsed: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
    categories: categories.sort((a, b) => b.percentUsed - a.percentUsed),
  };
}

export async function getMonthlySpendingTrend(months: number = 12) {
  const range = generateMonthRange(months);
  return mapMonths(
    range,
    async ({ monthKey, start, end }) => {
      const [spendingResult, budgetResult] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            date: { gte: start, lte: end },
            category: catFilter,
          },
          _sum: { amount: true },
        }),
        prisma.categoryBudget.aggregate({
          where: {
            month: monthKey,
            category: catFilter,
          },
          _sum: { budgetedAmount: true },
        }),
      ]);

      return {
        month: monthKey,
        label: format(start, "MMM yyyy"),
        spent: Math.abs(spendingResult._sum.amount || 0),
        budgeted: budgetResult._sum.budgetedAmount || 0,
      };
    },
  );
}

export async function getCategoryTrend(categoryId: string, months: number = 12) {
  const range = generateMonthRange(months);
  return mapMonths(
    range,
    async ({ monthKey, start, end }) => {
      const [spendingResult, budgetResult] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            date: { gte: start, lte: end },
            categoryId,
          },
          _sum: { amount: true },
        }),
        prisma.categoryBudget.findUnique({
          where: { categoryId_month: { categoryId, month: monthKey } },
        }),
      ]);

      return {
        month: monthKey,
        label: format(start, "MMM yyyy"),
        spent: Math.abs(spendingResult._sum.amount || 0),
        budgeted: budgetResult?.budgetedAmount || 0,
      };
    },
  );
}

export async function getChronicOverspenders(months: number = 6) {
  const range = generateMonthRange(months);
  const firstStart = range[0].start;
  const lastEnd = range[range.length - 1].end;
  const monthKeys = range.map((r) => r.monthKey);

  const [transactions, budgets] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: { gte: firstStart, lte: lastEnd },
        category: catFilter,
      },
      select: { categoryId: true, amount: true, date: true },
    }),
    prisma.categoryBudget.findMany({
      where: { month: { in: monthKeys }, category: catFilter },
      include: { category: true },
    }),
  ]);

  // Group spending by categoryId + month key
  const spendMap = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    const mk = format(tx.date, "yyyy-MM");
    const key = `${tx.categoryId}|${mk}`;
    spendMap.set(key, (spendMap.get(key) ?? 0) + Math.abs(tx.amount));
  }

  // Group budgets by category, track per-month budgeted amounts
  const catInfo = new Map<string, { name: string; groupName: string | null; months: Map<string, number> }>();
  for (const b of budgets) {
    let entry = catInfo.get(b.categoryId);
    if (!entry) {
      entry = { name: b.category.name, groupName: b.category.groupName, months: new Map() };
      catInfo.set(b.categoryId, entry);
    }
    entry.months.set(b.month, b.budgetedAmount);
  }

  const results: Array<{ id: string; name: string; groupName: string | null; overMonths: number; totalOver: number; totalMonths: number; frequency: string }> = [];

  for (const [catId, entry] of catInfo) {
    let overMonths = 0;
    let totalOver = 0;
    for (const [month, budgeted] of entry.months) {
      if (budgeted <= 0) continue;
      const spent = spendMap.get(`${catId}|${month}`) ?? 0;
      if (spent > budgeted) {
        overMonths++;
        totalOver += spent - budgeted;
      }
    }
    if (overMonths >= 2) {
      results.push({
        id: catId, name: entry.name, groupName: entry.groupName,
        overMonths, totalOver, totalMonths: entry.months.size,
        frequency: `${overMonths}/${entry.months.size} months`,
      });
    }
  }

  return results.sort((a, b) => b.overMonths - a.overMonths);
}

export async function getAvailableMonths(): Promise<string[]> {
  const budgets = await prisma.categoryBudget.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
  });
  const currentMonthKey = getCurrentMonthKeyET();
  return budgets.map((b) => b.month).filter((m) => m <= currentMonthKey);
}

export async function getLastSync() {
  return prisma.syncLog.findFirst({
    orderBy: { syncedAt: "desc" },
  });
}

export async function getTrendCategories() {
  return prisma.category.findMany({
    where: catFilter,
    orderBy: { name: "asc" },
    select: { id: true, name: true, groupName: true },
  });
}

export async function getSavingsRate(monthDate: Date) {
  const { start, end } = generateMonthRange(1, monthDate)[0];

  const [incomeResult, spendingResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        date: { gte: start, lte: end },
        category: { isIncome: true },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        date: { gte: start, lte: end },
        category: catFilter,
      },
      _sum: { amount: true },
    }),
  ]);

  const income = Math.abs(incomeResult._sum.amount || 0);
  const spending = Math.abs(spendingResult._sum.amount || 0);
  const savedAmount = income - spending;
  const savingsRate = income > 0 ? savedAmount / income : 0;

  return { income, spending, savingsRate, savedAmount };
}

export async function getSavingsRateTrend(months: number = 12) {
  const range = generateMonthRange(months);
  return mapMonths(
    range,
    async ({ monthDate, monthKey }) => {
      const { income, spending, savingsRate } = await getSavingsRate(monthDate);

      return {
        month: monthKey,
        label: format(monthDate, "MMM yyyy"),
        income,
        spending,
        savingsRate,
      };
    },
  );
}

export async function getTopPayees(monthDate: Date, limit: number = 15) {
  const { start, end } = generateMonthRange(1, monthDate)[0];

  const results = await prisma.transaction.groupBy({
    by: ["payee"],
    where: {
      date: { gte: start, lte: end },
      category: catFilter,
      payee: { not: null },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "asc" } },
    take: limit,
  });

  return results
    .filter((r) => r.payee)
    .map((r) => ({
      payee: r.payee!,
      amount: Math.abs(r._sum.amount || 0),
    }));
}

export async function getBudgetAccuracy(monthDate: Date) {
  const summary = await getCurrentMonthSummary(monthDate);
  const withBudget = summary.categories.filter((c) => c.budgeted > 0);

  const categories = withBudget.map((c) => {
    const deviation = Math.abs(c.spent - c.budgeted) / c.budgeted;
    return {
      id: c.id,
      name: c.name,
      groupName: c.groupName,
      budgeted: c.budgeted,
      spent: c.spent,
      deviation,
      accurate: deviation <= 0.1,
    };
  });

  const accurateCount = categories.filter((c) => c.accurate).length;

  return {
    accurateCount,
    totalCount: categories.length,
    accuracyPercent: categories.length > 0 ? (accurateCount / categories.length) * 100 : 0,
    categories: categories.sort((a, b) => a.deviation - b.deviation),
  };
}

export async function getCashFlowForecast(months: number = 6) {
  const range = generateMonthRange(months);
  const historical = await mapMonths(
    range,
    async ({ monthKey, start, end }) => {
      const spendingResult = await prisma.transaction.aggregate({
        where: {
          date: { gte: start, lte: end },
          category: catFilter,
        },
        _sum: { amount: true },
      });

      return {
        month: monthKey,
        label: format(start, "MMM yyyy"),
        spent: Math.abs(spendingResult._sum.amount || 0),
        projected: false,
      };
    },
  );

  const avgSpent = historical.reduce((sum, h) => sum + h.spent, 0) / historical.length;

  const now = new Date();
  const forecast = [];
  for (let i = 1; i <= 3; i++) {
    const futureDate = subMonths(now, -i);
    const monthKey = format(futureDate, "yyyy-MM");
    forecast.push({
      month: monthKey,
      label: format(futureDate, "MMM yyyy"),
      spent: Math.round(avgSpent),
      projected: true,
    });
  }

  return [...historical, ...forecast];
}

export async function getLatestInsight(monthKey?: string) {
  return prisma.dailyInsight.findFirst({
    where: monthKey ? { monthKey } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBudgetByBucket(monthDate: Date) {
  const summary = await getCurrentMonthSummary(monthDate);

  const bucketGroupMap = new Map<string, string>();
  for (const [bucket, groups] of Object.entries(BUDGET_BUCKETS)) {
    for (const group of groups) {
      bucketGroupMap.set(group, bucket);
    }
  }

  const buckets = new Map<string, {
    totalBudgeted: number;
    totalSpent: number;
    groups: Map<string, { budgeted: number; spent: number; categories: Array<{ name: string; budgeted: number; spent: number; isBusiness: boolean }> }>;
  }>();

  for (const bucketName of Object.keys(BUDGET_BUCKETS)) {
    buckets.set(bucketName, { totalBudgeted: 0, totalSpent: 0, groups: new Map() });
  }

  for (const cat of summary.categories) {
    const groupName = cat.groupName || "Uncategorized";
    const bucketName = bucketGroupMap.get(groupName) || "Discretionary";
    const bucket = buckets.get(bucketName)!;

    bucket.totalBudgeted += cat.budgeted;
    bucket.totalSpent += cat.spent;

    const group = bucket.groups.get(groupName) || { budgeted: 0, spent: 0, categories: [] };
    group.budgeted += cat.budgeted;
    group.spent += cat.spent;
    group.categories.push({
      name: cat.name,
      budgeted: cat.budgeted,
      spent: cat.spent,
      isBusiness: BUSINESS_CATEGORIES.includes(cat.name),
    });
    bucket.groups.set(groupName, group);
  }

  return Array.from(buckets.entries()).map(([name, data]) => ({
    name,
    totalBudgeted: data.totalBudgeted,
    totalSpent: data.totalSpent,
    remaining: data.totalBudgeted - data.totalSpent,
    percentUsed: data.totalBudgeted > 0 ? (data.totalSpent / data.totalBudgeted) * 100 : 0,
    groups: Array.from(data.groups.entries()).map(([gName, gData]) => ({
      name: gName,
      budgeted: gData.budgeted,
      spent: gData.spent,
      categories: gData.categories,
    })).sort((a, b) => b.spent - a.spent),
  }));
}

export async function getDailySpending(monthDate: Date) {
  const range = generateMonthRange(2, monthDate);
  const [prev, curr] = range;
  const { start: currentStart, end: currentEnd } = curr;
  const { start: prevStart, end: prevEnd } = prev;

  const [currentTx, prevTx] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: { gte: currentStart, lte: currentEnd },
        category: catFilter,
      },
      select: { date: true, amount: true },
      orderBy: { date: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        date: { gte: prevStart, lte: prevEnd },
        category: catFilter,
      },
      select: { date: true, amount: true },
      orderBy: { date: "asc" },
    }),
  ]);

  function accumulate(transactions: Array<{ date: Date; amount: number }>) {
    const dailyTotals = new Map<number, number>();
    for (const tx of transactions) {
      const day = new Date(tx.date).getDate();
      dailyTotals.set(day, (dailyTotals.get(day) || 0) + Math.abs(tx.amount));
    }

    const result: Array<{ day: number; cumulative: number }> = [];
    let cumulative = 0;
    const sortedDays = Array.from(dailyTotals.keys()).sort((a, b) => a - b);
    for (const day of sortedDays) {
      cumulative += dailyTotals.get(day)!;
      result.push({ day, cumulative });
    }
    return result;
  }

  let currentMonth = accumulate(currentTx);
  // Trim current-month line to today (ET) so an in-progress month doesn't draw
  // a flat tail across the rest of the days.
  const isCurrentET = curr.monthKey === getCurrentMonthKeyET();
  if (isCurrentET) {
    const today = getCurrentDayET();
    currentMonth = currentMonth.filter((d) => d.day <= today);
  }

  return {
    currentMonth,
    previousMonth: accumulate(prevTx),
    currentLabel: format(monthDate, "MMM yyyy"),
    previousLabel: format(prev.monthDate, "MMM yyyy"),
  };
}

export async function getCashFlowTrends(months: number = 4) {
  const range = generateMonthRange(months);
  return mapMonths(
    range,
    async ({ monthKey, start, end }) => {
      const [incomeResult, expenseResult] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            date: { gte: start, lte: end },
            category: { isIncome: true },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            date: { gte: start, lte: end },
            category: catFilter,
          },
          _sum: { amount: true },
        }),
      ]);

      return {
        month: monthKey,
        label: format(start, "MMM"),
        income: Math.abs(incomeResult._sum.amount || 0),
        expenses: Math.abs(expenseResult._sum.amount || 0),
      };
    },
  );
}

export async function getTopExpenseCategories(monthDate: Date, limit: number = 5) {
  const { start, end } = generateMonthRange(1, monthDate)[0];

  const results = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      date: { gte: start, lte: end },
      category: catFilter,
      categoryId: { not: null },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "asc" } },
    take: limit,
  });

  const categoryIds = results.map((r) => r.categoryId).filter(Boolean) as string[];
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(categories.map((c) => [c.id, c.name]));

  return results
    .filter((r) => r.categoryId)
    .map((r) => ({
      name: nameMap.get(r.categoryId!) || "Unknown",
      amount: Math.abs(r._sum.amount || 0),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export async function getCategorySpotlight(monthDate: Date, categoryNames?: string[] | null) {
  const names = categoryNames ?? getSpotlightCategories();
  if (!names || names.length === 0) return [];

  const summary = await getCurrentMonthSummary(monthDate);

  return names.map((name) => {
    // Try exact category-name match first; fall back to summing all categories
    // whose groupName matches (e.g. "Subscriptions" is a group containing
    // Adobe, Cloud Storage, etc., not a single category).
    const exact = summary.categories.find((c) => c.name === name);
    if (exact) {
      return {
        name,
        budgeted: exact.budgeted,
        spent: exact.spent,
        remaining: exact.budgeted - exact.spent,
        percentUsed: exact.percentUsed,
      };
    }
    const groupCats = summary.categories.filter((c) => c.groupName === name);
    if (groupCats.length > 0) {
      const budgeted = groupCats.reduce((s, c) => s + c.budgeted, 0);
      const spent = groupCats.reduce((s, c) => s + c.spent, 0);
      return {
        name,
        budgeted,
        spent,
        remaining: budgeted - spent,
        percentUsed: budgeted > 0 ? (spent / budgeted) * 100 : 0,
      };
    }
    return { name, budgeted: 0, spent: 0, remaining: 0, percentUsed: 0 };
  });
}

export interface BalanceMetric {
  /** Null when no account in the group has a snapshot for the month. */
  balance: number | null;
  /**
   * Null when no account has snapshots at both ends of the period, so the
   * movement is unknown rather than zero. The card says so instead of
   * claiming nothing moved.
   */
  monthDelta: number | null;
  ytdDelta: number | null;
}

/**
 * Headline balance and deltas for one group of accounts, in the month being
 * viewed.
 *
 * The balance comes from two different places on purpose. The current month
 * uses the live `Account.balance` the last sync wrote, so the figure matches
 * what Actual itself shows. Any past month uses the end-of-month snapshot, so
 * the balance and the delta printed beside it describe the same date — showing
 * today's balance next to March's movement would be two numbers from two
 * dates in one box.
 */
async function accountBalanceMetric(
  names: string[],
  monthKey: string,
): Promise<BalanceMetric> {
  const monthDate = parse(monthKey, "yyyy-MM", new Date());
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const yearStart = startOfYear(monthDate);

  const accounts = await prisma.account.findMany({
    where: { name: { in: names } },
    select: { id: true, balance: true },
  });
  if (accounts.length === 0) {
    return { balance: null, monthDelta: null, ytdDelta: null };
  }

  const accountIds = accounts.map((a) => a.id);
  const isCurrentMonth = monthKey === getCurrentMonthKeyET();

  const [monthDelta, ytdDelta, snapshotBalance] = await Promise.all([
    getBalanceDelta(accountIds, monthStart, monthEnd),
    getBalanceDelta(accountIds, yearStart, monthEnd),
    isCurrentMonth ? Promise.resolve(null) : getBalanceAt(accountIds, monthEnd),
  ]);

  const balance = isCurrentMonth
    ? accounts.reduce((sum, a) => sum + a.balance, 0)
    : snapshotBalance;

  return { balance, monthDelta, ytdDelta };
}

export async function getSavingsMetric(monthKey: string): Promise<BalanceMetric> {
  return accountBalanceMetric(getSavingsAccountNames(), monthKey);
}

export async function getDebtMetric(monthKey: string): Promise<BalanceMetric> {
  const { balance, monthDelta, ytdDelta } = await accountBalanceMetric(
    getPayableDebtAccountNames(),
    monthKey,
  );

  // Debt balances are negative (liabilities). A raw delta of +1000 means
  // the balance went from e.g. -10000 to -9000, i.e. $1000 was paid down.
  // We negate so that a positive result = debt paid down (good) and
  // a negative result = new debt added (bad). The balance is reported as the
  // amount owed, matching how getNetWorth sums totalDebt.
  return {
    balance: balance === null ? null : Math.abs(balance),
    monthDelta: monthDelta === null ? null : -monthDelta,
    ytdDelta: ytdDelta === null ? null : -ytdDelta,
  };
}

/**
 * Income minus expenses for one month, in cents.
 *
 * Same definitions `getCashFlowTrends` uses for its bars, scoped to a single
 * month: income is every transaction in an income category, expenses is every
 * transaction passing `expenseCategoryFilter()`. Transfers between accounts
 * carry no category and so appear in neither.
 */
export async function getMonthCashFlow(monthDate: Date): Promise<{
  income: number;
  expenses: number;
  net: number;
}> {
  const { start, end } = generateMonthRange(1, monthDate)[0];

  const [incomeResult, expenseResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: { date: { gte: start, lte: end }, category: { isIncome: true } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { date: { gte: start, lte: end }, category: catFilter },
      _sum: { amount: true },
    }),
  ]);

  const income = Math.abs(incomeResult._sum.amount || 0);
  const expenses = Math.abs(expenseResult._sum.amount || 0);

  return { income, expenses, net: income - expenses };
}

export async function getInvestmentsMetric(monthKey: string): Promise<{
  monthDelta: number;
  ytdDelta: number;
  contributions: number;
  growth: number;
  trackingSince: string | null;
}> {
  const monthDate = parse(monthKey, "yyyy-MM", new Date());
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const yearStart = startOfYear(monthDate);

  const investmentNames = getInvestmentAccountNames();
  const accounts = await prisma.account.findMany({
    where: { name: { in: investmentNames } },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return { monthDelta: 0, ytdDelta: 0, contributions: 0, growth: 0, trackingSince: null };
  }

  const [monthDelta, ytdDelta] = await Promise.all([
    getBalanceDelta(accountIds, monthStart, monthEnd),
    getBalanceDelta(accountIds, yearStart, monthEnd),
  ]);

  // Contributions: sum of positive-amount (inbound) transactions to investment accounts this month.
  // Positive amounts represent money flowing into these accounts (transfers in).
  const contributionResult = await prisma.transaction.aggregate({
    where: {
      date: { gte: monthStart, lte: monthEnd },
      accountId: { in: accountIds },
      amount: { gt: 0 },
    },
    _sum: { amount: true },
  });
  const contributions = contributionResult._sum.amount || 0;
  // This widget is parked off the dashboard and keeps its old behaviour: an
  // unknown movement reads as zero here. Worth revisiting when it comes back.
  const growth = (monthDelta ?? 0) - contributions;

  // Earliest snapshot date for any investment account
  const earliestSnapshot = await prisma.accountBalanceSnapshot.findFirst({
    where: { accountId: { in: accountIds } },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  const trackingSince = earliestSnapshot
    ? format(earliestSnapshot.date, "yyyy-MM-dd")
    : null;

  return {
    monthDelta: monthDelta ?? 0,
    ytdDelta: ytdDelta ?? 0,
    contributions,
    growth,
    trackingSince,
  };
}

export async function getNetWorth() {
  const accounts = await prisma.account.findMany();

  const nameToGroup = new Map<string, string>();
  for (const [group, names] of Object.entries(NET_WORTH_GROUPS)) {
    for (const name of names) {
      nameToGroup.set(name, group);
    }
  }

  const groups = new Map<string, { total: number; accounts: Array<{ name: string; balance: number }> }>();

  // Initialize all groups
  for (const groupName of Object.keys(NET_WORTH_GROUPS)) {
    groups.set(groupName, { total: 0, accounts: [] });
  }

  for (const account of accounts) {
    if (EXCLUDED_ACCOUNTS.includes(account.name)) continue;

    const groupName = nameToGroup.get(account.name);
    if (!groupName) continue;

    const group = groups.get(groupName)!;
    group.total += account.balance;
    group.accounts.push({ name: account.name, balance: account.balance });
  }

  let totalAssets = 0;
  let totalDebt = 0;

  const groupsArray = Array.from(groups.entries()).map(([name, data]) => {
    const isDebt = name.startsWith("Debt");
    if (isDebt) {
      totalDebt += Math.abs(data.total);
    } else {
      totalAssets += data.total;
    }
    return {
      name,
      total: data.total,
      accounts: data.accounts.sort((a, b) => b.balance - a.balance),
      isDebt,
    };
  });

  return {
    totalNetWorth: totalAssets - totalDebt,
    totalAssets,
    totalDebt,
    groups: groupsArray,
  };
}
