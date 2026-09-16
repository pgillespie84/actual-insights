// Its own file because vi.mock is module-scoped: the sibling test renders the
// same component without a size and asserts on the card's classes, which the
// mock would change out from under it.
import { test, expect, vi } from "vitest";
import { cloneElement, isValidElement } from "react";
import { render, screen } from "@testing-library/react";

// ResponsiveContainer measures its parent, and jsdom reports every element as
// 0x0, so the chart renders nothing at all under test. Handing the child a
// fixed size is the smallest thing that lets the real axis code run — and the
// axis is exactly what regressed: bars went unlabelled next to a name long
// enough to wrap.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
            width: 600,
            height: 400,
          })
        : null,
  };
});

const { TopVendorsChart } = await import("./TopVendorsChart");

const data = [
  { payee: "Soma Physical Therapy and Wellness", amount: 210000 },
  { payee: "Wegmans", amount: 120000 },
  { payee: "LegalZoom", amount: 90000 },
  { payee: "Acorns", amount: 80000 },
  { payee: "Hershey Park", amount: 70000 },
  { payee: "Costco", amount: 60000 },
  { payee: "Target", amount: 50000 },
  { payee: "Kroger", amount: 40000 },
  { payee: "Shell", amount: 30000 },
  { payee: "Netflix", amount: 20000 },
];

test("every bar keeps its label, long names included", () => {
  render(<TopVendorsChart data={data} />);

  expect(screen.getByText("Soma Physica…")).toBeInTheDocument();
  for (const name of ["Wegmans", "LegalZoom", "Acorns", "Hershey Park", "Costco", "Target", "Kroger", "Shell", "Netflix"]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
});

test("the value axis reads in dollars, with no repeated tick", () => {
  const { container } = render(<TopVendorsChart data={data} />);
  // Every tick on both axes; the value axis is the one whose labels start "$".
  const ticks = [...container.querySelectorAll("text")]
    .map((t) => t.textContent ?? "")
    .filter((label) => label.startsWith("$"));

  expect(ticks.length).toBeGreaterThan(1);
  expect(ticks).not.toContain("$0k");
  expect(new Set(ticks).size).toBe(ticks.length);
});
