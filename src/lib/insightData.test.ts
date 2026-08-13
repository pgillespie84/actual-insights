import { test, expect } from "vitest";
import { gatherMonthData } from "./insightData.cjs";
import { SKIP_CATEGORIES, SKIP_INCOME, NET_WORTH_GROUPS } from "./constants.ts";

// `generate-insight.cjs` runs `main()` on import, so its query layer was
// untestable. These tests pin what the extracted layer returns before #11
// rewrites the SQL underneath it. Amounts are cents; every output is a fixed
// 2dp string.

type Rows = Record<string, unknown>[];

/**
 * Stands in for a pg Pool. Dispatches on a token in the query text rather than
 * call order, so the queries can be reordered or deduped without touching the
 * tests. Records every call for the parameterisation tests.
 */
function fakePool(byToken: Record<string, Rows>) {
  const calls: { text: string; values: unknown[] }[] = [];
  return {
    calls,
    query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      const hit = Object.keys(byToken).find((token) => text.includes(token));
      return Promise.resolve({ rows: hit ? byToken[hit] : [] });
    },
  };
}

test("a completed month reports budget, spend and the previous-month change", async () => {
  const pool = fakePool({
    total_budgeted: [{ total_budgeted: 500_00 }],
    total_spent: [{ total_spent: 400_00 }],
    total_income: [{ total_income: 800_00 }],
    prev_spent: [{ prev_spent: 320_00 }],
  });

  const data = await gatherMonthData(pool, "2026-03");

  expect(data.monthKey).toBe("2026-03");
  expect(data.totalBudgeted).toBe("500.00");
  expect(data.totalSpent).toBe("400.00");
  expect(data.remaining).toBe("100.00");
  expect(data.totalIncome).toBe("800.00");
  // 800 in, 400 out, so half the income was kept.
  expect(data.savingsRate).toBe("50.0");
  expect(data.previousMonthSpent).toBe("320.00");
  // 400 against 320 is a quarter more than last month.
  expect(data.spendingChange).toBe("25.0");
});

test("an in-progress month projects spend and compares to the same day last month", async () => {
  const pool = fakePool({
    total_spent: [{ total_spent: 400_00 }],
    prev_same_day_spent: [{ prev_same_day_spent: 300_00 }],
  });

  // Day 10 of a 31-day month.
  const data = await gatherMonthData(pool, "2026-03", 10);

  expect(data.monthProgress).toEqual({
    dayOfMonth: 10,
    daysInMonth: 31,
    percentElapsed: "32.3",
  });
  // 400 over 10 days, run out to all 31: 400 * 3.1 = 1240.
  expect(data.projectedSpent).toBe("1240.00");
  expect(data.previousMonthSpentSameDay).toBe("300.00");
  // 400 against 300 at the same point last month is a third more.
  expect(data.previousMonthSpentSameDayChange).toBe("33.3");
});

test("at-risk categories report how much of the budget is used", async () => {
  const pool = fakePool({
    // Only the at-risk query casts the elapsed-fraction parameter.
    float8: [{ name: "Groceries", groupName: "Food", budgeted: 100_00, spent: 80_00 }],
  });

  const data = await gatherMonthData(pool, "2026-03", 10);

  expect(data.atRiskCategories).toEqual([
    {
      name: "Groceries",
      group: "Food",
      budgeted: "100.00",
      spent: "80.00",
      percentUsed: "80.0",
    },
  ]);
});

// The lists used to be spliced into the query text as quoted SQL literals,
// which is the only reason a manual quote-escaping helper existed. They belong
// in the parameter array.
test("category and account names travel as parameters, never as query text", async () => {
  const pool = fakePool({});

  await gatherMonthData(pool, "2026-03", 10);

  const names = [...SKIP_CATEGORIES, ...SKIP_INCOME, ...NET_WORTH_GROUPS.Savings];
  expect(names.length).toBeGreaterThan(0);

  for (const { text } of pool.calls) {
    for (const name of names) {
      expect(text).not.toContain(name);
    }
  }

  const withoutList = pool.calls.filter(
    (c) => !c.values.some((v) => Array.isArray(v) && v.some((n) => names.includes(n as string))),
  );
  // The income query is the one that filters on no name list at all: it selects
  // on c."isIncome" alone. Everything else must carry its list as an array.
  expect(withoutList.map((c) => c.text.includes("total_income"))).toEqual([true]);
});

// A name with an apostrophe used to need escaping before it could be spliced
// in. As a parameter it needs no handling at all, and must arrive verbatim.
test("a name containing a quote is passed through untouched", async () => {
  const pool = fakePool({});

  await gatherMonthData(pool, "2026-03", 10, {
    skipNames: ["Sam's Fun Money"],
    savingsAccounts: ["Joe's Savings"],
  });

  const passed = pool.calls.flatMap((c) => c.values.filter(Array.isArray).flat());
  expect(passed).toContain("Sam's Fun Money");
  expect(passed).toContain("Joe's Savings");
  for (const { text } of pool.calls) {
    expect(text).not.toContain("''");
  }
});

test("overspending categories report the amount over budget", async () => {
  const pool = fakePool({
    "LIMIT 10": [{ name: "Dining", groupName: "Food", budgeted: 200_00, spent: 250_00 }],
  });

  const data = await gatherMonthData(pool, "2026-03");

  expect(data.overspendingCategories).toEqual([
    { name: "Dining", group: "Food", budgeted: "200.00", spent: "250.00", over: "50.00" },
  ]);
});

test("top payees and savings flows are converted from cents", async () => {
  const pool = fakePool({
    "LIMIT 15": [{ payee: "Corner Store", category: "Groceries", total: 75_50 }],
    inflow: [{ account: "Rainy Day", inflow: 500_00, outflow: -120_00, net: 380_00 }],
  });

  const data = await gatherMonthData(pool, "2026-03");

  expect(data.topPayees).toEqual([
    { payee: "Corner Store", category: "Groceries", total: "75.50" },
  ]);
  expect(data.savingsFlows).toEqual([
    { account: "Rainy Day", inflow: "500.00", outflow: "-120.00", net: "380.00" },
  ]);
});

test("a month with no rows reports zeros rather than failing", async () => {
  const data = await gatherMonthData(fakePool({}), "2026-03");

  expect(data.totalSpent).toBe("0.00");
  expect(data.totalBudgeted).toBe("0.00");
  // No income means the savings rate has no denominator.
  expect(data.savingsRate).toBe("0");
  // No previous spend means no percentage change to report.
  expect(data.spendingChange).toBe("N/A");
  expect(data.overspendingCategories).toEqual([]);
  expect(data.topPayees).toEqual([]);
  expect(data.savingsFlows).toEqual([]);
});

test("a completed month carries no in-progress fields", async () => {
  const pool = fakePool({ total_spent: [{ total_spent: 100_00 }] });

  const data = await gatherMonthData(pool, "2026-03");

  expect(data.monthProgress).toBeUndefined();
  expect(data.projectedSpent).toBeUndefined();
  expect(data.atRiskCategories).toBeUndefined();
  expect(data.previousMonthSpentSameDay).toBeUndefined();
});
