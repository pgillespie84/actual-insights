"use client";

import { formatCents } from "@/lib/format";

interface TopExpenseCategoriesProps {
  categories: Array<{ name: string; amount: number }>;
}

/**
 * The categorical ramp, straight off the shared chart tokens so this widget,
 * the spending chart and the vendors chart read as one palette in both themes.
 */
const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function TopExpenseCategoriesWidget({ categories }: TopExpenseCategoriesProps) {
  const maxAmount = categories.length > 0 ? categories[0].amount : 1;

  return (
    <div className="widget-card p-6">
      <h2 className="mb-5 font-serif text-lg font-normal text-text-primary">Top categories</h2>
      <div className="space-y-4">
        {categories.map((cat, i) => {
          const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          const widthPercent = (cat.amount / maxAmount) * 100;

          return (
            <div key={cat.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-medium text-text-secondary">{cat.name}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {formatCents(cat.amount)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-hover-bg">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${widthPercent}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
