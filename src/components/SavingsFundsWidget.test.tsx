import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SavingsFundsWidget } from "./SavingsFundsWidget";
import type { FundGroup } from "@/lib/savingsFunds";

/**
 * What the widget is allowed to claim.
 *
 * Every figure here was typed in by hand and some of it is months old, so the
 * things worth pinning are the ones that stop an old figure reading as a
 * fresh one, and a first entry reading as a fund that held steady.
 */

afterEach(cleanup);

const groups: FundGroup[] = [
  {
    group: "Short Term",
    total: 1183910,
    carriedCount: 1,
    funds: [
      {
        id: "a",
        name: "General Savings",
        group: "Short Term",
        archivedFrom: null,
        balance: 873922,
        asOf: "2026-09",
        carried: false,
        entered: true,
        change: 486056,
        dormant: false,
        synced: false,
        history: [387866, 873922],
      },
      {
        id: "b",
        name: "Car Repair Fund",
        group: "Short Term",
        archivedFrom: null,
        balance: 309988,
        asOf: "2026-06",
        carried: true,
        entered: false,
        // Null, not 0: getFundGroups claims no change for a carried figure,
        // because both months resolve to the same old entry.
        change: null,
        dormant: false,
        synced: false,
        history: [309988, 309988],
      },
      {
        id: "c",
        name: "Craft Fund",
        group: "Short Term",
        archivedFrom: null,
        balance: 5000,
        asOf: "2026-09",
        carried: false,
        entered: true,
        change: null,
        dormant: false,
        synced: false,
        history: [null, 5000],
      },
    ],
  },
];

test("a carried figure says which month it is from", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  // Without this the fund reads as checked this month, and the section
  // quietly becomes fiction.
  expect(screen.getByText("as of Jun")).toBeInTheDocument();
});

test("a carried figure from another year keeps the year", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2027-02" />);

  expect(screen.getByText("as of Jun 2026")).toBeInTheDocument();
});

test("a figure entered for the month carries no marker", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  expect(screen.queryByText(/as of Sep/)).not.toBeInTheDocument();
});

test("a fund with nothing to compare against shows a dash, not +$0", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  // +$0 would say the fund held steady. It did not — it had not started.
  expect(screen.queryByText("+$0")).not.toBeInTheDocument();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

test("the group total is shown and no grand total is invented", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  expect(screen.getByText("$11,839.10")).toBeInTheDocument();
});

test("a month before anyone recorded anything says so rather than vanishing", () => {
  // A section that disappears reads as a broken page.
  const empty: FundGroup[] = [
    {
      group: "Short Term",
      total: 0,
      carriedCount: 0,
      funds: [
        {
          ...groups[0].funds[0],
          balance: null,
          asOf: null,
          carried: false,
          entered: false,
          change: null,
          dormant: false,
          synced: false,
          history: [null, null],
        },
      ],
    },
  ];
  render(<SavingsFundsWidget groups={empty} monthKey="2025-01" />);

  expect(screen.getByText("No fund balances recorded for 2025-01.")).toBeInTheDocument();
});

test("a dormant fund is left out of the list but named underneath", () => {
  // Silently dropping a row from a financial page is how a total stops
  // matching what is above it, so the fund is named rather than just gone.
  const withDormant: FundGroup[] = [
    {
      ...groups[0],
      funds: [
        ...groups[0].funds,
        {
          ...groups[0].funds[0],
          id: "d",
          name: "Car Replacement",
          balance: 0,
          change: null,
          dormant: true,
          synced: false,
          history: [0, 0],
        },
      ],
    },
  ];
  render(<SavingsFundsWidget groups={withDormant} monthKey="2026-09" />);

  expect(screen.queryByText("Car Replacement")).not.toBeInTheDocument();
  expect(screen.getByText(/Empty for months, not listed: Car Replacement/)).toBeInTheDocument();
});

test("no note appears when nothing is dormant", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  expect(screen.queryByText(/Empty for months/)).not.toBeInTheDocument();
});

test("nothing is rendered at all when no funds have been set up", () => {
  const { container } = render(<SavingsFundsWidget groups={[]} monthKey="2026-09" />);

  expect(container).toBeEmptyDOMElement();
});

test("each fund's line is described for anything that cannot see it", () => {
  render(<SavingsFundsWidget groups={groups} monthKey="2026-09" />);

  expect(screen.getByLabelText("General Savings, last 12 months")).toBeInTheDocument();
  // The one-point fund draws no line, so there is nothing to describe.
  expect(screen.queryByLabelText("Craft Fund, last 12 months")).not.toBeInTheDocument();
});
