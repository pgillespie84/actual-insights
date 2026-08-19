"use client";

import { format, parse } from "date-fns";
import { greetingForHour } from "@/lib/greeting";
import { getCurrentHourET } from "@/lib/timezone";

interface DashboardHeaderProps {
  /** From HOUSEHOLD_NAMES — the client cannot read the config itself. */
  household: string;
  monthKey: string;
  lastSync: string | null;
  /** Month selector and email button. Hidden in the print render. */
  controls?: React.ReactNode;
}

export function DashboardHeader({
  household,
  monthKey,
  lastSync,
  controls,
}: DashboardHeaderProps) {
  const monthLabel = format(
    parse(monthKey, "yyyy-MM", new Date()),
    "MMMM yyyy",
  ).toUpperCase();

  const eyebrow = ["HOUSEHOLD", monthLabel];
  if (lastSync) {
    eyebrow.push(`SYNCED ${format(new Date(lastSync), "MMM d, h:mm a")}`);
  }

  return (
    <header className="border-b border-card-border pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow.join(" · ")}</p>
          <h1 className="mt-2 font-serif text-3xl font-normal tracking-tight text-text-primary">
            {greetingForHour(getCurrentHourET())}, {household}
          </h1>
        </div>
        {controls && (
          <div className="flex flex-shrink-0 items-center gap-3">{controls}</div>
        )}
      </div>
    </header>
  );
}
