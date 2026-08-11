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

interface SavingsRateData {
  month: string;
  label: string;
  income: number;
  spending: number;
  savingsRate: number;
}

export function SavingsRateTrendChart({ data }: { data: SavingsRateData[] }) {
  const chartData = data.map((d) => ({
    ...d,
    rate: Math.round(d.savingsRate * 100),
  }));

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">
        Savings Rate Trend
      </h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 10, right: 20 }}>
            <defs>
              <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
              formatter={(value) => [`${value}%`, "Savings Rate"]}
            />
            <ReferenceLine
              y={20}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: "20% goal",
                fill: "#f59e0b",
                fontSize: 11,
                position: "right",
              }}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#savingsGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
