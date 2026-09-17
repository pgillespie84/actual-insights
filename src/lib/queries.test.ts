import { test, expect, vi, beforeEach } from "vitest";

// queries.ts is untested repo-wide because every function needs a database.
// The wiring below does not: which skip list each function hands to the filter
// is decided in JS, and it is the whole of what "the mortgage is off the
// dashboard but not off analytics" means.
//
// The lists are mocked rather than read from the loaded config. Asserting
// against the real SKIP_VENDOR_CATEGORIES passes vacuously wherever that list
// is empty — the example config's is — and an empty list makes the two
// functions indistinguishable, which is exactly the swap this file exists to
// catch.
const groupBy = vi.fn().mockResolvedValue([]);
vi.mock("./prisma", () => ({
  prisma: { transaction: { groupBy: (...args: unknown[]) => groupBy(...args) } },
}));

const SKIP_CATEGORIES = ["Rollover"];
const SKIP_INCOME = ["Primary Income"];
const VENDOR_ONLY = "__vendor-only__";

vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  SKIP_CATEGORIES,
  SKIP_INCOME,
  SKIP_VENDOR_CATEGORIES: [VENDOR_ONLY],
}));

const { getTopPayees, getTopVendors } = await import("./queries");

beforeEach(() => groupBy.mockClear());

const skipsFromLastCall = (): string[] =>
  groupBy.mock.calls.at(-1)![0].where.category.name.notIn;

test("getTopVendors hides the configured vendor categories", async () => {
  await getTopVendors(new Date("2026-08-15"), 10);

  expect(skipsFromLastCall()).toEqual([...SKIP_CATEGORIES, ...SKIP_INCOME, VENDOR_ONLY]);
});

test("getTopPayees hides nothing beyond the household lists", async () => {
  await getTopPayees(new Date("2026-08-15"), 10);

  const notIn = skipsFromLastCall();
  expect(notIn).toEqual([...SKIP_CATEGORIES, ...SKIP_INCOME]);
  expect(notIn).not.toContain(VENDOR_ONLY);
});
