import { test, expect } from "vitest";
import { buildInsertStatement, insertRows } from "./batchInsert.cjs";

// sync.cjs sent one round trip per row — thousands on a full sync. These
// helpers build multi-row INSERTs instead. Postgres caps a statement at 65535
// parameters, so the row count per statement has to be bounded.

test("one row becomes a single-row upsert", () => {
  const { text, values } = buildInsertStatement({
    table: "Account",
    columns: ["id", "name", "balance"],
    conflictTarget: ["id"],
    rows: [["acct-1", "Checking", 1000]],
  });

  expect(text).toContain(`INSERT INTO "Account" ("id", "name", "balance")`);
  expect(text).toContain("VALUES ($1, $2, $3)");
  expect(text).toContain(`ON CONFLICT ("id") DO UPDATE SET`);
  // The conflict target is what identifies the row, so it is never reassigned.
  expect(text).toContain(`"name" = EXCLUDED."name"`);
  expect(text).toContain(`"balance" = EXCLUDED."balance"`);
  expect(text).not.toContain(`"id" = EXCLUDED."id"`);
  expect(values).toEqual(["acct-1", "Checking", 1000]);
});

// "CategoryBudget" has no natural id — the database generates one. It must not
// consume a bind parameter, and it must not be reassigned when the upsert hits
// an existing row, or every sync would churn the primary keys.
test("a generated column is an expression, not a parameter", () => {
  const { text, values } = buildInsertStatement({
    table: "CategoryBudget",
    expressions: { id: "gen_random_uuid()" },
    columns: ["month", "budgetedAmount", "categoryId"],
    conflictTarget: ["categoryId", "month"],
    rows: [
      ["2026-03", 500, "cat-1"],
      ["2026-03", 700, "cat-2"],
    ],
  });

  expect(text).toContain(`("id", "month", "budgetedAmount", "categoryId")`);
  expect(text).toContain("VALUES (gen_random_uuid(), $1, $2, $3), (gen_random_uuid(), $4, $5, $6)");
  expect(text).toContain(`ON CONFLICT ("categoryId", "month")`);
  expect(text).toContain(`"budgetedAmount" = EXCLUDED."budgetedAmount"`);
  expect(text).not.toContain(`"id" = EXCLUDED."id"`);
  expect(values).toEqual(["2026-03", 500, "cat-1", "2026-03", 700, "cat-2"]);
});

function fakePool() {
  const calls: { text: string; values: unknown[] }[] = [];
  return {
    calls,
    query(text: string, values: unknown[]) {
      calls.push({ text, values });
      return Promise.resolve({ rows: [] });
    },
  };
}

test("rows are split so no statement exceeds the parameter cap", async () => {
  const pool = fakePool();
  const rows = Array.from({ length: 7 }, (_, i) => [`id-${i}`, "name", 0]);

  // 3 columns against a cap of 10 leaves room for 3 rows a statement.
  await insertRows(pool, {
    table: "Account",
    columns: ["id", "name", "balance"],
    conflictTarget: ["id"],
  }, rows, { maxParams: 10 });

  expect(pool.calls.map((c) => c.values.length)).toEqual([9, 9, 3]);
  expect(pool.calls[0].values[0]).toBe("id-0");
  expect(pool.calls[2].values[0]).toBe("id-6");
});

test("a real transaction batch stays under Postgres's 65535 parameters", async () => {
  const pool = fakePool();
  // "Transaction" has 7 columns, so 9362 rows is the most one statement holds.
  const rows = Array.from({ length: 20_000 }, (_, i) => Array(7).fill(i));

  await insertRows(pool, {
    table: "Transaction",
    columns: ["id", "date", "amount", "payee", "notes", "categoryId", "accountId"],
    conflictTarget: ["id"],
  }, rows);

  expect(pool.calls).toHaveLength(3);
  for (const call of pool.calls) {
    expect(call.values.length).toBeLessThanOrEqual(65535);
  }
  // Every row is accounted for, none duplicated or dropped.
  const total = pool.calls.reduce((n, c) => n + c.values.length, 0);
  expect(total).toBe(20_000 * 7);
});

// Per-row inserts tolerated a repeated key: the second one simply updated what
// the first wrote. Postgres refuses to let one statement touch the same
// conflict target twice ("cannot affect row a second time"), so batching turns
// a harmless duplicate into a failed sync unless they are collapsed first.
test("a repeated conflict key collapses to its last value", async () => {
  const pool = fakePool();

  await insertRows(pool, {
    table: "Account",
    columns: ["id", "name", "balance"],
    conflictTarget: ["id"],
  }, [
    ["acct-1", "Checking", 100],
    ["acct-2", "Savings", 200],
    ["acct-1", "Checking renamed", 300],
  ]);

  expect(pool.calls).toHaveLength(1);
  expect(pool.calls[0].values).toEqual([
    "acct-1", "Checking renamed", 300,
    "acct-2", "Savings", 200,
  ]);
});

test("a repeated multi-column conflict key collapses too", async () => {
  const pool = fakePool();

  await insertRows(pool, {
    table: "CategoryBudget",
    expressions: { id: "gen_random_uuid()" },
    columns: ["month", "budgetedAmount", "categoryId"],
    conflictTarget: ["categoryId", "month"],
  }, [
    ["2026-03", 500, "cat-1"],
    ["2026-04", 600, "cat-1"],
    ["2026-03", 900, "cat-1"],
  ]);

  expect(pool.calls[0].values).toEqual([
    "2026-03", 900, "cat-1",
    "2026-04", 600, "cat-1",
  ]);
});

test("no rows means no round trip at all", async () => {
  const pool = fakePool();

  await insertRows(pool, {
    table: "Account",
    columns: ["id"],
    conflictTarget: ["id"],
  }, []);

  expect(pool.calls).toHaveLength(0);
});

test("several rows share one statement, numbered straight through", () => {
  const { text, values } = buildInsertStatement({
    table: "Account",
    columns: ["id", "name"],
    conflictTarget: ["id"],
    rows: [
      ["acct-1", "Checking"],
      ["acct-2", "Savings"],
      ["acct-3", "Card"],
    ],
  });

  expect(text).toContain("VALUES ($1, $2), ($3, $4), ($5, $6)");
  expect(values).toEqual(["acct-1", "Checking", "acct-2", "Savings", "acct-3", "Card"]);
});
