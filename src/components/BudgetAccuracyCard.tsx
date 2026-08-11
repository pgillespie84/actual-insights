"use client";

import { formatCents, formatPercent } from "@/lib/format";

interface AccuracyCategory {
  id: string;
  name: string;
  groupName: string | null;
  budgeted: number;
  spent: number;
  deviation: number;
  accurate: boolean;
}

interface BudgetAccuracyCardProps {
  accuracyPercent: number;
  accurateCount: number;
  totalCount: number;
  categories: AccuracyCategory[];
}

export function BudgetAccuracyCard({
  accuracyPercent,
  accurateCount,
  totalCount,
  categories,
}: BudgetAccuracyCardProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">Budget Accuracy</h3>

      <div className="mb-6 flex items-baseline gap-3">
        <span className="text-5xl font-bold tracking-tight text-text-primary">
          {formatPercent(accuracyPercent)}
        </span>
        <span className="text-sm text-text-secondary">
          {accurateCount} of {totalCount} categories within 10%
        </span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {cat.accurate ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 flex-shrink-0 text-emerald-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 flex-shrink-0 text-red-400"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              )}
              <span className="truncate text-text-secondary">{cat.name}</span>
              {cat.groupName && (
                <span className="hidden text-xs text-text-muted sm:inline">
                  {cat.groupName}
                </span>
              )}
            </div>
            <div className="ml-4 text-right text-xs text-text-secondary whitespace-nowrap">
              {formatCents(cat.spent)} / {formatCents(cat.budgeted)}
              <span className={`ml-2 ${cat.accurate ? "text-emerald-400" : "text-red-400"}`}>
                {cat.deviation <= 0.01
                  ? "spot on"
                  : `${formatPercent(cat.deviation * 100)} off`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
