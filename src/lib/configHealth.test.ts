import { test, expect } from "vitest";
import { checkConfigHealth } from "./configHealth";

// Every config name is matched against the database by exact string, and a
// name that matches nothing fails silently — the number just comes out wrong.
// That is how the container ran for months on placeholder account names.

const db = {
  accountNames: ["Primary Checking", "Long Term Savings"],
  categoryNames: ["Grocery", "Rent"],
  groupNames: ["Food", "Housing"],
};

/** The keys constants.ts indexes by hand, so tests isolate one rule. */
const requiredGroups = {
  Savings: [],
  "Debt — Loans": [],
  "Debt — Credit Cards": [],
  Retirement: [],
  "Taxable Investments": [],
};

test("an account in NET_WORTH_GROUPS with no matching Account is reported", () => {
  const problems = checkConfigHealth(
    {
      NET_WORTH_GROUPS: {
        ...requiredGroups,
        Savings: ["Long Term Savings", "Personal Loan"],
      },
    },
    db,
  );

  expect(problems).toEqual([
    {
      setting: "NET_WORTH_GROUPS.Savings",
      value: "Personal Loan",
      kind: "unknown-account",
    },
  ]);
});

test("a category name matching no Category is reported", () => {
  const problems = checkConfigHealth(
    { NET_WORTH_GROUPS: requiredGroups, SKIP_CATEGORIES: ["Grocery", "Rollover"] },
    db,
  );

  expect(problems).toEqual([
    { setting: "SKIP_CATEGORIES", value: "Rollover", kind: "unknown-category" },
  ]);
});

test("every other name-matched setting is checked against its own table", () => {
  const problems = checkConfigHealth(
    {
      NET_WORTH_GROUPS: requiredGroups,
      SKIP_INCOME: ["Primary Income"],
      BUSINESS_CATEGORIES: ["Consulting"],
      EXCLUDED_ACCOUNTS: ["Old Card"],
      BUDGET_BUCKETS: { Fixed: ["Housing", "Utilities"] },
    },
    db,
  );

  expect(problems).toEqual([
    { setting: "SKIP_INCOME", value: "Primary Income", kind: "unknown-category" },
    { setting: "BUSINESS_CATEGORIES", value: "Consulting", kind: "unknown-category" },
    { setting: "EXCLUDED_ACCOUNTS", value: "Old Card", kind: "unknown-account" },
    // BUDGET_BUCKETS lists category *group* names, not category names.
    { setting: "BUDGET_BUCKETS.Fixed", value: "Utilities", kind: "unknown-group" },
  ]);
});

test("a NET_WORTH_GROUPS key the code indexes by hand is required", () => {
  // constants.ts reads NET_WORTH_GROUPS["Savings"], ["Debt — Loans"],
  // ["Debt — Credit Cards"], ["Retirement"] and ["Taxable Investments"] by
  // exact key and spreads the result. A missing key spreads undefined and
  // throws, so this one takes the dashboard down rather than skewing it.
  const problems = checkConfigHealth(
    { NET_WORTH_GROUPS: { Savings: [], "Debt — Loans": [], Retirement: [] } },
    db,
  );

  expect(problems).toEqual([
    {
      setting: "NET_WORTH_GROUPS",
      value: "Debt — Credit Cards",
      kind: "missing-required-group",
    },
    {
      setting: "NET_WORTH_GROUPS",
      value: "Taxable Investments",
      kind: "missing-required-group",
    },
  ]);
});

// requireGroup throws on a value that is present but not a list, so the admin
// page has to catch that too — otherwise the check that exists to pre-empt the
// failure passes and the dashboard 500s anyway.
test("a required group present as a bare string is reported as malformed", () => {
  const problems = checkConfigHealth(
    {
      NET_WORTH_GROUPS: {
        ...requiredGroups,
        Savings: "General Savings" as unknown as string[],
      },
    },
    db,
  );

  expect(problems).toEqual([
    {
      setting: "NET_WORTH_GROUPS.Savings",
      value: '"General Savings"',
      kind: "malformed-group",
    },
  ]);
});

// The old code passed the string straight into the name loop, whose
// `for (const value of values)` iterates characters — one bogus row per letter.
test("a malformed group is reported once, not once per character", () => {
  const problems = checkConfigHealth(
    {
      NET_WORTH_GROUPS: { ...requiredGroups, Savings: "General" as unknown as string[] },
    },
    db,
  );

  expect(problems).toHaveLength(1);
});

test("a required group present as null is reported as malformed", () => {
  const problems = checkConfigHealth(
    { NET_WORTH_GROUPS: { ...requiredGroups, Savings: null as unknown as string[] } },
    db,
  );

  expect(problems).toEqual([
    { setting: "NET_WORTH_GROUPS.Savings", value: "null", kind: "malformed-group" },
  ]);
});
