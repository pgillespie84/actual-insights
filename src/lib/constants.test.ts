import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SKIP_CATEGORIES,
  SKIP_INCOME,
  BUDGET_BUCKETS,
  BUSINESS_CATEGORIES,
  EXCLUDED_ACCOUNTS,
  getSavingsAccountNames,
  getNonMortgageDebtAccountNames,
  getPayableDebtAccountNames,
  requireGroup,
  getInvestmentAccountNames,
  NET_WORTH_GROUPS,
} from "./constants.ts";
import { loadConfig } from "./loadConfig.cjs";

// These tests deliberately assert no real account or category names. The live
// values live in config/dashboard.json, which is gitignored — asserting them
// here would put them straight back into the repo. Structure and schema
// parity are what matter.

const REQUIRED_KEYS = [
  "HOUSEHOLD_NAMES",
  "SKIP_CATEGORIES",
  "SKIP_INCOME",
  "BUDGET_BUCKETS",
  "BUSINESS_CATEGORIES",
  "EXCLUDED_ACCOUNTS",
  "NET_WORTH_GROUPS",
];

const REQUIRED_NET_WORTH_GROUPS = [
  "Savings",
  "Retirement",
  "Taxable Investments",
  "Debt — Loans",
  "Debt — Credit Cards",
];

test("loaded config has every required key", () => {
  const config = loadConfig();
  expect(Object.keys(config).sort()).toEqual([...REQUIRED_KEYS].sort());
});

test("example config matches the loaded config's schema", () => {
  const example = JSON.parse(
    readFileSync("config/dashboard.example.json", "utf8"),
  );
  expect(Object.keys(example).sort()).toEqual([...REQUIRED_KEYS].sort());
  expect(Object.keys(example.NET_WORTH_GROUPS).sort()).toEqual(
    Object.keys(loadConfig().NET_WORTH_GROUPS).sort(),
  );
});

test("constants re-export the loaded config", () => {
  const config = loadConfig();
  expect(SKIP_CATEGORIES).toEqual(config.SKIP_CATEGORIES);
  expect(SKIP_INCOME).toEqual(config.SKIP_INCOME);
  expect(BUDGET_BUCKETS).toEqual(config.BUDGET_BUCKETS);
  expect(BUSINESS_CATEGORIES).toEqual(config.BUSINESS_CATEGORIES);
  expect(EXCLUDED_ACCOUNTS).toEqual(config.EXCLUDED_ACCOUNTS);
  expect(NET_WORTH_GROUPS).toEqual(config.NET_WORTH_GROUPS);
});

test("NET_WORTH_GROUPS defines every group the queries depend on", () => {
  for (const group of REQUIRED_NET_WORTH_GROUPS) {
    expect(NET_WORTH_GROUPS[group]).toBeDefined();
    expect(Array.isArray(NET_WORTH_GROUPS[group])).toBe(true);
  }
});

test("getSavingsAccountNames returns Savings group", () => {
  expect(getSavingsAccountNames()).toEqual(NET_WORTH_GROUPS["Savings"]);
});

test("getNonMortgageDebtAccountNames returns Debt — Loans group", () => {
  expect(getNonMortgageDebtAccountNames()).toEqual(
    NET_WORTH_GROUPS["Debt — Loans"],
  );
});

test("getInvestmentAccountNames combines Retirement and Taxable Investments", () => {
  expect(getInvestmentAccountNames()).toEqual([
    ...NET_WORTH_GROUPS["Retirement"],
    ...NET_WORTH_GROUPS["Taxable Investments"],
  ]);
});

test("getPayableDebtAccountNames combines Loans and Credit Cards", () => {
  expect(getPayableDebtAccountNames()).toEqual([
    ...NET_WORTH_GROUPS["Debt — Loans"],
    ...NET_WORTH_GROUPS["Debt — Credit Cards"],
  ]);
});

// The mortgage is deliberately absent: a 30-year balance moving a few hundred
// dollars a month swamps the number the debt card exists to show.
test("getPayableDebtAccountNames excludes the mortgage", () => {
  const mortgages = NET_WORTH_GROUPS["Debt — Mortgage"];
  for (const name of mortgages) {
    expect(getPayableDebtAccountNames()).not.toContain(name);
  }
});

// A config missing one of the hand-indexed groups used to fail in whichever
// way the caller happened to break. getSavingsAccountNames returned undefined,
// Prisma dropped an `in: undefined` filter and matched every account — a
// confident wrong number — and once coverage started calling .every on it, the
// same config took /api/dashboard to a 500 instead. Neither told the reader
// which setting was at fault.
test("requireGroup returns the configured names", () => {
  expect(
    requireGroup({ Savings: ["General", "Long Term"] }, "Savings", "NET_WORTH_GROUPS"),
  ).toEqual([
    "General",
    "Long Term",
  ]);
});

test("requireGroup names the missing setting in the error", () => {
  expect(() => requireGroup({}, "Savings", "NET_WORTH_GROUPS")).toThrow(
    /NET_WORTH_GROUPS\["Savings"\]/,
  );
});

// The map is a parameter, so the message must be too. Hardcoding one setting
// name would eventually point at the wrong one, which is the exact failure
// this function exists to remove.
test("requireGroup names whichever setting it was given", () => {
  expect(() => requireGroup({}, "Fixed", "BUDGET_BUCKETS")).toThrow(
    /BUDGET_BUCKETS\["Fixed"\]/,
  );
});

test("requireGroup rejects a group that is present but not a list", () => {
  expect(() =>
    requireGroup(
      { Savings: "General" } as unknown as Record<string, string[]>,
      "Savings",
      "NET_WORTH_GROUPS",
    ),
  ).toThrow(/NET_WORTH_GROUPS\["Savings"\]/);
});

test("requireGroup accepts a deliberately empty group", () => {
  expect(requireGroup({ Savings: [] }, "Savings", "NET_WORTH_GROUPS")).toEqual([]);
});
