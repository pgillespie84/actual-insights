/**
 * Parsing for the stored insight text.
 *
 * The generator writes a `HEADLINE:` line and a `LOOKAHEAD:` line ahead of its
 * bullets. Both are optional here on purpose: every insight written before that
 * prompt change is bullets alone, and those have to keep rendering rather than
 * coming out blank. A missing headline is a fallback, not an error.
 */

export interface ParsedInsight {
  headline: string | null;
  lookahead: string | null;
  bullets: string[];
}

export interface Segment {
  text: string;
  /** A currency amount or a percentage, which the card renders in bold. */
  isFigure: boolean;
}

/** `$1,234.56` or `12.5%`, with or without the decimal part. */
const FIGURE = /\$\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?%/g;

const BULLET = /^\s*[-*•]\s*/;
/** Tolerates `HEADLINE:`, `**Headline:**` and a bulleted variant of either. */
const LABEL = /^\s*[-*•]?\s*\**\s*(headline|lookahead)\s*:?\**\s*:?\s*/i;

function labelOf(line: string): "headline" | "lookahead" | null {
  const match = line.match(LABEL);
  if (!match) return null;
  return match[1].toLowerCase() as "headline" | "lookahead";
}

export function parseInsight(content: string): ParsedInsight {
  const lines = content.split("\n");

  let headline: string | null = null;
  let lookahead: string | null = null;
  const bullets: string[] = [];

  // Which label the previous line opened, so a wrapped sentence continues into
  // the same field instead of being dropped.
  let open: "headline" | "lookahead" | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.length === 0) {
      open = null;
      continue;
    }

    const label = labelOf(line);
    if (label) {
      const value = line.replace(LABEL, "").trim();
      if (label === "headline") headline = value;
      else lookahead = value;
      open = label;
      continue;
    }

    if (BULLET.test(line)) {
      open = null;
      bullets.push(line.replace(BULLET, "").trim());
      continue;
    }

    if (open === "headline" && headline !== null) {
      headline = `${headline} ${line}`.trim();
      continue;
    }
    if (open === "lookahead" && lookahead !== null) {
      lookahead = `${lookahead} ${line}`.trim();
      continue;
    }

    // A plain line with no label and no bullet marker. Older insights were
    // asked for bullets and sometimes wrote none, so this keeps their text.
    bullets.push(line);
  }

  return { headline, lookahead, bullets };
}

/**
 * Split text into runs, marking the currency amounts and percentages.
 *
 * The card bolds them itself rather than asking the model for markdown: it is
 * deterministic, needs no rendering path for model-controlled markup, and the
 * text stored stays plain for the email and PDF paths.
 */
export function splitFigures(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(FIGURE)) {
    const start = match.index;
    if (start > last) {
      segments.push({ text: text.slice(last, start), isFigure: false });
    }
    segments.push({ text: match[0], isFigure: true });
    last = start + match[0].length;
  }

  if (last < text.length) {
    segments.push({ text: text.slice(last), isFigure: false });
  }

  return segments;
}
