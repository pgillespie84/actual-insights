import { test, expect, vi, beforeEach } from "vitest";

/*
 * The database half of savings funds, with Prisma mocked.
 *
 * What is worth testing here is not the queries — it is the assembly done in
 * JS afterwards: which funds a month shows, which figure each one gets, how
 * the change against last month is worked out, and what a group total counts.
 * Those are the rules the dashboard displays, and all four are decided in
 * this file rather than in SQL.
 */

const findManyFunds = vi.fn();
const findManyBalances = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    savingsFund: { findMany: (...a: unknown[]) => findManyFunds(...a) },
    savingsFundBalance: { findMany: (...a: unknown[]) => findManyBalances(...a) },
  },
}));

const { getFundGroups } = await import("./savingsFunds");

// Creation order, which is what fixes the group order — so these stay in
// this order and anything new goes on the end.
const FUNDS = [
  { id: "a", name: "General Savings", group: "Short Term", archivedFrom: null },
  { id: "b", name: "Car Repair Fund", group: "Short Term", archivedFrom: null },
  { id: "c", name: "Emergency Fund", group: "Long Term", archivedFrom: null },
  { id: "d", name: "Daycare Tax Fund", group: "Short Term", archivedFrom: "2026-09" },
  { id: "e", name: "Craft Fund", group: "Long Term", archivedFrom: null },
  { id: "f", name: "Holiday Fund", group: "Long Term", archivedFrom: null },
  { id: "g", name: "Unfunded Fund", group: "Long Term", archivedFrom: null },
];

const BALANCES = [
  // Zero all year: opened, never funded beyond a zero entry.
  { fundId: "e", monthKey: "2026-01", balance: 0 },
  { fundId: "e", monthKey: "2026-09", balance: 0 },
  // Spent down to zero in August, which is recent enough to still matter.
  { fundId: "f", monthKey: "2026-07", balance: 40000 },
  { fundId: "f", monthKey: "2026-08", balance: 0 },
  { fundId: "a", monthKey: "2026-08", balance: 387866 },
  { fundId: "a", monthKey: "2026-09", balance: 873922 },
  { fundId: "b", monthKey: "2026-06", balance: 309988 },
  { fundId: "c", monthKey: "2026-09", balance: 107771 },
  { fundId: "d", monthKey: "2026-08", balance: -135 },
];

beforeEach(() => {
  findManyFunds.mockReset().mockResolvedValue(FUNDS);
  findManyBalances
    .mockReset()
    .mockImplementation(({ where }: { where: { monthKey: { lte: string } } }) =>
      Promise.resolve(BALANCES.filter((b) => b.monthKey <= where.monthKey.lte)),
    );
});

test("a fund that has held nothing for six months is marked dormant", async () => {
  const [, longTerm] = await getFundGroups("2026-09");
  const craft = longTerm.funds.find((f) => f.name === "Craft Fund")!;

  expect(craft.dormant).toBe(true);
});

test("a fund spent down recently is not dormant, which is when you most want to see it", async () => {
  // Emptied in August. Hiding it in September is hiding the month the money
  // went out.
  const [, longTerm] = await getFundGroups("2026-09");
  const holiday = longTerm.funds.find((f) => f.name === "Holiday Fund")!;

  expect(holiday.balance).toBe(0);
  expect(holiday.dormant).toBe(false);
});

test("a fund emptied long enough ago goes quiet", async () => {
  // Six months after August, the same fund has stopped being news.
  const [, longTerm] = await getFundGroups("2027-02");
  const holiday = longTerm.funds.find((f) => f.name === "Holiday Fund")!;

  expect(holiday.dormant).toBe(true);
});

test("a fund with no figure ever recorded is not dormant, it is unfilled", async () => {
  // Null is not zero. This one is waiting for its first entry, which is worth
  // seeing rather than hiding.
  const [, longTerm] = await getFundGroups("2026-09");
  const unfunded = longTerm.funds.find((f) => f.name === "Unfunded Fund")!;

  expect(unfunded.balance).toBeNull();
  expect(unfunded.dormant).toBe(false);
});

