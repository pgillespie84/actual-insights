"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCents } from "@/lib/format";

interface CashFlowTrendsProps {
  data: Array<{ month: string; label: string; income: number; expenses: number }>;
}

export function CashFlowTrendsWidget({ data }: CashFlowTrendsProps) {
  const chartData = data.map((d) => ({
    label: d.label,
    Income: d.income / 100,
    Expenses: -(d.expenses / 100),
    Net: (d.income - d.expenses) / 100,
  }));

  return (
    <div className="widget-card flex flex-col p-6">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Cash Flow</h2>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }} barGap={2}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={11}
              tick={{ fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={10}
              tick={{ fill: "var(--text-muted)" }}
              tickFormatter={(v) => {
                const abs = Math.abs(v);
                return abs >= 1000 ? `$${(abs / 1000).toFixed(0)}k` : `$${abs}`;
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg-solid)",
                border: "1px solid var(--card-border)",
                borderRadius: "10px",
                color: "var(--text-primary)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                fontSize: "12px",
              }}
              formatter={(value, name) => {
                const cents = Math.round(Math.abs(Number(value)) * 100);
                const formatted = formatCents(cents);
                if (name === "Net") {
                  const prefix = Number(value) < 0 ? "−" : "";
                  return [`${prefix}${formatted}`, name];
                }
                return [formatted, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "var(--text-muted)", paddingTop: "8px" }}
              iconType="square"
            />
            <Bar dataKey="Income" fill="url(#incomeGrad)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenses" fill="url(#expenseGrad)" radius={[0, 0, 4, 4]} />
            <Line
              type="monotone"
              dataKey="Net"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#a855f7", strokeWidth: 2, stroke: "var(--card-bg-solid)" }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
