import { test, expect } from "vitest";
import {
  formatAxisDollars,
  formatCents,
  formatDollars,
  formatPercent,
  formatSignedDollars,
  formatTickLabel,
} from "./format.ts";

test("formatCents formats positive whole dollar amount", () => {
  expect(formatCents(150000)).toBe("$1,500.00");
});

test("formatCents formats amount with cents", () => {
  expect(formatCents(1234)).toBe("$12.34");
});

test("formatCents formats negative amount", () => {
  expect(formatCents(-5099)).toBe("-$50.99");
});

test("formatCents formats zero", () => {
  expect(formatCents(0)).toBe("$0.00");
});

test("formatPercent rounds and appends %", () => {
  expect(formatPercent(42.7)).toBe("43%");
});

test("formatPercent rounds down below .5", () => {
  expect(formatPercent(42.3)).toBe("42%");
});

test("formatPercent handles negative values", () => {
  expect(formatPercent(-12.8)).toBe("-13%");
});

test("formatPercent handles zero", () => {
  expect(formatPercent(0)).toBe("0%");
});

// The BAN row shows whole dollars: cents on a five-figure balance are noise,
// and the reference layout has no room for them.
test("formatDollars drops the cents", () => {
  expect(formatDollars(4825000)).toBe("$48,250");
});

test("formatDollars rounds to the nearest dollar", () => {
  expect(formatDollars(123456)).toBe("$1,235");
});

test("formatDollars formats zero", () => {
  expect(formatDollars(0)).toBe("$0");
});

test("formatDollars formats a negative amount", () => {
  expect(formatDollars(-4825000)).toBe("-$48,250");
});

// A signed figure always carries its sign, including for zero, so a sub-line
// reading "+$0 this month" is unambiguous rather than looking truncated.
test("formatSignedDollars prefixes a plus", () => {
  expect(formatSignedDollars(124000)).toBe("+$1,240");
});

test("formatSignedDollars uses a true minus sign, not a hyphen", () => {
  expect(formatSignedDollars(-64000)).toBe("−$640");
});

test("formatSignedDollars treats zero as positive", () => {
  expect(formatSignedDollars(0)).toBe("+$0");
});

// The axis on Top vendors read "$0k $0k $1k $1k $2k" over a range topping out
// near $2,000: every tick under a thousand collapsed to $0k, and two pairs
// rendered identically, so the axis carried no information at all.
test("formatAxisDollars keeps sub-thousand ticks in whole dollars", () => {
  expect(formatAxisDollars(0)).toBe("$0");
  expect(formatAxisDollars(450)).toBe("$450");
  expect(formatAxisDollars(999)).toBe("$999");
});

test("formatAxisDollars distinguishes ticks a flat k-suffix collapsed", () => {
  expect(formatAxisDollars(1200)).not.toBe(formatAxisDollars(1400));
  expect(formatAxisDollars(1200)).toBe("$1.2k");
  expect(formatAxisDollars(1400)).toBe("$1.4k");
});

test("formatAxisDollars drops a trailing zero on a round thousand", () => {
  expect(formatAxisDollars(2000)).toBe("$2k");
  expect(formatAxisDollars(1_400_000)).toBe("$1.4M");
});

test("formatAxisDollars signs a negative with a true minus", () => {
  expect(formatAxisDollars(-1500)).toBe("−$1.5k");
});

// Picking the unit before rounding let a value just under a boundary round
// across it, so the number and its suffix disagreed: 999,999 printed as
// "$1000k" when it means $1M, and 999.5 as "$1000" when it means $1k.
test("formatAxisDollars promotes a value that rounds across a boundary", () => {
  expect(formatAxisDollars(999_999)).toBe("$1M");
  expect(formatAxisDollars(999.5)).toBe("$1k");
});

test("formatAxisDollars leaves a value that rounds short of the boundary", () => {
  expect(formatAxisDollars(999_499)).toBe("$999.5k");
  expect(formatAxisDollars(999)).toBe("$999");
});

// A wrapped tick label runs into its neighbours' slots, and Recharts responds
// by hiding them — one long name left four bars unlabelled.
test("formatTickLabel leaves a short name alone", () => {
  expect(formatTickLabel("Wegmans")).toBe("Wegmans");
});

test("formatTickLabel truncates a long name to one line", () => {
  const label = formatTickLabel("Soma Physical Therapy and Wellness");
  expect(label).toBe("Soma Physica…");
  expect(label.length).toBe(13);
});

test("formatTickLabel takes a wider budget where the axis has one", () => {
  expect(formatTickLabel("Soma Physical Therapy and Wellness", 18)).toBe(
    "Soma Physical The…",
  );
});
