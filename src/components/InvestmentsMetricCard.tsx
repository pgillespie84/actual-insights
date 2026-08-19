"use client";

import { formatCents } from "@/lib/format";

interface InvestmentsMetricCardProps {
  monthDelta: number | null;
  ytdDelta: number | null;
}

function signed(cents: number | null): string {
  // Null means no snapshot history for the period, which is not the same as
  // no movement — see BalanceCoverage in accountSnapshots.ts.
  if (cents === null) return "\u2014";
  const sign = cents >= 0 ? "+" : "\u2212";
  return `${sign}${formatCents(Math.abs(cents))}`;
}

export function InvestmentsMetricCard({ monthDelta, ytdDelta }: InvestmentsMetricCardProps) {
  const isPositive = monthDelta === null || monthDelta >= 0;
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";

  return (
    <div className="widget-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-text-primary">Investments</h3>
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
