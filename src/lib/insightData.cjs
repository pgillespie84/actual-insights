const { loadConfig } = require("./loadConfig.cjs");
const {
  getDaysInMonth,
  getPreviousMonthKey,
} = require("./timezone.cjs");

const { SKIP_CATEGORIES, SKIP_INCOME, NET_WORTH_GROUPS } = loadConfig();

const DEFAULT_SKIP_NAMES = [...SKIP_CATEGORIES, ...SKIP_INCOME];
const DEFAULT_SAVINGS_ACCOUNTS = NET_WORTH_GROUPS["Savings"];

/**
 * Spend for a date range, netted per category and then summed — the same
 * definition the dashboard's getCurrentMonthSummary uses. Three callers want
 * this with different dates and a different output column, so the column name
 * is the only thing that varies.
 *
 * Parameters: $1 start date, $2 end date, $3 skipped category names.
 */
function netSpendSql(column) {
  return `
    SELECT COALESCE(SUM(cat_net), 0) as ${column}
    FROM (
      SELECT ABS(SUM(t.amount)) as cat_net
      FROM "Transaction" t
      JOIN "Category" c ON t."categoryId" = c.id
      WHERE t.date >= $1 AND t.date <= $2
        AND c."isIncome" = false
        AND c.hidden = false
        AND c.name <> ALL($3)
      GROUP BY c.id
    ) sub
  `;
}

/**
 * Budgeted against spent, per category. Confirmed overspending and at-risk
 * categories are the same query with a different HAVING clause: one wants the
 * categories already past their budget, the other the ones merely ahead of
 * pace. `having`, `order` and `limit` are code-controlled fragments, not input.
 *
 * Parameters: $1 start date, $2 end date, $3 month key, $4 skipped names, and
 * $5 elapsed fraction for the at-risk variant.
 */
function budgetVsSpendSql({ having, order, limit }) {
  return `
    SELECT c.name, c."groupName",
      cb."budgetedAmount" as budgeted,
      COALESCE(ABS(SUM(t.amount)), 0) as spent
    FROM "CategoryBudget" cb
    JOIN "Category" c ON cb."categoryId" = c.id
    LEFT JOIN "Transaction" t ON t."categoryId" = cb."categoryId"
      AND t.date >= $1 AND t.date <= $2
    WHERE cb.month = $3
      AND c."isIncome" = false AND c.hidden = false
      AND c.name <> ALL($4)
    GROUP BY c.name, c."groupName", cb."budgetedAmount"
    HAVING ${having}
    ORDER BY ${order} DESC
    LIMIT ${limit}
  `;
}

const SPENT = `COALESCE(ABS(SUM(t.amount)), 0)`;

/**
 * @typedef {Object} MonthData
 * @property {string} monthKey
 * @property {string} totalBudgeted
 * @property {string} totalSpent
 * @property {string} remaining
 * @property {string} totalIncome
 * @property {string} savingsRate
 * @property {string} previousMonthSpent
 * @property {string} spendingChange
 * @property {{name: string, group: string, budgeted: string, spent: string, over: string}[]} overspendingCategories
 * @property {{payee: string, category: string, total: string}[]} topPayees
 * @property {{account: string, inflow: string, outflow: string, net: string}[]} savingsFlows
 * @property {{dayOfMonth: number, daysInMonth: number, percentElapsed: string}} [monthProgress] in-progress months only
 * @property {string} [projectedSpent] in-progress months only
 * @property {string} [previousMonthSpentSameDay] in-progress months only
 * @property {string} [previousMonthSpentSameDayChange] in-progress months only
 * @property {{name: string, group: string, budgeted: string, spent: string, percentUsed: string}[]} [atRiskCategories] in-progress months only
 */

