"use client";

import { formatCents } from "@/lib/format";

interface SavingsMetricCardProps {
  monthDelta: number;
  ytdDelta: number;
}

function signed(cents: number): string {
  const sign = cents >= 0 ? "+" : "−";
  return `${sign}${formatCents(Math.abs(cents))}`;
}

export function SavingsMetricCard({ monthDelta, ytdDelta }: SavingsMetricCardProps) {
  const isPositive = monthDelta >= 0;
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";

  return (
    <div className="widget-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-text-primary">Savings</h3>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            This month
          </p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${colorClass}`}>
            {signed(monthDelta)}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            YTD <span className="tabular-nums font-semibold">{signed(ytdDelta)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
