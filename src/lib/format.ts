export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Whole dollars, no cents. Used for the headline numbers in the metric row,
 * where two decimal places on a five-figure balance are noise.
 */
export function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Whole dollars carrying an explicit sign, e.g. `+$1,240` or `−$640`.
 *
 * The negative uses a true minus sign (U+2212) rather than a hyphen, matching
 * the rest of the dashboard. Zero is signed as positive so a sub-line reading
 * `+$0 this month` is unambiguous rather than looking truncated.
 */
export function formatSignedDollars(cents: number): string {
  const sign = cents >= 0 ? "+" : "−";
  return `${sign}${formatDollars(Math.abs(cents))}`;
}
