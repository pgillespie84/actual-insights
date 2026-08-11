import { formatCents, formatPercent } from "@/lib/format";

interface CategoryData {
  id: string;
  name: string;
  groupName: string | null;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
}

function getStatusColor(percentUsed: number): string {
  if (percentUsed > 100) return "bg-red-500";
  if (percentUsed > 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function getTextColor(remaining: number): string {
  if (remaining < 0) return "text-red-400";
  if (remaining === 0) return "text-text-muted";
  return "text-emerald-400";
}

export function CategoryTable({ categories }: { categories: CategoryData[] }) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">All Categories</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left">
              <th className="pb-3 font-medium text-text-secondary">Category</th>
              <th className="pb-3 text-right font-medium text-text-secondary">Budgeted</th>
              <th className="pb-3 text-right font-medium text-text-secondary">Spent</th>
              <th className="pb-3 text-right font-medium text-text-secondary">Remaining</th>
              <th className="pb-3 pl-4 font-medium text-text-secondary">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {categories.map((cat) => (
              <tr key={cat.id} className="group">
                <td className="py-3">
                  <span className="font-medium text-text-primary">{cat.name}</span>
                  {cat.groupName && (
                    <span className="ml-2 text-xs text-text-muted">{cat.groupName}</span>
                  )}
                </td>
                <td className="py-3 text-right text-text-secondary">
                  {formatCents(cat.budgeted)}
                </td>
                <td className="py-3 text-right text-text-secondary">
                  {formatCents(cat.spent)}
                </td>
                <td className={`py-3 text-right font-medium ${getTextColor(cat.remaining)}`}>
                  {formatCents(cat.remaining)}
                </td>
                <td className="py-3 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-card-border">
                      <div
                        className={`h-1.5 rounded-full ${getStatusColor(cat.percentUsed)} transition-all`}
                        style={{ width: `${Math.min(cat.percentUsed, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-xs text-text-muted">
                      {formatPercent(cat.percentUsed)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
