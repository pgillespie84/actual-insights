"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCents } from "@/lib/format";

interface DailySpendingData {
  currentMonth: Array<{ day: number; cumulative: number }>;
  previousMonth: Array<{ day: number; cumulative: number }>;
  currentLabel: string;
  previousLabel: string;
}

export function DailySpendingChart({ data }: { data: DailySpendingData }) {
  const currentMap = new Map(data.currentMonth.map((d) => [d.day, d.cumulative]));
  const prevMap = new Map(data.previousMonth.map((d) => [d.day, d.cumulative]));

  const sortedDays = Array.from({ length: 31 }, (_, i) => i + 1);
  const maxCurrentDay = data.currentMonth.length
    ? data.currentMonth[data.currentMonth.length - 1].day
    : 0;
  let lastCurrent = 0;
  let lastPrev = 0;
  const chartData = sortedDays.map((day) => {
    if (currentMap.has(day)) lastCurrent = currentMap.get(day)!;
    if (prevMap.has(day)) lastPrev = prevMap.get(day)!;
    const currentValue = day <= maxCurrentDay && lastCurrent > 0 ? lastCurrent / 100 : null;
    return {
      day: `${day}`,
      [data.currentLabel]: currentValue,
      [data.previousLabel]: lastPrev > 0 ? lastPrev / 100 : null,
    };
  });

  const maxDay = Math.max(
    ...data.currentMonth.map((d) => d.day),
    ...data.previousMonth.map((d) => d.day),
    1
  );
  const trimmedData = chartData.slice(0, Math.min(maxDay + 1, 31));

  // Current total for display
  const currentTotal = data.currentMonth.length > 0
    ? data.currentMonth[data.currentMonth.length - 1].cumulative
    : 0;

  return (
    <div className="widget-card flex flex-col p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-serif text-lg font-normal text-text-primary">Spending</h2>
      </div>
      <p className="mb-1 text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
        {formatCents(currentTotal)}
      </p>
      <p className="mb-4 text-xs text-text-muted">This month vs. last month</p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trimmedData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              stroke="var(--text-muted)"
              fontSize={10}
              tick={{ fill: "var(--text-muted)" }}
              interval={5}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={10}
              tick={{ fill: "var(--text-muted)" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const current = payload.find((p) => p.dataKey === data.currentLabel)?.value as number | null | undefined;
                const previous = payload.find((p) => p.dataKey === data.previousLabel)?.value as number | null | undefined;
                const hasCurrent = current != null;
                const hasPrevious = previous != null;
                const variance = hasCurrent && hasPrevious ? (current as number) - (previous as number) : null;
                const varianceColor = variance == null ? "" : variance > 0 ? "text-negative" : "text-positive";
                const varianceSign = variance == null ? "" : variance > 0 ? "+" : variance < 0 ? "−" : "";
                return (
                  <div
                    className="rounded-[10px] border border-card-border bg-card-bg-solid px-3 py-2 text-xs shadow-sm"
                  >
                    <div className="mb-1 font-medium text-text-secondary">Day {label}</div>
                    {hasCurrent && (
                      <div className="flex items-center justify-between gap-4 tabular-nums">
                        <span className="text-text-muted">{data.currentLabel}</span>
                        <span className="font-medium text-text-primary">{formatCents(Math.round((current as number) * 100))}</span>
                      </div>
                    )}
                    {hasPrevious && (
                      <div className="flex items-center justify-between gap-4 tabular-nums">
                        <span className="text-text-muted">{data.previousLabel}</span>
                        <span className="text-text-secondary">{formatCents(Math.round((previous as number) * 100))}</span>
                      </div>
                    )}
                    {variance != null && (
                      <div className="mt-1 flex items-center justify-between gap-4 border-t border-card-border pt-1 tabular-nums">
                        <span className="text-text-muted">Variance</span>
                        <span className={`font-semibold ${varianceColor}`}>
                          {varianceSign}{formatCents(Math.round(Math.abs(variance) * 100))}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "var(--text-muted)", paddingTop: "8px" }}
              iconType="line"
            />
            <Area
              type="monotone"
              dataKey={data.previousLabel}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              fill="none"
              strokeWidth={1.5}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey={data.currentLabel}
              stroke="var(--chart-1)"
              fill="url(#spendingGradient)"
              strokeWidth={2.5}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
