import { test, expect } from "vitest";
import {
  formatCents,
  formatDollars,
  formatPercent,
  formatSignedDollars,
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
