import { NextRequest, NextResponse } from "next/server";
import { getDailySpending, getTopVendors, getLastSync, getAvailableMonths, getLatestInsight, getCashFlowTrends, getMonthCashFlow, getTopExpenseCategories, getCategorySpotlight, getSavingsMetric, getDebtMetric, getInvestmentsMetric } from "@/lib/queries";
import { CONFIG } from "@/lib/constants";
import { getCurrentMonthKeyET } from "@/lib/timezone";
import { resolveMonth } from "@/lib/query-utils";
import { hasReadAccess } from "@/lib/auth";
import { getFundGroups } from "@/lib/savingsFunds";

export async function GET(request: NextRequest) {
  if (!(await hasReadAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");

  const availableMonths = await getAvailableMonths();
  const { monthKey, monthDate } = resolveMonth(
    monthParam,
    availableMonths,
    getCurrentMonthKeyET(),
  );

  const [dailySpending, topVendors, lastSync, insight, cashFlowTrends, cashFlow, topExpenseCategories, categorySpotlights, savingsMetric, debtMetric, investmentsMetric, fundGroups] = await Promise.all([
    getDailySpending(monthDate),
    getTopVendors(monthDate, 10),
    getLastSync(),
    getLatestInsight(monthKey),
    getCashFlowTrends(4),
    getMonthCashFlow(monthDate),
    getTopExpenseCategories(monthDate, 5),
    getCategorySpotlight(monthDate),
    getSavingsMetric(monthKey),
    getDebtMetric(monthKey),
    getInvestmentsMetric(monthKey),
    // Hand-entered, and unrelated to every other figure here: no fund total
    // reaches net worth or the Savings metric. It travels in this payload
    // because it is shown on the same page, not because it is the same data.
    getFundGroups(monthKey),
  ]);

  // The greeting names the household, which the client cannot read for itself:
  // loadConfig.cjs resolves it off the filesystem, so it has to travel in the
  // payload rather than being imported by the page.
  return NextResponse.json({ monthKey, household: CONFIG.HOUSEHOLD_NAMES, dailySpending, topVendors, lastSync, availableMonths, insight, cashFlowTrends, cashFlow, topExpenseCategories, categorySpotlights, savingsMetric, debtMetric, investmentsMetric, fundGroups });
}
