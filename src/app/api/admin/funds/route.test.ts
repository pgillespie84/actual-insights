import { test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * The two guarantees the fund route makes that the pure rules cannot.
 *
 * One: a duplicate name answers with the sentence naming the fund, whether
 * the pre-check catches it or the unique index does — two tabs can both pass
 * a read-then-write, and a bodyless 500 is not an answer anyone can act on.
 * Two: a group that differs from an existing one only in case is snapped onto
 * the spelling already in use, which is the promise the admin page makes in
 * so many words.
 */

const findMany = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savingsFund: {
      findMany: (...a: unknown[]) => findMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ isAuthenticated: async () => true }));

const { POST, PATCH } = await import("./route.ts");

/** What Prisma throws when a unique index rejects a write. */
const uniqueViolation = Object.assign(new Error("unique"), { code: "P2002" });

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/funds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/funds", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([{ group: "Short Term" }]);
  findFirst.mockReset().mockResolvedValue(null);
  findUnique.mockReset().mockResolvedValue({
    id: "f1",
    name: "Car Repair Fund",
    group: "Short Term",
    archivedFrom: null,
  });
  create.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "new", archivedFrom: null, ...data }),
  );
  update.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "f1", archivedFrom: null, name: "Car Repair Fund", ...data }),
  );
});

test("a new group in a different case is filed under the spelling already in use", async () => {
  // Otherwise "Short term" becomes a second block on the dashboard, which is
  // exactly what the panel tells the household cannot happen.
  const res = await POST(post({ name: "Tax Fund", group: "short TERM" }));

  expect(res.status).toBe(200);
  expect(create.mock.calls[0][0].data.group).toBe("Short Term");
});

test("a genuinely new group is left as it was typed", async () => {
  const res = await POST(post({ name: "Tax Fund", group: "Medium Term" }));

  expect(res.status).toBe(200);
  expect(create.mock.calls[0][0].data.group).toBe("Medium Term");
});

test("a duplicate name is refused by name, ignoring case", async () => {
  findFirst.mockResolvedValue({ id: "f1", name: "Car Repair Fund" });

  const res = await POST(post({ name: "car repair fund", group: "Short Term" }));

  expect(res.status).toBe(409);
  // The stored spelling, not what was typed, so the household can find it.
  expect((await res.json()).error).toContain("Car Repair Fund");
  expect(create).not.toHaveBeenCalled();
});

test("a duplicate that slips past the check still answers 409, not 500", async () => {
  // Two tabs adding the same fund both pass the read; the unique index
  // catches the second. A bodyless 500 there would show as "HTTP 500".
  create.mockRejectedValue(uniqueViolation);

  const res = await POST(post({ name: "Tax Fund", group: "Short Term" }));

  expect(res.status).toBe(409);
  expect((await res.json()).error).toContain("Tax Fund");
});

test("a failure that is not a duplicate is not disguised as one", async () => {
  create.mockRejectedValue(new Error("connection lost"));

  await expect(POST(post({ name: "Tax Fund", group: "Short Term" }))).rejects.toThrow(
    "connection lost",
  );
});

test("renaming to an existing name is refused rather than throwing", async () => {
  findFirst.mockResolvedValue({ id: "other", name: "Tax Fund" });

  const res = await PATCH(patch({ id: "f1", name: "tax fund" }));

  expect(res.status).toBe(409);
  expect(update).not.toHaveBeenCalled();
});

test("re-saving a fund under its own name in another case is not a clash with itself", async () => {
  const res = await PATCH(patch({ id: "f1", name: "CAR REPAIR FUND" }));

  expect(res.status).toBe(200);
  expect(findFirst).not.toHaveBeenCalled();
});

test("a rename that races another still answers 409", async () => {
  update.mockRejectedValue(uniqueViolation);

  const res = await PATCH(patch({ id: "f1", name: "Tax Fund" }));

  expect(res.status).toBe(409);
});

test("archiving a fund keeps the month it was archived from", async () => {
  const res = await PATCH(patch({ id: "f1", archivedFrom: "2026-09" }));

  expect(res.status).toBe(200);
  expect(update.mock.calls[0][0].data.archivedFrom).toBe("2026-09");
});

test("a bad archive month is refused", async () => {
  const res = await PATCH(patch({ id: "f1", archivedFrom: "Sep 2026" }));

  expect(res.status).toBe(400);
  expect(update).not.toHaveBeenCalled();
});
