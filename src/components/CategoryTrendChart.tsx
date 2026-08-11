"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatCents } from "@/lib/format";

interface TrendPoint {
  month: string;
  label: string;
  spent: number;
  budgeted: number;
}

export function CategoryTrendChart({
  data,
  categoryName,
}: {
  data: TrendPoint[];
  categoryName: string;
}) {
  const chartData = data.map((d) => ({
    ...d,
    Spent: d.spent / 100,
    Budget: d.budgeted / 100,
  }));

  const avgBudget =
    chartData.reduce((sum, d) => sum + d.Budget, 0) / chartData.length;

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-1 text-lg font-semibold text-text-primary">{categoryName}</h3>
      <p className="mb-4 text-sm text-text-secondary">12-month spending history</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={11}
              tick={{ fill: "var(--text-secondary)" }}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              tick={{ fill: "var(--text-secondary)" }}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
              formatter={(value) => formatCents(Number(value) * 100)}
            />
            {avgBudget > 0 && (
              <ReferenceLine
                y={avgBudget}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                label={{
                  value: "Budget",
                  fill: "#f59e0b",
                  fontSize: 11,
                  position: "right",
                }}
              />
            )}
            <Bar dataKey="Spent" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
