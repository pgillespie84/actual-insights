"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { DailySpendingChart } from "@/components/DailySpendingChart";
import { TopVendorsChart } from "@/components/TopVendorsChart";
import { SavingsMetricCard } from "@/components/SavingsMetricCard";
import { InvestmentsMetricCard } from "@/components/InvestmentsMetricCard";
import { CashFlowTrendsWidget } from "@/components/CashFlowTrendsWidget";
import { TopExpenseCategoriesWidget } from "@/components/TopExpenseCategoriesWidget";
import { CategorySpotlightCard } from "@/components/CategorySpotlightCard";
import { MonthSelector } from "@/components/MonthSelector";
import { AISummaryCard } from "@/components/AISummaryCard";
import { DebtMetricCard } from "@/components/DebtMetricCard";
import { EmailDashboardButton } from "@/components/EmailDashboardButton";
import { topRowGridClass, bottomRowGridClass } from "@/lib/gridLayout";
import type { DashboardResponse } from "@/types/api";
import { useMonthlyData } from "@/hooks/useMonthlyData";

function DashboardContent() {
  const searchParams = useSearchParams();
  const isPrint = searchParams.get("print") === "1";
  const { data, loading, selectedMonth, setMonth } = useMonthlyData<DashboardResponse>("/api/dashboard");

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className={isPrint ? "space-y-4" : "space-y-6"}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          {data.lastSync && (
            <p className="mt-1 text-sm text-text-muted">
              Last synced {format(new Date(data.lastSync.syncedAt), "MMM d, h:mm a")}
            </p>
          )}
        </div>
        {!isPrint && (
          <div className="flex items-center gap-3">
            <EmailDashboardButton month={selectedMonth || data.monthKey} />
            {data.availableMonths.length > 0 && (
              <MonthSelector
                months={data.availableMonths}
                selected={selectedMonth}
                onChange={setMonth}
              />
            )}
          </div>
        )}
      </div>

      {/* AI Insights */}
      {data.insight && (
        <AISummaryCard
          content={data.insight.content}
          createdAt={data.insight.createdAt}
        />
      )}

      {/* Top Row: Spending | Financial Metrics | Cash Flow */}
      <div className={topRowGridClass(isPrint)}>
        <DailySpendingChart data={data.dailySpending} />
        <div className="space-y-6">
          <SavingsMetricCard
            monthDelta={data.savingsMetric.monthDelta}
            ytdDelta={data.savingsMetric.ytdDelta}
          />
          <InvestmentsMetricCard
            monthDelta={data.investmentsMetric.monthDelta}
            ytdDelta={data.investmentsMetric.ytdDelta}
          />
          <DebtMetricCard
            monthDelta={data.debtMetric.monthDelta}
            ytdDelta={data.debtMetric.ytdDelta}
          />
        </div>
        <CashFlowTrendsWidget data={data.cashFlowTrends} />
      </div>

      {/* Bottom Row: Transactions | Top Categories | Spotlights */}
      <div className={bottomRowGridClass(isPrint, data.categorySpotlights.length > 0)}>
        <TopVendorsChart data={data.topPayees} />
        <TopExpenseCategoriesWidget categories={data.topExpenseCategories} />
        {data.categorySpotlights.length > 0 && (
          <div className="space-y-6">
            {data.categorySpotlights.map((cat) => (
              <CategorySpotlightCard key={cat.name} {...cat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
