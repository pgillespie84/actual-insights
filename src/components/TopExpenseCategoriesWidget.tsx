"use client";

import { formatCents } from "@/lib/format";

interface TopExpenseCategoriesProps {
  categories: Array<{ name: string; amount: number }>;
}

const CATEGORY_COLORS = [
  { bg: "bg-emerald-500/20", bar: "from-emerald-500 to-emerald-400", text: "text-emerald-400" },
  { bg: "bg-cyan-500/20", bar: "from-cyan-500 to-cyan-400", text: "text-cyan-400" },
  { bg: "bg-amber-500/20", bar: "from-amber-500 to-amber-400", text: "text-amber-400" },
  { bg: "bg-violet-500/20", bar: "from-violet-500 to-violet-400", text: "text-violet-400" },
  { bg: "bg-rose-500/20", bar: "from-rose-500 to-rose-400", text: "text-rose-400" },
];

export function TopExpenseCategoriesWidget({ categories }: TopExpenseCategoriesProps) {
  const maxAmount = categories.length > 0 ? categories[0].amount : 1;

  return (
    <div className="widget-card p-6">
      <h2 className="mb-5 text-lg font-semibold text-text-primary">Top Categories</h2>
      <div className="space-y-4">
        {categories.map((cat, i) => {
          const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          const widthPercent = (cat.amount / maxAmount) * 100;

          return (
            <div key={cat.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.bg} ring-2 ring-current ${color.text}`} />
                  <span className="text-sm font-medium text-text-secondary">{cat.name}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {formatCents(cat.amount)}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-card-border/30">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${color.bar} transition-all duration-700 ease-out`}
                  style={{
                    width: `${widthPercent}%`,
                    boxShadow: "0 0 6px rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
