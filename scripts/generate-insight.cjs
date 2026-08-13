const Anthropic = require("@anthropic-ai/sdk");
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");
const { backfillMonths } = require("../src/lib/backfill.cjs");
const {
  getCurrentMonthKeyET,
  getCurrentDayET,
  getDaysInMonth,
  getPreviousMonthKey,
} = require("../src/lib/timezone.cjs");

const { SKIP_CATEGORIES, SKIP_INCOME, NET_WORTH_GROUPS, HOUSEHOLD_NAMES } = loadConfig();

const skipNames = [...SKIP_CATEGORIES, ...SKIP_INCOME];
const skipList = skipNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
const savingsAccountList = NET_WORTH_GROUPS["Savings"].map((n) => `'${n.replace(/'/g, "''")}'`).join(",");

const SYSTEM_PROMPT = `You are a friendly personal finance assistant for a family budget dashboard used by ${HOUSEHOLD_NAMES}.
You will receive the current month's budget data plus the previous 3 months for context.

IMPORTANT — this is an IN-PROGRESS month. The data includes monthProgress (dayOfMonth, daysInMonth, percentElapsed).
- Use projectedSpent (not totalSpent) when comparing this month's spending to previous full months.
- Use previousMonthSpentSameDay and previousMonthSpentSameDayChange for a fair same-period comparison.
- Never say the month is "on track" or "over budget" based on totalSpent alone — always account for how far through the month we are.
- atRiskCategories are categories ahead of their spending pace but not yet over budget — flag these as "ones to watch", not confirmed problems.
- overspendingCategories have already exceeded their budget — treat these as confirmed issues.

Provide 5-7 concise bullet points covering:
- Overall pace for the month: projected total vs budget, and how that compares to previous months
- Same-period comparison: spending so far vs the same point last month
- Top vendors/payees where the most money is going and whether any stand out as unusually high
- Categories already over budget (overspendingCategories) with dollar amounts and practical suggestions
- Categories at risk of going over (atRiskCategories) — brief, encouraging nudge
- Savings account flows (use the savingsFlows data, not the calculated savingsRate)
Be casual and encouraging — like a helpful friend, not a stern accountant. Use plain language.
Start each bullet point with "- " on its own line. Do not use headers or any other formatting.`;

const COMPLETED_MONTH_PROMPT = `You are a friendly personal finance assistant for a family budget dashboard used by ${HOUSEHOLD_NAMES}.
This is a COMPLETED month — all transactions are finalized. Provide a 3-5 bullet point end-of-month recap.
Be casual and encouraging — like a helpful friend wrapping up the month. Use plain language.
Mention specific categories and dollar amounts. Celebrate wins, note areas to watch next month.
The data includes savingsFlows showing actual money moved in/out of savings accounts — use this for savings commentary rather than the calculated savingsRate.
Start each bullet point with "- " on its own line. Do not use headers or any other formatting.`;

