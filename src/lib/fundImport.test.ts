import { describe, it, expect } from "vitest";
import {
  parseDelimited,
  parseMonthHeader,
  monthBeforeEarliest,
  groupFromRow,
  isTotalRow,
  buildImport,
} from "./fundImport.cjs";

/** The household's sheet, trimmed to the rows that make the rules visible. */
const SHEET = [
  "Mapping,Account,Start of the Year,Jan-26,Feb-26,Mar-26,Apr-26,Oct-26,Nov-26",
  'Short Term 1,General Savings,"$953.19","$3,953.32","$3,953.45","$9,491.49","$10,050.61",$0.00,$0.00',
  "Short Term 4,Daycare Tax Fund,-$1.35,-$1.35,-$1.35,-$1.35,-$1.35,$0.00,$0.00",
  'Short Term Total,Total,"$13,952.92","$16,918.05","$17,728.18","$23,996.22","$23,314.33",$0.00,$0.00',
  'Long Term 1,Emergency Fund,"$1,077.63","$1,077.64","$1,077.65","$1,077.66","$1,077.67",$0.00,$0.00',
].join("\n");

describe("parseDelimited", () => {
  it("keeps a comma that is inside a quoted figure", () => {
    expect(parseDelimited('a,"1,234.00",b')).toEqual([["a", "1,234.00", "b"]]);
  });

  it("reads a tab-separated paste", () => {
    expect(parseDelimited("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles a doubled quote inside a cell", () => {
    expect(parseDelimited('"Ella""s Fund",5')).toEqual([['Ella"s Fund', "5"]]);
  });
});

describe("parseMonthHeader", () => {
  it("reads the sheet's own header style", () => {
    expect(parseMonthHeader("Jan-26")).toBe("2026-01");
    expect(parseMonthHeader("Dec-26")).toBe("2026-12");
  });

  it("reads the other shapes a spreadsheet might export", () => {
    expect(parseMonthHeader("January 2026")).toBe("2026-01");
    expect(parseMonthHeader("2026-03")).toBe("2026-03");
    expect(parseMonthHeader("03/2026")).toBe("2026-03");
  });

  it("refuses anything that is not a month", () => {
    expect(parseMonthHeader("Account")).toBeNull();
    expect(parseMonthHeader("Start of the Year")).toBeNull();
    expect(parseMonthHeader("Xyz-26")).toBeNull();
    expect(parseMonthHeader("13/2026")).toBeNull();
  });
});

describe("monthBeforeEarliest", () => {
  it("is the previous December for the household's January-to-December sheet", () => {
    expect(monthBeforeEarliest(["2026-01", "2026-02", "2026-03"])).toBe("2025-12");
  });

  it("is the month before, not December, for any other starting month", () => {
    expect(monthBeforeEarliest(["2026-07", "2026-08"])).toBe("2026-06");
    expect(monthBeforeEarliest(["2025-12", "2026-01"])).toBe("2025-11");
  });

  it("has no answer when there are no months at all", () => {
    expect(monthBeforeEarliest([])).toBeNull();
  });
});

describe("groupFromRow", () => {
  it("strips the sheet's own numbering", () => {
    expect(groupFromRow("Short Term 1", undefined)).toBe("Short Term");
    expect(groupFromRow("Long Term 12", undefined)).toBe("Long Term");
  });

  it("falls back when there is nothing in the column", () => {
    expect(groupFromRow("", "Short Term")).toBe("Short Term");
  });
});

describe("isTotalRow", () => {
  it("catches the sheet's subtotal lines from either column", () => {
    expect(isTotalRow("Total", "Short Term Total")).toBe(true);
    expect(isTotalRow("Total", "")).toBe(true);
    expect(isTotalRow("General Savings", "Short Term 1")).toBe(false);
  });
});

describe("buildImport", () => {
  const result = buildImport(SHEET);

  it("imports the funds and not the subtotal row", () => {
    // Importing "Total" would double every figure in the group.
    expect(result.funds.map((f: { name: string }) => f.name)).toEqual([
      "General Savings",
      "Daycare Tax Fund",
      "Emergency Fund",
    ]);
  });

  it("takes the group from the mapping column", () => {
    expect(result.funds.map((f: { group: string }) => f.group)).toEqual([
      "Short Term",
      "Short Term",
      "Long Term",
    ]);
  });

  it("files the opening balance as the previous December", () => {
    const opening = result.balances.find(
      (b: { name: string; monthKey: string }) =>
        b.name === "General Savings" && b.monthKey === "2025-12",
    );
    expect(opening?.balance).toBe(95319);
  });

  it("drops the trailing months nobody has figures for", () => {
    // Oct and Nov are the year's unfilled cells. Importing them as $0.00
    // would read as every fund emptying out.
    expect(result.droppedMonths).toEqual(["2026-10", "2026-11"]);
    expect(
      result.balances.some((b: { monthKey: string }) => b.monthKey.startsWith("2026-1")),
    ).toBe(false);
  });

  it("keeps a real zero and a real negative in a month that was filled in", () => {
    const daycare = result.balances.filter(
      (b: { name: string }) => b.name === "Daycare Tax Fund",
    );
    expect(daycare.every((b: { balance: number }) => b.balance === -135)).toBe(true);
    expect(daycare).toHaveLength(5);
  });

  it("does not drop an interior zero month", () => {
    // Only the tail is dropped, and only when no fund has a figure there.
    const sheet = [
      "Mapping,Account,Jan-26,Feb-26,Mar-26",
      "Short Term 1,Craft Fund,$0.00,$0.00,$50.00",
    ].join("\n");
    const built = buildImport(sheet);
    expect(built.droppedMonths).toEqual([]);
    expect(built.balances).toHaveLength(3);
  });

  it("reports a fund listed twice instead of letting one overwrite the other", () => {
    const sheet = [
      "Mapping,Account,Jan-26",
      "Short Term 1,Tax Fund,$100.00",
      "Long Term 2,Tax Fund,$900.00",
    ].join("\n");
    const built = buildImport(sheet);
    expect(built.funds).toHaveLength(1);
    expect(built.warnings.join(" ")).toMatch(/more than once/);
  });

  it("warns and keeps one column when two headers are the same month", () => {
    // Silently letting the later column win would change a figure with
    // nothing said about it.
    const sheet = ["Account,Jan-26,Jan-26", "Craft Fund,$10.00,$99.00"].join("\n");
    const built = buildImport(sheet, { group: "Long Term" });
    expect(built.balances).toEqual([
      { name: "Craft Fund", monthKey: "2026-01", balance: 1000 },
    ]);
    expect(built.warnings.join(" ")).toMatch(/2026-01/);
  });

  it("names a skipped month once, however many columns carried it", () => {
    // The script prints this list for the reader to check against the sheet.
    const sheet = ["Account,Jan-26,Nov-26,Nov-26", "Craft Fund,$50.00,$0.00,$0.00"].join("\n");
    expect(buildImport(sheet, { group: "Long Term" }).droppedMonths).toEqual(["2026-11"]);
  });

  it("does not call a month skipped when another column carried its figures", () => {
    // The trailing walk drops the empty copy and stops at the one with data.
    // Filtering by month would have taken both, losing the figures and still
    // printing the month as skipped.
    // The column with figures comes FIRST and the empty one last, which is
    // what makes this a test. The other way round, the backwards walk hits
    // the figures immediately and stops, so nothing is dropped and the old
    // by-month code passes too.
    const sheet = ["Account,Jan-26,Nov-26,Nov-26", "Craft Fund,$50.00,$80.00,$0.00"].join("\n");
    const built = buildImport(sheet, { group: "Long Term" });

    expect(built.droppedMonths).toEqual([]);
    // And the figure survives. Dropping by month took the column holding it
    // along with the empty one, losing $80 and still printing 2026-11 as a
    // month with no figures anywhere.
    expect(built.balances).toContainEqual({
      name: "Craft Fund",
      monthKey: "2026-11",
      balance: 8000,
    });
  });

  it("files the opening balance against a sheet that does not start in January", () => {
    // "December of the previous year" is only right for a January-to-December
    // sheet. On one running Dec to Nov it would land a year early, and on the
    // same month as a real column.
    const sheet = ["Account,Start of the Year,Dec-25,Jan-26", "Craft Fund,$10.00,$99.00,$50.00"].join("\n");
    const built = buildImport(sheet, { group: "Long Term" });
    expect(built.balances).toContainEqual({
      name: "Craft Fund",
      monthKey: "2025-11",
      balance: 1000,
    });
    expect(built.warnings).toEqual([]);
  });

  it("uses the --group fallback when the sheet has no group column", () => {
    const sheet = ["Account,Jan-26", "Craft Fund,$50.00"].join("\n");
    expect(buildImport(sheet, { group: "Long Term" }).funds).toEqual([
      { name: "Craft Fund", group: "Long Term" },
    ]);
  });

  it("says so rather than guessing when there is no name column", () => {
    const built = buildImport("Widget,Jan-26\nthing,$5");
    expect(built.funds).toEqual([]);
    expect(built.warnings.join(" ")).toMatch(/names the fund/);
  });

  it("skips a blank cell rather than storing it as zero", () => {
    // A blank month means the fund carries forward, which is the convention
    // the whole dashboard reads.
    const sheet = ["Account,Jan-26,Feb-26,Mar-26", "Craft Fund,$50.00,,$60.00"].join("\n");
    const built = buildImport(sheet, { group: "Long Term" });
    expect(built.balances.map((b: { monthKey: string }) => b.monthKey)).toEqual([
      "2026-01",
      "2026-03",
    ]);
  });
});
