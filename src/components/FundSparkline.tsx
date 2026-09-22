/**
 * A fund's last twelve month-ends, as a line about the size of a word.
 *
 * Inline SVG rather than Recharts, which every other chart here uses. The
 * dashboard draws one of these per fund — nineteen of them — and Recharts
 * brings a responsive container and a resize observer each. This needs a
 * polyline.
 *
 * Deliberately unlabelled: no axes, no ticks, no tooltip. The figure and the
 * change beside it are the numbers; this is only the shape they took. Anything
 * that needs reading belongs in the row, not in a 64-pixel drawing.
 */

/** Drawn at a fixed size and scaled by CSS, so the stroke stays even. */
const WIDTH = 64;
const HEIGHT = 20;
const PADDING = 2;

export interface FundSparklineProps {
  /** Oldest first. Null for a month before the fund's first recorded figure. */
  history: (number | null)[];
  /** Describes the line for anything that cannot see it. */
  label: string;
}

/**
 * The points to draw, or null when there is nothing worth drawing.
 *
 * Exported for its tests. Two rules earn their place here: a single point is
 * not a line — one dot on an empty box reads as a fund that has been flat all
 * year rather than one recorded once — and a fund that genuinely has not moved
 * draws through the middle rather than along the floor, because a flat line at
 * the bottom of the box looks like a fund at zero.
 */
export function sparklinePoints(history: (number | null)[]): string | null {
  const known = history
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);

  if (known.length < 2) return null;

  const values = known.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  // The x axis is the whole window, not just the months with figures, so a
  // fund recorded from June onwards starts halfway across rather than being
  // stretched to fill the box like a fund with a full year.
  const lastIndex = history.length - 1;
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;

  return known
    .map((point) => {
      const x = PADDING + (lastIndex === 0 ? 0 : (point.index / lastIndex) * usableWidth);
      const y =
        span === 0
          ? PADDING + usableHeight / 2
          : PADDING + usableHeight - ((point.value - min) / span) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function FundSparkline({ history, label }: FundSparklineProps) {
  const points = sparklinePoints(history);
  if (points === null) return null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={label}
      className="text-accent"
      // Fixed at its drawn size. A percentage width would let one long fund
      // name squeeze the line to nothing on a narrow card.
      style={{ flex: "0 0 auto" }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Without this the line is clipped flush at the box edge on a fund
        // whose first or last month is its highest.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
