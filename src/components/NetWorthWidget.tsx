"use client";

import { useState } from "react";
import { formatCents } from "@/lib/format";

interface AccountInfo {
  name: string;
  balance: number;
}

interface NetWorthGroup {
  name: string;
  total: number;
  accounts: AccountInfo[];
  isDebt: boolean;
}

interface NetWorthData {
  totalNetWorth: number;
  totalAssets: number;
  totalDebt: number;
  groups: NetWorthGroup[];
}

export function NetWorthWidget({ data }: { data: NetWorthData }) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-6">
      <h2 className="mb-1 text-lg font-semibold text-text-primary">Net Worth</h2>
      <p className="mb-5 text-3xl font-bold text-text-primary">
        {formatCents(data.totalNetWorth)}
      </p>
      <div className="mb-4 flex gap-4 text-sm">
        <div>
          <span className="text-text-muted">Assets </span>
          <span className="font-medium text-emerald-400">{formatCents(data.totalAssets)}</span>
        </div>
        <div>
          <span className="text-text-muted">Debt </span>
          <span className="font-medium text-red-400">{formatCents(data.totalDebt)}</span>
        </div>
      </div>
      <div className="space-y-1">
        {data.groups.map((group) => (
          <GroupRow key={group.name} group={group} />
        ))}
      </div>
    </div>
  );
}

function GroupRow({ group }: { group: NetWorthGroup }) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = group.accounts.length > 1;

  return (
    <div>
      <button
        onClick={() => hasMultiple && setExpanded(!expanded)}
        className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm ${
          hasMultiple ? "hover:bg-hover-bg cursor-pointer" : "cursor-default"
        } transition-colors`}
      >
        <span className="flex items-center gap-2 text-text-secondary">
          {hasMultiple && (
            <span className="text-xs text-text-muted">{expanded ? "▾" : "▸"}</span>
          )}
          {group.name}
        </span>
        <span className={`font-medium ${group.isDebt ? "text-red-400" : "text-text-primary"}`}>
          {group.isDebt ? `-${formatCents(Math.abs(group.total))}` : formatCents(group.total)}
        </span>
      </button>
      {expanded && (
        <div className="mb-1 space-y-0.5 pl-8">
          {group.accounts.map((acct) => (
            <div key={acct.name} className="flex justify-between px-2 py-1 text-xs">
              <span className="text-text-muted">{acct.name}</span>
              <span className={group.isDebt ? "text-red-400" : "text-text-muted"}>
                {group.isDebt && acct.balance < 0 ? `-${formatCents(Math.abs(acct.balance))}` : formatCents(acct.balance)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
