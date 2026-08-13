import { NextRequest, NextResponse } from "next/server";
import { getCurrentMonthSummary, getAvailableMonths, getBudgetByBucket, getNetWorth } from "@/lib/queries";
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
  const { monthDate } = resolveMonth(
    monthParam,
    availableMonths,
    getCurrentMonthKeyET(),
  );

  const [summary, buckets, netWorth] = await Promise.all([
    getCurrentMonthSummary(monthDate),
    getBudgetByBucket(monthDate),
    getNetWorth(),
  ]);

  return NextResponse.json({ summary, buckets, netWorth, availableMonths });
}
