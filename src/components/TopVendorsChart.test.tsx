import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopVendorsChart } from "./TopVendorsChart";

const stubData = [
  { payee: "Costco", amount: 45000 },
  { payee: "Target", amount: 32000 },
  { payee: "Kroger", amount: 18000 },
];

test("renders the Top vendors heading", () => {
  render(<TopVendorsChart data={stubData} />);
  expect(screen.getByText("Top vendors")).toBeInTheDocument();
});

test("card uses flex-col layout", () => {
  const { container } = render(<TopVendorsChart data={stubData} />);
  const card = container.firstElementChild as HTMLElement;
  expect(card.className).toMatch(/flex/);
  expect(card.className).toMatch(/flex-col/);
});
