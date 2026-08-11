import { test, expect } from "vitest";
import { render } from "@testing-library/react";
import { DailySpendingChart } from "./DailySpendingChart";

const stubData = {
  currentMonth: [{ day: 1, cumulative: 10000 }],
  previousMonth: [{ day: 1, cumulative: 8000 }],
  currentLabel: "May",
  previousLabel: "Apr",
};

test("card uses flex-col layout so chart fills available height", () => {
  const { container } = render(<DailySpendingChart data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  expect(card.className).toMatch(/flex/);
  expect(card.className).toMatch(/flex-col/);
});

test("chart container grows to fill space instead of fixed height", () => {
  const { container } = render(<DailySpendingChart data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  const chartContainer = card.querySelector("[data-testid='chart-area']") || card.lastElementChild as HTMLElement;
  expect(chartContainer!.className).toMatch(/flex-1/);
  expect(chartContainer!.className).toMatch(/min-h-0/);
  expect(chartContainer!.className).not.toMatch(/h-52/);
});
