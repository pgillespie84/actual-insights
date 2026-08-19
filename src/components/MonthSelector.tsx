"use client";

import { format, parse } from "date-fns";

interface MonthSelectorProps {
  months: string[];
  selected: string;
  onChange: (month: string) => void;
}

export function MonthSelector({ months, selected, onChange }: MonthSelectorProps) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-card-border bg-input-bg px-4 py-2 text-sm font-medium text-text-primary outline-none transition-colors focus:border-accent"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {format(parse(m, "yyyy-MM", new Date()), "MMMM yyyy")}
        </option>
      ))}
    </select>
  );
}
