import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateNote, normalizeNote } from "@/lib/monthNotes.cjs";

// isAuthenticated(), never hasReadAccess(), for the same reason as the jobs
// route: the PDF renderer's read-only token must not be able to write.

/**
 * The most recent insight per month, so the UI can tell you a note has not
 * reached the model yet.
 *
 * Without this, saving a note and seeing nothing change is ambiguous — the
 * note might be missing, or the insight might just be older than the note.
 */
async function latestInsightPerMonth(): Promise<Record<string, string>> {
  const rows = await prisma.dailyInsight.findMany({
    select: { monthKey: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const latest: Record<string, string> = {};
  for (const row of rows) {
    if (!(row.monthKey in latest)) latest[row.monthKey] = row.createdAt.toISOString();
  }
  return latest;
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [notes, insights] = await Promise.all([
    prisma.monthNote.findMany({ orderBy: [{ monthStart: "desc" }, { createdAt: "desc" }] }),
    latestInsightPerMonth(),
  ]);

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      monthStart: n.monthStart,
      monthEnd: n.monthEnd,
      note: n.note,
      createdAt: n.createdAt.toISOString(),
    })),
    insights,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    monthStart?: string;
    monthEnd?: string;
    note?: string;
  };

  const problem = validateNote(body);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const created = await prisma.monthNote.create({
    // validateNote has already established these are present and well formed.
    data: normalizeNote(body as { monthStart: string; monthEnd?: string; note: string }),
  });

  return NextResponse.json({
    note: {
      id: created.id,
      monthStart: created.monthStart,
      monthEnd: created.monthEnd,
      note: created.note,
      createdAt: created.createdAt.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // A note that is already gone is the outcome the caller wanted, so a second
  // delete is not an error worth surfacing.
  const result = await prisma.monthNote.deleteMany({ where: { id } });

  return NextResponse.json({ deleted: result.count });
}

export const dynamic = "force-dynamic";
