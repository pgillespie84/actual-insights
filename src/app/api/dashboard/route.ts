import { NextRequest, NextResponse } from "next/server";
import { getDailySpending, getTopPayees, getLastSync, getAvailableMonths, getLatestInsight, getCashFlowTrends, getMonthCashFlow, getTopExpenseCategories, getCategorySpotlight, getSavingsMetric, getDebtMetric, getInvestmentsMetric } from "@/lib/queries";
import { CONFIG } from "@/lib/constants";
import { getCurrentMonthKeyET } from "@/lib/timezone";
import { resolveMonth } from "@/lib/query-utils";
import { hasReadAccess } from "@/lib/auth";

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

  const [dailySpending, topPayees, lastSync, insight, cashFlowTrends, cashFlow, topExpenseCategories, categorySpotlights, savingsMetric, debtMetric, investmentsMetric] = await Promise.all([
    getDailySpending(monthDate),
    getTopPayees(monthDate, 10),
    getLastSync(),
    getLatestInsight(monthKey),
    getCashFlowTrends(4),
    getMonthCashFlow(monthDate),
    getTopExpenseCategories(monthDate, 5),
    getCategorySpotlight(monthDate),
    getSavingsMetric(monthKey),
    getDebtMetric(monthKey),
    getInvestmentsMetric(monthKey),
  ]);

  // The greeting names the household, which the client cannot read for itself:
  // loadConfig.cjs resolves it off the filesystem, so it has to travel in the
  // payload rather than being imported by the page.
  return NextResponse.json({ monthKey, household: CONFIG.HOUSEHOLD_NAMES, dailySpending, topPayees, lastSync, availableMonths, insight, cashFlowTrends, cashFlow, topExpenseCategories, categorySpotlights, savingsMetric, debtMetric, investmentsMetric });
}