// dayOfMonth: pass for current (in-progress) month to enable projections; omit for completed months
async function gatherMonthData(pool, monthKey, dayOfMonth) {
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
        AND c.name NOT IN (${skipList})
    `, [monthKey]),

    // 1: total spent (per-category net, then sum — matches dashboard getCurrentMonthSummary)
    pool.query(`
      SELECT COALESCE(SUM(cat_net), 0) as total_spent
      FROM (
        SELECT ABS(SUM(t.amount)) as cat_net
        FROM "Transaction" t
        JOIN "Category" c ON t."categoryId" = c.id
        WHERE t.date >= $1 AND t.date <= $2
          AND c."isIncome" = false
          AND c.hidden = false
          AND c.name NOT IN (${skipList})
        GROUP BY c.id
      ) sub
    `, [startDate, endDate]),

    // 2: confirmed overspending (spent > budgeted, regardless of pace)
    pool.query(`
      SELECT c.name, c."groupName",
        cb."budgetedAmount" as budgeted,
        COALESCE(ABS(SUM(t.amount)), 0) as spent
      FROM "CategoryBudget" cb
      JOIN "Category" c ON cb."categoryId" = c.id
      LEFT JOIN "Transaction" t ON t."categoryId" = cb."categoryId"
        AND t.date >= $1 AND t.date <= $2
      WHERE cb.month = $3
        AND c."isIncome" = false AND c.hidden = false
        AND c.name NOT IN (${skipList})
      GROUP BY c.name, c."groupName", cb."budgetedAmount"
      HAVING COALESCE(ABS(SUM(t.amount)), 0) > cb."budgetedAmount"
      ORDER BY (COALESCE(ABS(SUM(t.amount)), 0) - cb."budgetedAmount") DESC
      LIMIT 10
    `, [startDate, endDate, monthKey]),

    // 3: top payees
    pool.query(`
      SELECT t.payee, c.name as category, ABS(SUM(t.amount)) as total
      FROM "Transaction" t
      JOIN "Category" c ON t."categoryId" = c.id
      WHERE t.date >= $1 AND t.date <= $2
        AND c."isIncome" = false AND c.hidden = false
        AND c.name NOT IN (${skipList})
        AND t.payee IS NOT NULL
      GROUP BY t.payee, c.name
      ORDER BY ABS(SUM(t.amount)) DESC
      LIMIT 15
    `, [startDate, endDate]),

    // 4: income
    pool.query(`
      SELECT COALESCE(ABS(SUM(t.amount)), 0) as total_income
      FROM "Transaction" t
      JOIN "Category" c ON t."categoryId" = c.id
      WHERE t.date >= $1 AND t.date <= $2
        AND c."isIncome" = true
    `, [startDate, endDate]),

    // 5: previous month full spend (per-category net, then sum)
    pool.query(`
      SELECT COALESCE(SUM(cat_net), 0) as prev_spent
      FROM (
        SELECT ABS(SUM(t.amount)) as cat_net
        FROM "Transaction" t
        JOIN "Category" c ON t."categoryId" = c.id
        WHERE t.date >= $1 AND t.date <= $2
          AND c."isIncome" = false AND c.hidden = false
          AND c.name NOT IN (${skipList})
        GROUP BY c.id
      ) sub
    `, [prevStartDate, prevEndDate]),

    // 6: savings flows
    pool.query(`
      SELECT a.name as account,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as inflow,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 0) as outflow,
        COALESCE(SUM(t.amount), 0) as net
      FROM "Transaction" t
      JOIN "Account" a ON t."accountId" = a.id
      WHERE t.date >= $1 AND t.date <= $2
        AND a.name IN (${savingsAccountList})
      GROUP BY a.name
      ORDER BY a.name
    `, [startDate, endDate]),

    // 7: at-risk categories (ahead of pace but not yet over budget) — only for in-progress months
    isInProgress ? pool.query(`
      SELECT c.name, c."groupName",
        cb."budgetedAmount" as budgeted,
        COALESCE(ABS(SUM(t.amount)), 0) as spent
      FROM "CategoryBudget" cb
      JOIN "Category" c ON cb."categoryId" = c.id
      LEFT JOIN "Transaction" t ON t."categoryId" = cb."categoryId"
        AND t.date >= $1 AND t.date <= $2
      WHERE cb.month = $3
        AND c."isIncome" = false AND c.hidden = false
        AND c.name NOT IN (${skipList})
      GROUP BY c.name, c."groupName", cb."budgetedAmount"
      HAVING
        COALESCE(ABS(SUM(t.amount)), 0) <= cb."budgetedAmount"
        AND COALESCE(ABS(SUM(t.amount)), 0) > cb."budgetedAmount" * $4::float8
      ORDER BY (COALESCE(ABS(SUM(t.amount)), 0) / NULLIF(cb."budgetedAmount", 0)) DESC
      LIMIT 5
    `, [startDate, endDate, monthKey, percentElapsed]) : Promise.resolve({ rows: [] }),

    // 8: previous month spend through same day (per-category net, then sum) — only for in-progress months
    isInProgress ? pool.query(`
      SELECT COALESCE(SUM(cat_net), 0) as prev_same_day_spent
      FROM (
        SELECT ABS(SUM(t.amount)) as cat_net
        FROM "Transaction" t
        JOIN "Category" c ON t."categoryId" = c.id
        WHERE t.date >= $1 AND t.date <= $2
          AND c."isIncome" = false AND c.hidden = false
          AND c.name NOT IN (${skipList})
        GROUP BY c.id
      ) sub
    `, [prevStartDate, prevSameDayCutoff]) : Promise.resolve({ rows: [] }),
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

/**
 * Builds the insight text for a month without writing anything. Returns
 * undefined when the month has no data to describe.
 *
 * Kept separate from storage so `--backfill` can generate before it deletes.
 */
async function buildInsight(pool, monthKey, isCompleted) {
  console.log(`\nGenerating AI insight for ${monthKey}${isCompleted ? " (completed month)" : ""}...`);

  const dayOfMonth = isCompleted ? undefined : getCurrentDayET();
  const monthData = await gatherMonthData(pool, monthKey, dayOfMonth);

  // Skip if there's no spending data
  if (monthData.totalSpent === "0.00" && monthData.totalBudgeted === "0.00") {
    console.log(`  Skipping ${monthKey} — no data.`);
    return;
  }

  // For current month, include previous 3 months of data for trend analysis
  let payload;
  if (!isCompleted) {
    const prev1 = getPreviousMonthKey(monthKey);
    const prev2 = getPreviousMonthKey(prev1);
    const prev3 = getPreviousMonthKey(prev2);
    const [data1, data2, data3] = await Promise.all([
      gatherMonthData(pool, prev1),
      gatherMonthData(pool, prev2),
      gatherMonthData(pool, prev3),
    ]);
    payload = {
      currentMonth: monthData,
      previousMonths: [data1, data2, data3],
    };
  } else {
    payload = monthData;
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: isCompleted ? COMPLETED_MONTH_PROMPT : SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
      },
    ],
  });

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function insertInsight(pool, monthKey, content) {
  await pool.query(
    `INSERT INTO "DailyInsight" (id, "createdAt", content, "monthKey")
     VALUES (gen_random_uuid(), NOW(), $1, $2)`,
    [content, monthKey]
  );
}

/**
 * Swaps a month's insight for a new one. The delete and the insert share a
 * transaction, so an interrupted run cannot leave the month with nothing.
 */
async function replaceInsight(pool, monthKey, content) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "DailyInsight" WHERE "monthKey" = $1`, [monthKey]);
    await client.query(
      `INSERT INTO "DailyInsight" (id, "createdAt", content, "monthKey")
       VALUES (gen_random_uuid(), NOW(), $1, $2)`,
      [content, monthKey]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function generateInsight(pool, monthKey, isCompleted) {
  const content = await buildInsight(pool, monthKey, isCompleted);
  if (content === undefined) return;

  await insertInsight(pool, monthKey, content);
  console.log(`  Insight for ${monthKey} stored successfully.`);
  console.log(content);
}

async function needsInsight(pool, monthKey) {
  // Check if there's an insight from the last 24 hours for this month
  const result = await pool.query(
    `SELECT id FROM "DailyInsight"
     WHERE "monthKey" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [monthKey]
  );
  return result.rows.length === 0;
}

async function getAllMonthKeys(pool) {
  const result = await pool.query(
    `SELECT DISTINCT month FROM "CategoryBudget" ORDER BY month ASC`
  );
  return result.rows.map((r) => r.month);
}

async function main() {
  const isBackfill = process.argv.includes("--backfill");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const currentMonthKey = getCurrentMonthKeyET();

  try {
    if (isBackfill) {
      console.log("Running backfill — regenerating insights for all months...\n");

      const allMonths = await getAllMonthKeys(pool);
      const monthsToProcess = allMonths.filter((m) => m <= currentMonthKey);

      // Each month is generated before anything is deleted, and the swap runs
      // in one transaction, so a failed API call costs no stored insight.
      await backfillMonths({
        months: monthsToProcess,
        generateMonth: (monthKey) =>
          buildInsight(pool, monthKey, monthKey < currentMonthKey),
        replaceMonth: (monthKey, content) =>
          replaceInsight(pool, monthKey, content),
      });
    } else {
      const previousMonthKey = getPreviousMonthKey(currentMonthKey);

      // Generate insight for previous month if it doesn't have a recent one
      if (await needsInsight(pool, previousMonthKey)) {
        await generateInsight(pool, previousMonthKey, true);
      } else {
        console.log(`Previous month ${previousMonthKey} already has a recent insight, skipping.`);
      }

      // Always generate for current month
      await generateInsight(pool, currentMonthKey, false);
    }

    console.log("\nDone.");
  } catch (error) {
    console.error("Failed to generate AI insight:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
