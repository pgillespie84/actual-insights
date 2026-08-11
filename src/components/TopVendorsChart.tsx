"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatCents } from "@/lib/format";

interface TopVendorsData {
  payee: string;
  amount: number;
}

export function TopVendorsChart({ data }: { data: TopVendorsData[] }) {
  const chartData = data.slice(0, 10).map((d) => ({
    name: d.payee,
    amount: d.amount / 100,
  }));

  return (
    <div className="widget-card flex flex-col p-6">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Top Vendors</h2>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
          >
            <XAxis
              type="number"
              stroke="var(--text-muted)"
              fontSize={10}
              tick={{ fill: "var(--text-muted)" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="var(--text-muted)"
              fontSize={11}
              tick={{ fill: "var(--text-muted)" }}
              width={100}
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
              formatter={(value) => [formatCents(Math.round(Number(value) * 100)), "Spent"]}
              cursor={{ fill: "var(--hover-bg)", opacity: 0.5 }}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === 0 ? "#f97316" : "#64748b"}
                  fillOpacity={1 - i * 0.06}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
