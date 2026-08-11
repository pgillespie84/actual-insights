import { formatCents } from "@/lib/format";

interface OverspenderData {
  id: string;
  name: string;
  groupName: string | null;
  overMonths: number;
  totalOver: number;
  totalMonths: number;
  frequency: string;
}

export function ChronicOverspenders({
  data,
  onSelect,
}: {
  data: OverspenderData[];
  onSelect: (id: string, name: string) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-card-bg p-6">
        <h3 className="mb-4 text-lg font-semibold text-text-primary">
          Chronic Overspenders
        </h3>
        <div className="flex items-center gap-2 text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">No chronic overspending detected!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h3 className="mb-1 text-lg font-semibold text-text-primary">
        Chronic Overspenders
      </h3>
      <p className="mb-4 text-sm text-text-secondary">
        Categories over budget in 2+ of the last 6 months
      </p>
      <div className="space-y-3">
        {data.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id, item.name)}
            className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-hover-bg"
          >
            <div>
              <span className="text-sm font-medium text-text-primary">{item.name}</span>
              {item.groupName && (
                <span className="ml-2 text-xs text-text-muted">{item.groupName}</span>
              )}
              <div className="mt-1 flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                  {item.frequency}
                </span>
                <span className="text-xs text-text-muted">
                  {formatCents(item.totalOver)} total overspend
                </span>
              </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
