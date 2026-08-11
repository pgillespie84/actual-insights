"use client";

import { format } from "date-fns";
import { formatCents } from "@/lib/format";

interface Transaction {
  id: string;
  date: string;
  payee: string | null;
  amount: number;
  categoryName: string | null;
  groupName: string | null;
  isIncome: boolean;
}

export function RecentTransactionsWidget({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="widget-card p-6">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Transactions</h2>
      <div className="space-y-0.5">
        {transactions.map((tx) => {
          const isPositive = tx.amount > 0;
          return (
            <div
              key={tx.id}
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-hover-bg"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-card-border/50 text-xs font-medium text-text-muted">
                  {format(new Date(tx.date), "d")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {tx.payee || "Unknown"}
                  </p>
                  {tx.categoryName && (
                    <p className="text-xs text-text-muted">{tx.categoryName}</p>
                  )}
                </div>
              </div>
              <span
                className={`ml-3 whitespace-nowrap text-sm font-semibold tabular-nums ${
                  isPositive ? "text-emerald-400" : "text-text-primary"
                }`}
              >
                {isPositive ? "+" : ""}{formatCents(Math.abs(tx.amount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
