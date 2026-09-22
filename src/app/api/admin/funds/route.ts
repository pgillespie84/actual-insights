import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFundGroups, listFunds } from "@/lib/savingsFunds";
import { validateFund, normalizeFund, isValidMonthKey } from "@/lib/savingsFundShape.cjs";
import { getCurrentMonthKeyET } from "@/lib/timezone";

/** Prisma's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * The stored spelling of a group that already exists, ignoring case.
 *
 * The panel tells the household that "Short Term" and "Short term" cannot
 * become two blocks. The picker alone does not keep that promise — it has a
 * free-text box for a new group — so the promise is kept here instead, by
 * snapping a case-insensitive match onto the spelling already in use. A
 * genuinely new group is returned untouched.
 */
async function snapGroup(group: string): Promise<string> {
  const existing = await prisma.savingsFund.findMany({
    select: { group: true },
    distinct: ["group"],
  });
  const match = existing.find(
    (row) => row.group.toLowerCase() === group.toLowerCase(),
  );
  return match ? match.group : group;
}

/**
 * A fund with this name, ignoring case.
 *
 * Postgres unique indexes are case-sensitive, so the database would happily
 * take "Car Fund" alongside "car fund" — two rows the household would read as
 * one fund with half its history missing.
 */
function findByName(name: string) {
  return prisma.savingsFund.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
}

// isAuthenticated(), never hasReadAccess(), for the same reason as the notes
// route: the PDF renderer's read-only token must not be able to write.

/**
 * The entry grid for one month, plus the full fund list.
 *
 * Both, because the panel does two jobs on one screen: type this month's
 * figures, and manage the funds themselves. The full list includes archived
 * funds, which the grid does not show — the panel needs them to offer
 * un-archiving.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("month");
  const monthKey = isValidMonthKey(requested) ? requested! : getCurrentMonthKeyET();

  const [groups, funds] = await Promise.all([getFundGroups(monthKey), listFunds()]);

  return NextResponse.json({ monthKey, groups, funds });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    group?: string;
  };

  const problem = validateFund(body);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const normalized = normalizeFund(body as { name: string; group: string });
  const data = { ...normalized, group: await snapGroup(normalized.group) };

  // Checked here for the message — "already exists" on a list of nineteen is
  // not enough to find the fund, so the name goes in the sentence. The check
  // is not what makes it safe: two tabs can both pass a read-then-write, so
  // the unique index is caught below as well, and both paths answer the same
  // way.
  const existing = await findByName(data.name);
  if (existing) {
    return NextResponse.json(
      { error: `There is already a fund called "${existing.name}".` },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await prisma.savingsFund.create({ data });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return NextResponse.json(
      { error: `There is already a fund called "${data.name}".` },
      { status: 409 },
    );
  }

  return NextResponse.json({
    fund: {
      id: created.id,
      name: created.name,
      group: created.group,
      archivedFrom: created.archivedFrom,
    },
  });
}

/**
 * Renames a fund, moves it to another group, or archives it.
 *
 * There is deliberately no DELETE. Archiving keeps every recorded balance and
 * leaves past months showing the funds that existed then; deleting would
 * rewrite history that has already gone out in monthly PDFs.
 */
export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    group?: string;
    archivedFrom?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const current = await prisma.savingsFund.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ error: "No such fund." }, { status: 404 });
  }

  // Validated as the whole fund it would become, not as the fields that
  // happened to be sent, so a PATCH cannot sidestep a rule by omitting the
  // field it would break.
  const merged = {
    name: body.name ?? current.name,
    group: body.group ?? current.group,
    archivedFrom:
      body.archivedFrom === undefined ? current.archivedFrom : body.archivedFrom,
  };

  const problem = validateFund(merged);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const normalized = normalizeFund(merged);
  const data = { ...normalized, group: await snapGroup(normalized.group) };

  if (data.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await findByName(data.name);
    if (clash) {
      return NextResponse.json(
        { error: `There is already a fund called "${clash.name}".` },
        { status: 409 },
      );
    }
  }

  let updated;
  try {
    updated = await prisma.savingsFund.update({ where: { id: body.id }, data });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return NextResponse.json(
      { error: `There is already a fund called "${data.name}".` },
      { status: 409 },
    );
  }

  return NextResponse.json({
    fund: {
      id: updated.id,
      name: updated.name,
      group: updated.group,
      archivedFrom: updated.archivedFrom,
    },
  });
}

export const dynamic = "force-dynamic";
