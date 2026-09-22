import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFundGroups, listFunds } from "@/lib/savingsFunds";
import { validateFund, normalizeFund, isValidMonthKey } from "@/lib/savingsFundShape.cjs";
import { getCurrentMonthKeyET } from "@/lib/timezone";

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

  const data = normalizeFund(body as { name: string; group: string });

  // The name is unique in the database, so a duplicate is caught there rather
  // than by a read-then-write that two tabs could both pass. Reported as the
  // conflict it is, naming the fund, because "already exists" on a list of
  // nineteen is not enough to find it.
  const existing = await prisma.savingsFund.findUnique({ where: { name: data.name } });
  if (existing) {
    return NextResponse.json(
      { error: `There is already a fund called "${data.name}".` },
      { status: 409 },
    );
  }

  const created = await prisma.savingsFund.create({ data });

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

  const data = normalizeFund(merged);

  if (data.name !== current.name) {
    const clash = await prisma.savingsFund.findUnique({ where: { name: data.name } });
    if (clash) {
      return NextResponse.json(
        { error: `There is already a fund called "${data.name}".` },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.savingsFund.update({ where: { id: body.id }, data });

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
