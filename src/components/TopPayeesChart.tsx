"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/format";

interface PayeeData {
  payee: string;
  amount: number;
}

export function TopPayeesChart({ data }: { data: PayeeData[] }) {
  const chartData = data.map((d) => ({
    name: d.payee.length > 20 ? d.payee.slice(0, 18) + "..." : d.payee,
    fullName: d.payee,
    amount: d.amount / 100,
  }));

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">Top Payees</h3>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 20, right: 20 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              stroke="var(--text-muted)"
              fontSize={12}
              tick={{ fill: "var(--text-secondary)" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
              formatter={(value) => formatCents(Number(value) * 100)}
              labelFormatter={(_label, payload) => {
                if (payload && payload.length > 0) {
                  return payload[0].payload.fullName;
                }
                return _label;
              }}
            />
            <Bar
              dataKey="amount"
              fill="#06b6d4"
              fillOpacity={0.8}
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
