import { describe, it, expect } from "vitest";
import { sparklinePoints } from "./FundSparkline";

/**
 * The geometry, which is the only part of a sparkline that can be wrong in a
 * way nobody notices. A line drawn from the wrong numbers still looks like a
 * line.
 */

const FULL_YEAR = (values: number[]) => values;

describe("sparklinePoints", () => {
  it("draws nothing for a fund with one figure", () => {
    // A single dot in an empty box reads as a year of flat line, which is the
    // opposite of what one recorded month means.
    expect(sparklinePoints([null, null, 5000])).toBeNull();
    expect(sparklinePoints([])).toBeNull();
    expect(sparklinePoints([null, null])).toBeNull();
  });

  it("draws a flat fund through the middle, not along the floor", () => {
    // Along the floor is where a fund at zero would sit, and these two must
    // not look the same.
    const points = sparklinePoints(FULL_YEAR([5000, 5000, 5000]));

    const ys = points!.split(" ").map((p) => Number(p.split(",")[1]));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeCloseTo(10, 1);
  });

  it("puts the highest month at the top and the lowest at the bottom", () => {
    const points = sparklinePoints(FULL_YEAR([100, 900, 500]))!;
    const ys = points.split(" ").map((p) => Number(p.split(",")[1]));

    // SVG y grows downward, so the largest value has the smallest y.
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[0]);
  });

  it("holds a negative fund's shape", () => {
    // Several of these funds go negative. Clamping at zero, or treating a
    // negative as missing, would flatten the part worth looking at.
    const points = sparklinePoints(FULL_YEAR([-25382, -10000, 14214]))!;
    const ys = points.split(" ").map((p) => Number(p.split(",")[1]));

    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
  });

  it("starts a part-year fund partway across, not stretched over the box", () => {
    // Otherwise a fund first recorded in November looks like one with a full
    // year of history.
    const history = [null, null, null, null, null, null, null, null, 100, 200, 300, 400];
    const points = sparklinePoints(history)!;
    const xs = points.split(" ").map((p) => Number(p.split(",")[0]));

    expect(xs).toHaveLength(4);
    // Eight of twelve months in: past halfway, and the last point still ends
    // at the right edge.
    expect(xs[0]).toBeGreaterThan(32);
    expect(xs[xs.length - 1]).toBeCloseTo(62, 0);
  });

  it("skips a gap in the middle rather than drawing through zero", () => {
    const points = sparklinePoints([100, null, 300])!;

    expect(points.split(" ")).toHaveLength(2);
  });
});
