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

/**
 * A currency axis tick: `$450`, `$1.2k`, `$2k`, `$1.4M`.
 *
 * Takes dollars, not cents — the bar charts divide by 100 before they hand
 * anything to Recharts, so an axis formatter that took cents would be given
 * dollars by every caller it has.
 *
 * The k suffix carries one decimal because dropping it is what produced
 * `$0k $0k $1k $1k $2k` on a chart topping out around $2,000: four of those
 * five ticks were wrong, and two pairs of them were identical, so the axis
 * could not be read at all. Values under $1,000 stay in whole dollars for the
 * same reason — `$0k` is not a number anyone can use. A trailing `.0` is
 * dropped so a round thousand reads `$2k` rather than `$2.0k`.
 */
export function formatAxisDollars(dollars: number): string {
  const sign = dollars < 0 ? "−" : "";
  const abs = Math.abs(dollars);

  if (abs >= 1_000_000) return `${sign}$${trimZero(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trimZero(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * A category tick that fits on one line.
 *
 * Recharts wraps tick text when the axis has a `width`, and a wrapped label
 * runs into the slots either side of it — at which point the overlap check
 * hides its neighbours. One long vendor name cost four other bars their
 * labels, which reads as missing data rather than as a label that did not fit.
 * Truncating keeps every bar named; the tooltip still carries the full string.
 */
export function formatTickLabel(name: string, max: number = 13): string {
  const trimmed = name.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
