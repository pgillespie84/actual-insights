"use client";

import { formatDollars, formatSignedDollars } from "@/lib/format";

export type Tone = "positive" | "negative" | "neutral";

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
    <div className="widget-card p-5">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-2 font-sans text-3xl font-semibold tabular-nums tracking-tight ${TEXT_TONE[valueTone]}`}
      >
        {headline}
      </p>
      <p className={`mt-1.5 text-xs ${DETAIL_TONE[detailTone]}`}>{detail}</p>
    </div>
  );
}
