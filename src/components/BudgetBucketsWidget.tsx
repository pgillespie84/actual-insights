"use client";

import { useState } from "react";
import { formatCents } from "@/lib/format";

interface BucketCategory {
  name: string;
  budgeted: number;
  spent: number;
  isBusiness: boolean;
}

interface BucketGroup {
  name: string;
  budgeted: number;
  spent: number;
  categories: BucketCategory[];
}

interface Bucket {
  name: string;
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  groups: BucketGroup[];
}

export function BudgetBucketsWidget({ buckets, monthLabel }: { buckets: Bucket[]; monthLabel: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Budget</h2>
        <span className="text-sm text-text-muted">{monthLabel}</span>
      </div>
      <div className="space-y-5">
        {buckets.map((bucket) => (
          <BucketRow key={bucket.name} bucket={bucket} />
        ))}
      </div>
    </div>
  );
}

function BucketRow({ bucket }: { bucket: Bucket }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.min(bucket.percentUsed, 100);
  const overBudget = bucket.totalSpent > bucket.totalBudgeted;
  const barColor = overBudget
    ? "bg-red-500"
    : bucket.percentUsed > 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium text-text-primary">{bucket.name}</span>
          <span className="text-sm text-text-secondary">
            {formatCents(bucket.totalBudgeted)} budget
          </span>
        </div>
        <div className="mb-1 h-3 w-full overflow-hidden rounded-full bg-card-border">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-text-secondary">
            {formatCents(bucket.totalSpent)} spent
          </span>
          <span className={overBudget ? "text-red-400" : "text-text-secondary"}>
            {formatCents(Math.abs(bucket.remaining))} {overBudget ? "over" : "remaining"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-l-2 border-card-border pl-4">
          {bucket.groups.map((group) => (
            <div key={group.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-text-secondary">{group.name}</span>
                <span className="text-text-muted">
                  {formatCents(group.spent)} / {formatCents(group.budgeted)}
                </span>
              </div>
              {group.categories
                .filter((c) => c.spent > 0 || c.budgeted > 0)
                .map((cat) => (
                  <div key={cat.name} className="flex justify-between py-0.5 pl-3 text-xs">
                    <span className="text-text-muted">
                      {cat.name}
                      {cat.isBusiness && (
                        <span className="ml-1.5 inline-block rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          BIZ
                        </span>
                      )}
                    </span>
                    <span className={cat.spent > cat.budgeted && cat.budgeted > 0 ? "text-red-400" : "text-text-muted"}>
                      {formatCents(cat.spent)}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
