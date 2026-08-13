"use client";

import { useEffect, useState } from "react";
import { SpendingTrendChart } from "@/components/SpendingTrendChart";
import { CategoryTrendChart } from "@/components/CategoryTrendChart";
import { ChronicOverspenders } from "@/components/ChronicOverspenders";
import { SavingsRateTrendChart } from "@/components/SavingsRateTrendChart";
import type { TrendsResponse, TrendPoint } from "@/types/api";

export default function TrendsPage() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [categoryTrend, setCategoryTrend] = useState<TrendPoint[] | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // The cancelled flag matters as well as the lint rule: without it a response
  // arriving after the page unmounts sets state on a dead component.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/trends");
      const json = await res.json();
      if (cancelled) return;
      setData(json);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCategorySelect(id: string, name: string) {
    setSelectedCategory({ id, name });
    setCategoryLoading(true);
    const res = await fetch(`/api/trends?categoryId=${id}`);
    const json = await res.json();
    setCategoryTrend(json.trend);
    setCategoryLoading(false);
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Trends</h1>
        <p className="mt-1 text-sm text-text-secondary">
          12-month spending patterns and analysis
        </p>
      </div>

      {/* Overall Trend */}
      <SpendingTrendChart data={data.trend} />

      {/* Savings Rate Trend */}
      {data.savingsRateTrend && (
        <SavingsRateTrendChart data={data.savingsRateTrend} />
      )}

      {/* Category Drill-Down & Chronic Overspenders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChronicOverspenders
          data={data.chronicOverspenders}
          onSelect={handleCategorySelect}
        />

        <div className="rounded-xl border border-card-border bg-card-bg p-6">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Category Drill-Down
          </h3>
          <div className="mb-4">
            <select
              value={selectedCategory?.id || ""}
              onChange={(e) => {
                const cat = data.categories.find((c) => c.id === e.target.value);
                if (cat) handleCategorySelect(cat.id, cat.name);
              }}
              className="w-full rounded-lg border border-card-border bg-input-bg px-4 py-2 text-sm text-text-primary outline-none transition-colors focus:border-emerald-500"
            >
              <option value="">Select a category...</option>
              {data.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                  {cat.groupName ? ` (${cat.groupName})` : ""}
                </option>
              ))}
            </select>
          </div>
          {categoryLoading && (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-card-border border-t-emerald-500" />
            </div>
          )}
          {!categoryLoading && !selectedCategory && (
            <div className="flex h-48 items-center justify-center text-sm text-text-muted">
              Select a category or click a chronic overspender to view its trend
            </div>
          )}
        </div>
      </div>

      {/* Category Trend Chart (shown below when selected) */}
      {!categoryLoading && selectedCategory && categoryTrend && (
        <CategoryTrendChart
          data={categoryTrend}
          categoryName={selectedCategory.name}
        />
      )}
    </div>
  );
}
