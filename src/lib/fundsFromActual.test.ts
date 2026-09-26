import { test, expect, vi } from "vitest";
import {
  syncedFundGroup,
  planFundsFromActual,
  syncFundsFromActual,
  nextMonthKey,
} from "./fundsFromActual.cjs";

const travel = { id: "f1", name: "Travel Fund", archivedFrom: null };
const accounts = [
  { id: "a1", name: "Travel Fund" },
  { id: "a2", name: "Primary Checking" },
];

test("the group is off unless it is a non-empty string", () => {
  expect(syncedFundGroup({ SYNCED_FUND_GROUP: "Others" })).toBe("Others");
  expect(syncedFundGroup({ SYNCED_FUND_GROUP: "  Others " })).toBe("Others");
  expect(syncedFundGroup({ SYNCED_FUND_GROUP: "" })).toBeNull();
  expect(syncedFundGroup({ SYNCED_FUND_GROUP: ["Others"] })).toBeNull();
  expect(syncedFundGroup({})).toBeNull();
});

test("month keys roll over the year", () => {
  expect(nextMonthKey("2026-09")).toBe("2026-10");
  expect(nextMonthKey("2026-12")).toBe("2027-01");
});

test("each month takes the last snapshot in it", () => {
  const { rows, problems } = planFundsFromActual({
    funds: [travel],
    accounts,
    snapshots: [
      { accountId: "a1", date: "2026-07-31", balance: 500000 },
      { accountId: "a1", date: "2026-07-02", balance: 400000 },
      { accountId: "a1", date: "2026-08-15", balance: 550000 },
      { accountId: "a2", date: "2026-08-31", balance: 999 },
    ],
    currentMonth: "2026-08",
  });
  expect(problems).toEqual([]);
  expect(rows).toEqual([
    { fundId: "f1", name: "Travel Fund", monthKey: "2026-07", balance: 500000 },
    { fundId: "f1", name: "Travel Fund", monthKey: "2026-08", balance: 550000 },
  ]);
});

test("a month with no sync in it carries the balance from the last one", () => {
  const { rows } = planFundsFromActual({
    funds: [travel],
    accounts,
    snapshots: [
      { accountId: "a1", date: "2026-06-30", balance: 100 },
      { accountId: "a1", date: "2026-09-10", balance: 300 },
    ],
    currentMonth: "2026-09",
  });
  expect(rows.map((r) => [r.monthKey, r.balance])).toEqual([
    ["2026-06", 100],
    ["2026-07", 100],
    ["2026-08", 100],
    ["2026-09", 300],
  ]);
});

test("names match ignoring case and spaces", () => {
  const { rows } = planFundsFromActual({
    funds: [{ id: "f2", name: "date night fund ", archivedFrom: null }],
    accounts: [{ id: "a3", name: "Date Night Fund" }],
    snapshots: [{ accountId: "a3", date: "2026-09-01", balance: 9647 }],
    currentMonth: "2026-09",
  });
  expect(rows).toHaveLength(1);
});

test("a fund with no single matching account is reported and left alone", () => {
  const { rows, problems } = planFundsFromActual({
    funds: [travel, { id: "f3", name: "Boat", archivedFrom: null }],
    accounts: [...accounts, { id: "a9", name: "travel fund" }],
    snapshots: [],
    currentMonth: "2026-09",
  });
  expect(rows).toEqual([]);
  expect(problems).toHaveLength(2);
  expect(problems[0]).toMatch(/Travel Fund.*2 Actual accounts/);
  expect(problems[1]).toMatch(/Boat.*no Actual account/);
});

test("nothing is written from an archived fund's archive month on", () => {
  const { rows } = planFundsFromActual({
    funds: [{ ...travel, archivedFrom: "2026-08" }],
    accounts,
    snapshots: [{ accountId: "a1", date: "2026-06-30", balance: 100 }],
    currentMonth: "2026-09",
  });
  expect(rows.map((r) => r.monthKey)).toEqual(["2026-06", "2026-07"]);
});

test("the sync writes only figures that differ from what is stored", async () => {
  const query = vi.fn<(text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>(async (text) => {
    if (text.includes('FROM "SavingsFund"')) return { rows: [travel] };
    if (text.includes('FROM "Account"')) return { rows: accounts };
    if (text.includes('FROM "AccountBalanceSnapshot"')) {
      return {
        rows: [
          { accountId: "a1", date: "2026-08-31", balance: "500000" },
          { accountId: "a1", date: "2026-09-20", balance: "606147" },
        ],
      };
    }
    if (text.includes('FROM "SavingsFundBalance"')) {
      return { rows: [{ fundId: "f1", monthKey: "2026-08", balance: 500000 }] };
    }
    return { rows: [] };
  });
  const lines: string[] = [];

  const result = await syncFundsFromActual({ query } as never, {
    group: "Others",
    currentMonth: "2026-09",
    log: (line: string) => lines.push(line),
  });

  expect(result.written).toBe(1);
  const insert = query.mock.calls.find(([text]) => text.startsWith('INSERT INTO "SavingsFundBalance"'));
  expect(insert?.[1]).toEqual(["f1", "2026-09", 606147]);
  expect(lines.join("\n")).toContain("Travel Fund 2026-09: $6061.47");
});

test("a dry run writes nothing", async () => {
  const query = vi.fn<(text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>(async (text) => {
    if (text.includes('FROM "SavingsFund"')) return { rows: [travel] };
    if (text.includes('FROM "Account"')) return { rows: accounts };
    if (text.includes('FROM "AccountBalanceSnapshot"')) {
      return { rows: [{ accountId: "a1", date: "2026-09-20", balance: 606147 }] };
    }
    return { rows: [] };
  });

  await syncFundsFromActual({ query } as never, {
    group: "Others",
    currentMonth: "2026-09",
    dryRun: true,
    log: () => {},
  });

  expect(query.mock.calls.some(([text]) => text.startsWith("INSERT"))).toBe(false);
});
