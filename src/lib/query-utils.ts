import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
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
