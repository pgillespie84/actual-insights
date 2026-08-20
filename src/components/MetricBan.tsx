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

const DETAIL_TONE: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-text-secondary",
};

/**
 * Type sizes are set by what fits three-across on a phone, not by taste.
 *
 * The row stays three columns at every width — stacking pushes the spending
 * chart below a screen of header — so the figures have to fit a phone column.
 * At 375px each card gets (375 − 32 page padding − 16 gutters) / 3 ≈ 109px,
 * and p-2 leaves about 93px of that for content. Measured in the browser at
 * that width: "$18,341" is 61px at text-base and "$1,182,341" is 84px, where
 * the desktop text-3xl would need about 115px. That 30px size at every width
 * is what used to overflow the cards.
 *
 * text-base is therefore the ceiling, not a preference. Narrower phones make
 * it tighter still — a 320px screen leaves 73px, under the 92px a signed
 * seven-figure value needs — so the headline truncates rather than spilling
 * back out of its card.
 */
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
        className={`mt-1 truncate font-sans text-base font-semibold tabular-nums tracking-tight sm:mt-2 sm:text-3xl ${TEXT_TONE[valueTone]}`}
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
