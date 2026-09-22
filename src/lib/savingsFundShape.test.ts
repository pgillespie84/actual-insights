import { describe, it, expect } from "vitest";
import {
  parseAmountToCents,
  validateFund,
  normalizeFund,
  validateBalance,
  isFundVisibleIn,
  resolveBalance,
  groupsInOrder,
  MAX_BALANCE_CENTS,
} from "./savingsFundShape.cjs";

describe("parseAmountToCents", () => {
  it("reads what comes out of the spreadsheet", () => {
    expect(parseAmountToCents("$3,953.32")).toBe(395332);
    expect(parseAmountToCents("3953.32")).toBe(395332);
    expect(parseAmountToCents(" $10,050.61 ")).toBe(1005061);
    expect(parseAmountToCents("95")).toBe(9500);
  });

  it("keeps negatives, however they are written", () => {
    expect(parseAmountToCents("-$40.00")).toBe(-4000);
    expect(parseAmountToCents("($253.82)")).toBe(-25382);
    // The dashboard formats negatives with a true minus sign, so a figure
    // copied back off the page has to read as a negative rather than as junk.
    expect(parseAmountToCents("−$1.35")).toBe(-135);
  });

  it("returns null rather than zero for anything it cannot read", () => {
    // The distinction the entry grid depends on: an empty box clears a
    // figure, a nonsense box is an error, and neither is $0.00.
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("   ")).toBeNull();
    expect(parseAmountToCents("n/a")).toBeNull();
    expect(parseAmountToCents("$")).toBeNull();
    expect(parseAmountToCents(".")).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
    expect(parseAmountToCents(undefined)).toBeNull();
  });

  it("reads a genuine zero as zero", () => {
    expect(parseAmountToCents("$0.00")).toBe(0);
    expect(parseAmountToCents(0)).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(parseAmountToCents("10.005")).toBe(1001);
    expect(parseAmountToCents(19.99)).toBe(1999);
  });
});

describe("validateFund", () => {
  it("accepts a normal fund", () => {
    expect(validateFund({ name: "Car Repair Fund", group: "Short Term" })).toBeNull();
  });

  it("requires a name and a group", () => {
    expect(validateFund({ name: "  ", group: "Short Term" })).toMatch(/name/i);
    expect(validateFund({ name: "Tax Fund", group: "" })).toMatch(/group/i);
  });

  it("rejects an archive month that is not a month", () => {
    expect(
      validateFund({ name: "Tax Fund", group: "Short Term", archivedFrom: "2026-13" }),
    ).toMatch(/YYYY-MM/);
    expect(
      validateFund({ name: "Tax Fund", group: "Short Term", archivedFrom: "" }),
    ).toBeNull();
  });
});

describe("normalizeFund", () => {
  it("turns an empty archive month into null so the column means one thing", () => {
    expect(normalizeFund({ name: " Tax Fund ", group: " Short Term ", archivedFrom: "" })).toEqual({
      name: "Tax Fund",
      group: "Short Term",
      archivedFrom: null,
    });
  });
});

describe("validateBalance", () => {
  it("allows negatives, which are real", () => {
    expect(validateBalance({ monthKey: "2026-09", balance: -25382 })).toBeNull();
  });

  it("catches an extra zero", () => {
    expect(validateBalance({ monthKey: "2026-09", balance: MAX_BALANCE_CENTS + 1 })).toMatch(
      /zeros/,
    );
  });

  it("rejects a bad month", () => {
    expect(validateBalance({ monthKey: "Sep 2026", balance: 100 })).toMatch(/YYYY-MM/);
  });
});

describe("isFundVisibleIn", () => {
  const fund = { archivedFrom: "2026-09" };

  it("shows an archived fund in the months before it was archived", () => {
    expect(isFundVisibleIn(fund, "2026-08")).toBe(true);
  });

  it("hides it from the archive month on", () => {
    expect(isFundVisibleIn(fund, "2026-09")).toBe(false);
    expect(isFundVisibleIn(fund, "2026-10")).toBe(false);
  });

  it("shows a live fund always", () => {
    expect(isFundVisibleIn({ archivedFrom: null }, "2030-01")).toBe(true);
  });
});

describe("resolveBalance", () => {
  const history = [
    { monthKey: "2026-06", balance: 50000 },
    { monthKey: "2026-01", balance: 10000 },
    { monthKey: "2026-09", balance: 70000 },
  ];

  it("uses the month's own figure when there is one", () => {
    expect(resolveBalance(history, "2026-09")).toEqual({
      balance: 70000,
      asOf: "2026-09",
      carried: false,
    });
  });

  it("carries the most recent earlier figure forward, and says so", () => {
    expect(resolveBalance(history, "2026-08")).toEqual({
      balance: 50000,
      asOf: "2026-06",
      carried: true,
    });
  });

  it("ignores figures from after the month being viewed", () => {
    // Looking at January must not show September's balance — the printed PDF
    // for a past month has to keep saying what it said at the time.
    expect(resolveBalance(history, "2026-01")).toEqual({
      balance: 10000,
      asOf: "2026-01",
      carried: false,
    });
  });

  it("returns null when nothing has ever been recorded, rather than zero", () => {
    expect(resolveBalance(history, "2025-12")).toBeNull();
    expect(resolveBalance([], "2026-09")).toBeNull();
  });
});

describe("groupsInOrder", () => {
  it("keeps the order the groups first appear in", () => {
    // Alphabetical would put Long Term first, which is upside down against
    // how the household writes the sheet.
    expect(
      groupsInOrder([
        { group: "Short Term" },
        { group: "Short Term" },
        { group: "Long Term" },
        { group: "Short Term" },
      ]),
    ).toEqual(["Short Term", "Long Term"]);
  });
});