/**
 * Collects everything the AI prompt needs about one month. Amounts come back as
 * fixed 2dp strings in dollars, converted from the cents the database stores.
 *
 * @param {{query: Function}} pool
 * @param {string} monthKey `YYYY-MM`
 * @param {number} [dayOfMonth] pass for the current (in-progress) month to
 *   enable projections; omit for completed months
 * @param {{skipNames?: string[], savingsAccounts?: string[]}} [options]
 *   defaults to the household config
 * @returns {Promise<MonthData>}
 */
async function gatherMonthData(pool, monthKey, dayOfMonth, options = {}) {
  const skipNames = options.skipNames ?? DEFAULT_SKIP_NAMES;
  const savingsAccounts = options.savingsAccounts ?? DEFAULT_SAVINGS_ACCOUNTS;

  const [year, month] = monthKey.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const daysInMonth = getDaysInMonth(year, month);
  const isInProgress = dayOfMonth != null;

  // Previous month for comparison
  const prevMonthKey = getPreviousMonthKey(monthKey);
  const [prevYear, prevMonth] = prevMonthKey.split("-").map(Number);
  const prevStartDate = new Date(prevYear, prevMonth - 1, 1);
  const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59);
  // Same-day cutoff in previous month (capped at last day of prev month)
  const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);
  const prevSameDayCutoff = isInProgress
    ? new Date(prevYear, prevMonth - 1, Math.min(dayOfMonth, prevDaysInMonth), 23, 59, 59)
    : null;

  const percentElapsed = isInProgress ? dayOfMonth / daysInMonth : 1;

  const queries = [
    // 0: total budgeted
    pool.query(`
      SELECT COALESCE(SUM(cb."budgetedAmount"), 0) as total_budgeted
      FROM "CategoryBudget" cb
      JOIN "Category" c ON cb."categoryId" = c.id
      WHERE cb.month = $1
        AND c."isIncome" = false
        AND c.hidden = false
        AND c.name <> ALL($2)
    `, [monthKey, skipNames]),

    // 1: total spent
    pool.query(netSpendSql("total_spent"), [startDate, endDate, skipNames]),

    // 2: confirmed overspending (spent > budgeted, regardless of pace)
    pool.query(budgetVsSpendSql({
      having: `${SPENT} > cb."budgetedAmount"`,
      order: `(${SPENT} - cb."budgetedAmount")`,
      limit: 10,
    }), [startDate, endDate, monthKey, skipNames]),

    // 3: top payees
    pool.query(`
      SELECT t.payee, c.name as category, ABS(SUM(t.amount)) as total
      FROM "Transaction" t
      JOIN "Category" c ON t."categoryId" = c.id
      WHERE t.date >= $1 AND t.date <= $2
        AND c."isIncome" = false AND c.hidden = false
        AND c.name <> ALL($3)
        AND t.payee IS NOT NULL
      GROUP BY t.payee, c.name
      ORDER BY ABS(SUM(t.amount)) DESC
      LIMIT 15
    `, [startDate, endDate, skipNames]),

    // 4: income
    pool.query(`
      SELECT COALESCE(ABS(SUM(t.amount)), 0) as total_income
      FROM "Transaction" t
      JOIN "Category" c ON t."categoryId" = c.id
      WHERE t.date >= $1 AND t.date <= $2
        AND c."isIncome" = true
    `, [startDate, endDate]),

    // 5: previous month full spend
    pool.query(netSpendSql("prev_spent"), [prevStartDate, prevEndDate, skipNames]),

    // 6: savings flows
    pool.query(`
      SELECT a.name as account,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as inflow,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 0) as outflow,
        COALESCE(SUM(t.amount), 0) as net
      FROM "Transaction" t
      JOIN "Account" a ON t."accountId" = a.id
      WHERE t.date >= $1 AND t.date <= $2
        AND a.name = ANY($3)
      GROUP BY a.name
      ORDER BY a.name
    `, [startDate, endDate, savingsAccounts]),

    // 7: at-risk categories (ahead of pace but not yet over budget) — only for in-progress months
    isInProgress ? pool.query(budgetVsSpendSql({
      having: `${SPENT} <= cb."budgetedAmount" AND ${SPENT} > cb."budgetedAmount" * $5::float8`,
      order: `(${SPENT} / NULLIF(cb."budgetedAmount", 0))`,
      limit: 5,
    }), [startDate, endDate, monthKey, skipNames, percentElapsed]) : Promise.resolve({ rows: [] }),

    // 8: previous month spend through same day — only for in-progress months
    isInProgress
      ? pool.query(netSpendSql("prev_same_day_spent"), [prevStartDate, prevSameDayCutoff, skipNames])
      : Promise.resolve({ rows: [] }),
  ];

  const [
    budgetResult, spentResult, overspendingResult, payeesResult,
    incomeResult, prevResult, savingsResult, atRiskResult, prevSameDayResult,
  ] = await Promise.all(queries);

  const totalBudgeted = Number(budgetResult.rows[0]?.total_budgeted || 0);
  const totalSpent = Number(spentResult.rows[0]?.total_spent || 0);
  const totalIncome = Number(incomeResult.rows[0]?.total_income || 0);
  const prevSpent = Number(prevResult.rows[0]?.prev_spent || 0);
  const prevSameDaySpent = Number(prevSameDayResult.rows[0]?.prev_same_day_spent || 0);

  const projectedSpent = isInProgress && dayOfMonth > 0
    ? Math.round(totalSpent * (daysInMonth / dayOfMonth))
    : null;

  /** @type {MonthData} */
  const result = {
    monthKey,
    totalBudgeted: (totalBudgeted / 100).toFixed(2),
    totalSpent: (totalSpent / 100).toFixed(2),
    remaining: ((totalBudgeted - totalSpent) / 100).toFixed(2),
    totalIncome: (totalIncome / 100).toFixed(2),
    savingsRate: totalIncome > 0
      ? (((totalIncome - totalSpent) / totalIncome) * 100).toFixed(1)
      : "0",
    previousMonthSpent: (prevSpent / 100).toFixed(2),
    spendingChange: prevSpent > 0
      ? (((totalSpent - prevSpent) / prevSpent) * 100).toFixed(1)
      : "N/A",
    overspendingCategories: overspendingResult.rows.map((r) => ({
      name: r.name,
      group: r.groupName,
      budgeted: (Number(r.budgeted) / 100).toFixed(2),
      spent: (Number(r.spent) / 100).toFixed(2),
      over: ((Number(r.spent) - Number(r.budgeted)) / 100).toFixed(2),
    })),
    topPayees: payeesResult.rows.map((r) => ({
      payee: r.payee,
      category: r.category,
      total: (Number(r.total) / 100).toFixed(2),
    })),
    savingsFlows: savingsResult.rows.map((r) => ({
      account: r.account,
      inflow: (Number(r.inflow) / 100).toFixed(2),
      outflow: (Number(r.outflow) / 100).toFixed(2),
      net: (Number(r.net) / 100).toFixed(2),
    })),
  };

  // Add in-progress fields only for current month
  if (isInProgress) {
    result.monthProgress = {
      dayOfMonth,
      daysInMonth,
      percentElapsed: (percentElapsed * 100).toFixed(1),
    };
    result.projectedSpent = (projectedSpent / 100).toFixed(2);
    result.previousMonthSpentSameDay = (prevSameDaySpent / 100).toFixed(2);
    result.previousMonthSpentSameDayChange = prevSameDaySpent > 0
      ? (((totalSpent - prevSameDaySpent) / prevSameDaySpent) * 100).toFixed(1)
      : "N/A";
    result.atRiskCategories = atRiskResult.rows.map((r) => ({
      name: r.name,
      group: r.groupName,
      budgeted: (Number(r.budgeted) / 100).toFixed(2),
      spent: (Number(r.spent) / 100).toFixed(2),
      percentUsed: ((Number(r.spent) / Number(r.budgeted)) * 100).toFixed(1),
    }));
  }

  return result;
}

module.exports = { gatherMonthData };
