"use client";

import { formatDollars, formatSignedDollars } from "@/lib/format";
import type { Tone } from "@/lib/tone";

export type { Tone };

interface MetricBanProps {
  label: string;
  /**
   * Cents. Null renders an em dash, which is what a month with no balance
   * history looks like — deliberately not $0, which would be a confident wrong
   * number.
   */
  value: number | null;
  /** Render the headline with an explicit + or −. */
  signed?: boolean;
  valueTone?: Tone;
  detail: string;
  detailTone?: Tone;
}

const TEXT_TONE: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-text-primary",
};

/**
 * Type sizes are set by what fits three-across on a phone, not by taste.
 *
 * At 375px each card gets (375 − 48 page padding − 16 gutters) / 3 ≈ 104px,
 * and p-2.5 leaves about 84px of that for content. Geist semibold runs about
 * 3.8× the font size for a seven-character figure, so $18,341 needs ~69px at
 * 18px (text-lg) and would need ~115px at the desktop 30px — which is why the
 * old unconditional text-3xl overflowed its card. text-lg leaves headroom for
 * a six-figure balance; anything larger does not.
 */
const DETAIL_TONE: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-text-secondary",
};

export function MetricBan({
  label,
  value,
  signed = false,
  valueTone = "neutral",
  detail,
  detailTone = "neutral",
}: MetricBanProps) {
  const headline =
    value === null
      ? "—"
      : signed
        ? formatSignedDollars(value)
        : formatDollars(value);

  return (
    <div className="widget-card p-2 sm:p-5">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-1 font-sans text-base font-semibold tabular-nums tracking-tight sm:mt-2 sm:text-3xl ${TEXT_TONE[valueTone]}`}
      >
        {headline}
      </p>
      <p
        className={`mt-1 text-[10px] leading-tight sm:mt-1.5 sm:text-xs ${DETAIL_TONE[detailTone]}`}
      >
        {detail}
      </p>
    </div>
  );
}
