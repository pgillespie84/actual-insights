"use client";

import { Suspense } from "react";
import { MonthSelector } from "@/components/MonthSelector";
import { BudgetAccuracyCard } from "@/components/BudgetAccuracyCard";
import { TopPayeesChart } from "@/components/TopPayeesChart";
import { SavingsRateTrendChart } from "@/components/SavingsRateTrendChart";
import { CashFlowForecastChart } from "@/components/CashFlowForecastChart";
import type { AnalyticsResponse } from "@/types/api";
import { useMonthlyData } from "@/hooks/useMonthlyData";

function AnalyticsContent() {
  const { data, loading, selectedMonth, setMonth } = useMonthlyData<AnalyticsResponse>("/api/analytics");

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Deeper insights into your financial patterns
          </p>
        </div>
        {data.availableMonths.length > 0 && (
          <MonthSelector
            months={data.availableMonths}
            selected={selectedMonth}
            onChange={setMonth}
          />
        )}
      </div>

      {/* Budget Accuracy */}
      <BudgetAccuracyCard
        accuracyPercent={data.budgetAccuracy.accuracyPercent}
        accurateCount={data.budgetAccuracy.accurateCount}
        totalCount={data.budgetAccuracy.totalCount}
        categories={data.budgetAccuracy.categories}
      />

      {/* Top Payees + Savings Rate Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopPayeesChart data={data.topPayees} />
        <SavingsRateTrendChart data={data.savingsRateTrend} />
      </div>

      {/* Cash Flow Forecast */}
      <CashFlowForecastChart data={data.cashFlowForecast} />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}
