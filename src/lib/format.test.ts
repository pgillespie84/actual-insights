import { test, expect } from "vitest";
import { formatCents, formatPercent } from "./format.ts";

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
