import { NextRequest, NextResponse } from "next/server";
import { getCurrentMonthSummary, getAvailableMonths, getBudgetByBucket, getNetWorth } from "@/lib/queries";
import { parse } from "date-fns";
import { getCurrentMonthKeyET } from "@/lib/timezone";
import { hasReadAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await hasReadAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");

  const availableMonths = await getAvailableMonths();
  const currentET = getCurrentMonthKeyET();
  const defaultMonth = availableMonths.includes(currentET)
    ? currentET
    : availableMonths[0];
  const monthKey = monthParam || defaultMonth;
  const monthDate = parse(monthKey, "yyyy-MM", new Date());

  const [summary, buckets, netWorth] = await Promise.all([
    getCurrentMonthSummary(monthDate),
    getBudgetByBucket(monthDate),
    getNetWorth(),
  ]);

  return NextResponse.json({ summary, buckets, netWorth, availableMonths });
}
