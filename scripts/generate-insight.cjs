const Anthropic = require("@anthropic-ai/sdk");
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");
const { backfillMonths } = require("../src/lib/backfill.cjs");
const { gatherMonthData } = require("../src/lib/insightData.cjs");
const {
  getCurrentMonthKeyET,
  getCurrentDayET,
  getPreviousMonthKey,
} = require("../src/lib/timezone.cjs");

const { HOUSEHOLD_NAMES } = loadConfig();

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
    // A dropped connection is one way to land here, and it would make the
    // ROLLBACK reject too. Swallow that one so the original error is what the
    // caller sees.
    await client.query("ROLLBACK").catch(() => {});
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
