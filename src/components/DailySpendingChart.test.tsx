import { test, expect } from "vitest";
import { render } from "@testing-library/react";
import { DailySpendingChart } from "./DailySpendingChart";

const stubData = {
  currentMonth: [{ day: 1, cumulative: 10000 }],
  previousMonth: [{ day: 1, cumulative: 8000 }],
  currentLabel: "May",
  previousLabel: "Apr",
};

// flex-col still matters, but not for the chart's height any more: it stacks
// the title, the total and the chart. The chart itself is a fixed height, which
// the test below pins.
test("card stacks its title, total and chart in a column", () => {
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
  // Anchored on the whole class token deliberately: /\bh-\d+\b/ also matches
  // min-h-0 and max-h-96, because the hyphen before the h is a word boundary.
  // That would let a container classed min-h-0 alone pass while reproducing the
  // exact zero-height bug this asserts against.
  expect(chartContainer.className).toMatch(/(?:^|\s)h-\d+(?:\s|$)/);
  expect(chartContainer.className).not.toMatch(/flex-1/);
});
