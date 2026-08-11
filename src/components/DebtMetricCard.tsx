"use client";

import { formatCents } from "@/lib/format";

interface DebtMetricCardProps {
  monthDelta: number;
  ytdDelta: number;
}

export function DebtMetricCard({ monthDelta, ytdDelta }: DebtMetricCardProps) {
  // monthDelta > 0 means debt was paid down (good, green)
  // monthDelta < 0 means new debt was added (bad, amber)
  const isPaidDown = monthDelta >= 0;
  const colorClass = isPaidDown ? "text-emerald-400" : "text-amber-400";

  const monthLabel = isPaidDown ? "paid down" : "new debt";
  const ytdIsPaidDown = ytdDelta >= 0;
  const ytdLabel = ytdIsPaidDown ? "paid down" : "net new debt";

  return (
    <div className="widget-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-text-primary">Debt</h3>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            This month &middot; {monthLabel}
          </p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${colorClass}`}>
            {formatCents(Math.abs(monthDelta))}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            YTD{" "}
            <span className="tabular-nums font-semibold">
              {ytdLabel} {formatCents(Math.abs(ytdDelta))}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
