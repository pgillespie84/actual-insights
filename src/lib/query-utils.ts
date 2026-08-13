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
 *
 * With no data at all there is no newest month either, so the current month is
 * used and the dashboard renders empty. Anything else made `parse()` throw on
 * an undefined key.
 *
 * `requested` arrives from a query parameter, so a value that is not a
 * `YYYY-MM` key is ignored rather than parsed into NaN dates.
 */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveMonth(
  requested: string | null | undefined,
  availableMonths: string[],
  currentMonthKey: string,
): { monthKey: string; monthDate: Date } {
  const defaultMonth = availableMonths.includes(currentMonthKey)
    ? currentMonthKey
    : (availableMonths[0] ?? currentMonthKey);

  const monthKey =
    requested && MONTH_KEY.test(requested) ? requested : defaultMonth;
  return { monthKey, monthDate: parse(monthKey, "yyyy-MM", new Date()) };
}

/**
 * `items.map(fn)` with at most `limit` running at a time, results in input
 * order.
 *
 * The month loops in queries.ts issue one or two queries per month, and
 * /api/analytics runs several of those loops at once. Firing every month
 * together asked the Prisma pool for more connections than it has, so the
 * surplus queued against the 10s pool_timeout. Bounding the fan-out keeps most
 * of the latency win without depending on connection_limit being tuned to it.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Months queried at once inside a single fan-out loop. */
export const MONTH_QUERY_CONCURRENCY = 4;

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
