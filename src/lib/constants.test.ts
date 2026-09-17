import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SKIP_CATEGORIES,
  SKIP_INCOME,
  BUDGET_BUCKETS,
  BUSINESS_CATEGORIES,
  EXCLUDED_ACCOUNTS,
  SKIP_VENDOR_CATEGORIES,
  optionalNameList,
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

/**
 * Keys a config may leave out. Every config written before the key existed —
 * including the one in the running container, which is an Unraid variable
 * rather than a file in this repo — has to keep booting, so these cannot be
 * asserted as present.
 */
const OPTIONAL_KEYS = ["SKIP_VENDOR_CATEGORIES"];

const REQUIRED_NET_WORTH_GROUPS = [
  "Savings",
  "Retirement",
  "Taxable Investments",
  "Debt — Loans",
  "Debt — Credit Cards",
];

test("loaded config has every required key and no unknown one", () => {
  const keys = Object.keys(loadConfig());
  for (const key of REQUIRED_KEYS) expect(keys).toContain(key);
  for (const key of keys) expect([...REQUIRED_KEYS, ...OPTIONAL_KEYS]).toContain(key);
});

test("example config matches the loaded config's schema", () => {
  const example = JSON.parse(
    readFileSync("config/dashboard.example.json", "utf8"),
  );
  const keys = Object.keys(example);
  for (const key of REQUIRED_KEYS) expect(keys).toContain(key);
  for (const key of keys) expect([...REQUIRED_KEYS, ...OPTIONAL_KEYS]).toContain(key);
  expect(Object.keys(example.NET_WORTH_GROUPS).sort()).toEqual(
    Object.keys(loadConfig().NET_WORTH_GROUPS).sort(),
  );
});

// The example carries the optional key so its shape is discoverable without
// reading the source — a config file is the one place someone looks to find
// out a setting exists.
test("the example config documents every optional key", () => {
  const example = JSON.parse(
    readFileSync("config/dashboard.example.json", "utf8"),
  );
  for (const key of OPTIONAL_KEYS) expect(example).toHaveProperty(key);
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

// The constant itself can only be asserted against whichever config won, and
// restating `?? []` here would pass for any default the module picked. The
// fallback is tested through the function instead, on fixtures that cannot
// depend on a gitignored file.
test("SKIP_VENDOR_CATEGORIES is a list, whichever config was loaded", () => {
  expect(Array.isArray(SKIP_VENDOR_CATEGORIES)).toBe(true);
});

test("optionalNameList passes a real list through untouched", () => {
  expect(optionalNameList(["Mortgage", "Escrow"])).toEqual(["Mortgage", "Escrow"]);
  expect(optionalNameList([])).toEqual([]);
});

// An absent key is the ordinary case — every config written before the setting
// existed. Empty means "hide nothing", which is what those configs expect.
test("optionalNameList turns an absent key into an empty list", () => {
  expect(optionalNameList(undefined)).toEqual([]);
  expect(optionalNameList(null)).toEqual([]);
});

// The setting is typed into an Unraid text box, where quoting one name as a
// bare string is the easy mistake. Spread into a Prisma notIn it would become
// one letter per entry and match nothing, so it has to be refused here.
test("optionalNameList refuses a bare string rather than spreading it", () => {
  expect(optionalNameList("Mortgage")).toEqual([]);
  expect(optionalNameList({ Mortgage: true })).toEqual([]);
});

// A list holding a non-string is the one bad value that would not degrade
// quietly: Prisma rejects a notIn of mixed types against a String column, so
// the dashboard route would 500 rather than showing an unfiltered chart.
test("optionalNameList drops a bad element and keeps the good ones", () => {
  expect(optionalNameList(["Mortgage", 5])).toEqual(["Mortgage"]);
  expect(optionalNameList([null])).toEqual([]);
  expect(optionalNameList([["Mortgage"], "Escrow"])).toEqual(["Escrow"]);
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
