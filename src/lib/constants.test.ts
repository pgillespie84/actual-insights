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