test("groups come out in the order the funds were created, not alphabetically", async () => {
  const groups = await getFundGroups("2026-09");

  expect(groups.map((g) => g.group)).toEqual(["Short Term", "Long Term"]);
});

test("a fund with no entry this month carries its last figure and is marked", async () => {
  const [shortTerm] = await getFundGroups("2026-09");
  const carRepair = shortTerm.funds.find((f) => f.name === "Car Repair Fund")!;

  expect(carRepair.balance).toBe(309988);
  expect(carRepair.asOf).toBe("2026-06");
  expect(carRepair.carried).toBe(true);
  expect(carRepair.entered).toBe(false);
  expect(shortTerm.carriedCount).toBe(1);
});

test("the group total counts carried figures, because that money is still there", async () => {
  const [shortTerm] = await getFundGroups("2026-09");

  expect(shortTerm.total).toBe(873922 + 309988);
});

test("funds are ordered largest balance first within a group", async () => {
  const [shortTerm] = await getFundGroups("2026-09");

  expect(shortTerm.funds.map((f) => f.name)).toEqual(["General Savings", "Car Repair Fund"]);
});

test("a carried figure claims no change, because nobody looked", async () => {
  // Subtracting a carried figure from itself is zero, and "+$0" beside "as of
  // Jun" would read as a fund that held steady rather than one nobody checked.
  const [shortTerm] = await getFundGroups("2026-09");
  const carRepair = shortTerm.funds.find((f) => f.name === "Car Repair Fund")!;

  expect(carRepair.change).toBeNull();
});

test("change is measured against the previous month's figure", async () => {
  const [shortTerm] = await getFundGroups("2026-09");
  const general = shortTerm.funds.find((f) => f.name === "General Savings")!;

  expect(general.change).toBe(873922 - 387866);
});

test("a fund with nothing to compare against reports no change rather than zero", async () => {
  // Zero would say the fund held steady. It did not — it had not started.
  const [, longTerm] = await getFundGroups("2026-09");

  expect(longTerm.funds[0].change).toBeNull();
});

test("an archived fund is gone from its archive month on", async () => {
  const [shortTerm] = await getFundGroups("2026-09");

  expect(shortTerm.funds.map((f) => f.name)).not.toContain("Daycare Tax Fund");
});

test("an archived fund is still there in the months before it was archived", async () => {
  // Archiving tidies the list going forward. A month already reported in a
  // PDF has to keep showing the funds it showed at the time.
  const [shortTerm] = await getFundGroups("2026-08");

  expect(shortTerm.funds.map((f) => f.name)).toContain("Daycare Tax Fund");
});

test("a past month never shows a later month's figures", async () => {
  const [shortTerm] = await getFundGroups("2026-08");
  const general = shortTerm.funds.find((f) => f.name === "General Savings")!;

  expect(general.balance).toBe(387866);
  expect(general.entered).toBe(true);
});

test("funds with no figure at all stay in the order the fund list gave them", async () => {
  // Asserted as the order itself, not as "the same twice". A round trip
  // comparing the call to itself passes for any comparator that is merely
  // stable, which the old NaN-producing one was — so it would have proved
  // nothing about the change that replaced it.
  const groups = await getFundGroups("2025-01");

  expect(groups[0].funds.map((f) => f.name)).toEqual([
    "General Savings",
    "Car Repair Fund",
    "Daycare Tax Fund",
  ]);
});

test("a month before any fund has history shows no figures rather than zeros", async () => {
  const groups = await getFundGroups("2025-01");

  // The groups are still there — every fund existed then — but every figure
  // resolves to null rather than zero, so nothing claims the funds were empty
  // when the truth is that nobody had recorded anything yet.
  expect(groups.map((g) => g.group)).toEqual(["Short Term", "Long Term"]);
  expect(groups.every((g) => g.funds.every((f) => f.balance === null))).toBe(true);
});
