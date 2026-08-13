import { subMonths, startOfMonth, endOfMonth, format, parse } from "date-fns";
import { SKIP_CATEGORIES, SKIP_INCOME } from "./constants";

export interface MonthEntry {
  monthDate: Date;
  monthKey: string;
  label: string;
  start: Date;
  end: Date;
}

export function generateMonthRange(count: number, anchor?: Date): MonthEntry[] {
  const now = anchor ?? new Date();
  const entries: MonthEntry[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const monthKey = format(monthDate, "yyyy-MM");
    const label = format(monthDate, "MMMM yyyy");
    entries.push({ monthDate, monthKey, label, start, end });
  }
  return entries;
}

/**
 * Resolves which month an API request is asking for.
 *
 * `currentMonthKey` is passed in rather than read here so the resolution stays
 * a pure function. Callers supply `getCurrentMonthKeyET()`.
 *
 * When no month is requested, the current month is used if there is data for
 * it, and otherwise the newest month that has data — early in a month, before
 * a sync has run, the current month is empty.
 */
export function resolveMonth(
  requested: string | null | undefined,
  availableMonths: string[],
  currentMonthKey: string,
): { monthKey: string; monthDate: Date } {
  const defaultMonth = availableMonths.includes(currentMonthKey)
    ? currentMonthKey
    : availableMonths[0];

  const monthKey = requested || defaultMonth;
  return { monthKey, monthDate: parse(monthKey, "yyyy-MM", new Date()) };
}

export function expenseCategoryFilter(): {
  isIncome: false;
  hidden: false;
  name: { notIn: string[] };
} {
  return {
    isIncome: false,
    hidden: false,
    name: { notIn: [...SKIP_CATEGORIES, ...SKIP_INCOME] },
  };
}
