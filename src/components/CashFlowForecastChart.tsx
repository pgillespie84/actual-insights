"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatCents } from "@/lib/format";

interface ForecastData {
  month: string;
  label: string;
  spent: number;
  projected: boolean;
}

export function CashFlowForecastChart({ data }: { data: ForecastData[] }) {
  const chartData = data.map((d) => ({
    ...d,
    actual: d.projected ? null : d.spent / 100,
    forecast: d.projected ? d.spent / 100 : null,
    // Bridge: last historical point connects to first forecast point
    bridge: null as number | null,
  }));

  // Connect the last actual point to the first forecast point
  const lastActualIdx = chartData.findLastIndex((d) => d.actual !== null);
  if (lastActualIdx >= 0 && lastActualIdx + 1 < chartData.length) {
    chartData[lastActualIdx].bridge = chartData[lastActualIdx].actual;
    chartData[lastActualIdx + 1].bridge = chartData[lastActualIdx + 1].forecast;
  }

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-1 text-lg font-semibold text-text-primary">
        Cash Flow Forecast
      </h3>
      <p className="mb-4 text-xs text-text-muted">
        Based on 6-month rolling average. Dashed line shows projected spending.
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 10, right: 20 }}>
            <defs>
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={12}
              tick={{ fill: "var(--text-secondary)" }}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              tick={{ fill: "var(--text-secondary)" }}
              tickFormatter={(v) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
              formatter={(value, name) => [
                formatCents(Math.round(Number(value) * 100)),
                name === "actual" ? "Actual" : name === "forecast" ? "Projected" : "Transition",
              ]}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#actualGradient)"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="bridge"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="none"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="url(#forecastGradient)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
