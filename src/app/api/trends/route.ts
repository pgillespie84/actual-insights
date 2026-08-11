import { NextRequest, NextResponse } from "next/server";
import { getMonthlySpendingTrend, getCategoryTrend, getChronicOverspenders, getTrendCategories, getSavingsRateTrend } from "@/lib/queries";
import { hasReadAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await hasReadAccess())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  if (categoryId) {
    const trend = await getCategoryTrend(categoryId);
    return NextResponse.json({ trend });
  }

  const [trend, chronicOverspenders, categories, savingsRateTrend] = await Promise.all([
    getMonthlySpendingTrend(),
    getChronicOverspenders(),
    getTrendCategories(),
    getSavingsRateTrend(),
  ]);

  return NextResponse.json({ trend, chronicOverspenders, categories, savingsRateTrend });
}
