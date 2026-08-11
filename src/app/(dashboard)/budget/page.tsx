"use client";

import { Suspense } from "react";
import { format, parse } from "date-fns";
import { CategoryTable } from "@/components/CategoryTable";
import { BudgetBucketsWidget } from "@/components/BudgetBucketsWidget";
import { NetWorthWidget } from "@/components/NetWorthWidget";
import { MonthSelector } from "@/components/MonthSelector";
import type { BudgetResponse } from "@/types/api";
import { useMonthlyData } from "@/hooks/useMonthlyData";

function BudgetContent() {
  const { data, loading, selectedMonth, setMonth } = useMonthlyData<BudgetResponse>("/api/budget", {
    getMonthKey: (d) => d.summary.monthKey,
  });

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
      </div>
    );
  }

  const { summary } = data;
  const monthLabel = format(parse(summary.monthKey, "yyyy-MM", new Date()), "MMMM yyyy");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Budget Detail</h1>
        {data.availableMonths.length > 0 && (
          <MonthSelector
            months={data.availableMonths}
            selected={selectedMonth}
            onChange={setMonth}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-card-border bg-card-bg p-4 text-center">
          <p className="text-sm text-text-muted">Budgeted</p>
          <p className="text-xl font-bold text-text-primary">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(summary.totalBudgeted / 100)}
          </p>
        </div>
        <div className="rounded-xl border border-card-border bg-card-bg p-4 text-center">
          <p className="text-sm text-text-muted">Spent</p>
          <p className="text-xl font-bold text-text-primary">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(summary.totalSpent / 100)}
          </p>
        </div>
        <div className="rounded-xl border border-card-border bg-card-bg p-4 text-center">
          <p className="text-sm text-text-muted">Remaining</p>
          <p className={`text-xl font-bold ${summary.totalRemaining < 0 ? "text-red-400" : "text-emerald-400"}`}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(summary.totalRemaining / 100)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BudgetBucketsWidget buckets={data.buckets} monthLabel={monthLabel} />
        <NetWorthWidget data={data.netWorth} />
      </div>

      <CategoryTable categories={summary.categories} />
    </div>
  );
}

export default function BudgetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
        </div>
      }
    >
      <BudgetContent />
    </Suspense>
  );
}
