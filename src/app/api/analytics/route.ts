import { NextRequest, NextResponse } from "next/server";
import {
  getBudgetAccuracy,
  getTopPayees,
  getSavingsRateTrend,
  getCashFlowForecast,
  getAvailableMonths,
} from "@/lib/queries";
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

  const [budgetAccuracy, topPayees, savingsRateTrend, cashFlowForecast] =
    await Promise.all([
      getBudgetAccuracy(monthDate),
      getTopPayees(monthDate),
      getSavingsRateTrend(),
      getCashFlowForecast(),
    ]);

  return NextResponse.json({
    budgetAccuracy,
    topPayees,
    savingsRateTrend,
    cashFlowForecast,
    availableMonths,
    monthKey,
  });
}
