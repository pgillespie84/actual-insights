"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DailySpendingChart } from "@/components/DailySpendingChart";
import { TopVendorsChart } from "@/components/TopVendorsChart";
import { MetricBan } from "@/components/MetricBan";
import { TopExpenseCategoriesWidget } from "@/components/TopExpenseCategoriesWidget";
import { CategorySpotlightCard } from "@/components/CategorySpotlightCard";
import { MonthSelector } from "@/components/MonthSelector";
import { AISummaryCard } from "@/components/AISummaryCard";
import { DashboardHeader } from "@/components/DashboardHeader";
import { EmailDashboardButton } from "@/components/EmailDashboardButton";
import { banRowGridClass, bottomRowGridClass } from "@/lib/gridLayout";
import { formatDollars, formatSignedDollars } from "@/lib/format";
import type { DashboardResponse } from "@/types/api";
import { useMonthlyData } from "@/hooks/useMonthlyData";

/*
 * PARKED — InvestmentsMetricCard and CashFlowTrendsWidget.
 *
 * Both came off the dashboard when the metric row went to three boxes. Neither
 * is deleted and neither has moved: the components, their queries and their
 * fields in /api/dashboard are all untouched, so restoring either one is a
 * one-line change here. They are waiting on the trends and analytics redesigns
 * to decide where they belong.
 */

function DashboardContent() {
  const searchParams = useSearchParams();
  const isPrint = searchParams.get("print") === "1";
  const { data, loading, selectedMonth, setMonth } = useMonthlyData<DashboardResponse>("/api/dashboard");

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-accent" />
      </div>
    );
  }

  const savingsDelta = data.savingsMetric.monthDelta;
  const debtDelta = data.debtMetric.monthDelta;
  const { income, expenses, net } = data.cashFlow;

  // A null delta means no snapshot at one end of the month, so the movement is
  // unknown. Saying "+$0 this month" there would be the confident wrong number
  // the em dash on the balance exists to avoid.
  const NO_HISTORY = "No balance history";

  return (
    <div className={isPrint ? "space-y-4" : "space-y-6"}>
      <DashboardHeader
        household={data.household}
        monthKey={data.monthKey}
        lastSync={data.lastSync ? data.lastSync.syncedAt : null}
        controls={
          isPrint ? null : (
            <>
              <EmailDashboardButton month={selectedMonth || data.monthKey} />
              {data.availableMonths.length > 0 && (
                <MonthSelector
                  months={data.availableMonths}
                  selected={selectedMonth}
                  onChange={setMonth}
                />
              )}
            </>
          )
        }
      />

      <AISummaryCard
        content={data.insight ? data.insight.content : null}
        createdAt={data.insight ? data.insight.createdAt : null}
        isPrint={isPrint}
      />

      <div className={banRowGridClass(isPrint)}>
        <MetricBan
          label="Savings"
          value={data.savingsMetric.balance}
          detail={
            savingsDelta === null
              ? NO_HISTORY
              : `${formatSignedDollars(savingsDelta)} this month`
          }
          detailTone={
            savingsDelta === null ? "neutral" : savingsDelta >= 0 ? "positive" : "negative"
          }
        />
        <MetricBan
          label="Debt"
          value={data.debtMetric.balance}
          detail={
            debtDelta === null
              ? NO_HISTORY
              : `${formatDollars(Math.abs(debtDelta))} ${debtDelta >= 0 ? "paid down" : "added"}`
          }
          detailTone={
            debtDelta === null ? "neutral" : debtDelta >= 0 ? "positive" : "negative"
          }
        />
        <MetricBan
          label="Cash flow"
          value={net}
          signed
          valueTone={net >= 0 ? "positive" : "negative"}
          detail={`${formatDollars(income)} in · ${formatDollars(expenses)} out`}
        />
      </div>

      <DailySpendingChart data={data.dailySpending} />

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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-accent" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
