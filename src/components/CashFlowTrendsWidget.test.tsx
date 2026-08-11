import { test, expect } from "vitest";
import { render } from "@testing-library/react";
import { CashFlowTrendsWidget } from "./CashFlowTrendsWidget";

const stubData = [
  { month: "2026-04", label: "Apr", income: 500000, expenses: 300000 },
];

test("card uses flex-col layout so chart fills available height", () => {
  const { container } = render(<CashFlowTrendsWidget data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  expect(card.className).toMatch(/flex/);
  expect(card.className).toMatch(/flex-col/);
});

test("chart container grows to fill space instead of fixed height", () => {
  const { container } = render(<CashFlowTrendsWidget data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  const chartContainer = card.lastElementChild as HTMLElement;
  expect(chartContainer.className).toMatch(/flex-1/);
  expect(chartContainer.className).toMatch(/min-h-0/);
  expect(chartContainer.className).not.toMatch(/h-56/);
});
