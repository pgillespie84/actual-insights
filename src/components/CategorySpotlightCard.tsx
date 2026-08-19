"use client";

import { formatCents } from "@/lib/format";

interface CategorySpotlightProps {
  name: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
}

export function CategorySpotlightCard({ name, budgeted, spent, remaining, percentUsed }: CategorySpotlightProps) {
  const capped = Math.min(percentUsed, 100);
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - capped / 100);
  const isOver = spent > budgeted && budgeted > 0;
  const strokeColor = isOver
    ? "var(--negative)"
    : percentUsed > 80
      ? "var(--warning-text)"
      : "var(--positive)";
  const glowColor = isOver ? "rgba(244,63,94,0.3)" : percentUsed > 80 ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)";

  return (
    <div className="widget-card p-5">
      <div className="flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-normal text-text-primary">{name}</h3>
          <div className="mt-3 flex gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Budget</p>
              <p className="text-lg font-bold tabular-nums text-text-secondary">{formatCents(budgeted)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Actual</p>
              <p className="text-lg font-bold tabular-nums text-text-secondary">{formatCents(spent)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Remaining</p>
              <p className={`text-lg font-bold tabular-nums ${isOver ? "text-negative" : "text-positive"}`}>
                {isOver ? "-" : ""}{formatCents(Math.abs(remaining))}
              </p>
            </div>
          </div>
        </div>

        {/* Circular progress */}
        <div className="relative h-[72px] w-[72px] flex-shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 72 72">
            <circle
              cx="36" cy="36" r={radius}
              fill="none"
              stroke="var(--card-border)"
              strokeWidth="5"
              opacity="0.4"
            />
            <circle
              cx="36" cy="36" r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                filter: `drop-shadow(0 0 4px ${glowColor})`,
                transition: "stroke-dashoffset 0.8s ease-out",
              }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-text-primary">
            {Math.round(percentUsed)}%
          </span>
        </div>
      </div>
    </div>
  );
}
