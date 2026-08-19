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

// This used to require flex-1 and min-h-0, which was right while the card was
// a cell in an equal-height grid row and had a parent height to fill. The card
// is full width now, so flex-1 resolves to zero, ResponsiveContainer measures
// 0x0 and draws nothing at all — verified in a browser, and invisible to a
// test that only reads class names.
test("chart container has an explicit height, not flex-1", () => {
  const { container } = render(<DailySpendingChart data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  const chartContainer = card.lastElementChild as HTMLElement;
  expect(chartContainer.className).toMatch(/\bh-\d+\b/);
  expect(chartContainer.className).not.toMatch(/flex-1/);
});
