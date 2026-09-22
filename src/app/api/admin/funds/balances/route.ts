import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getFundGroups, saveBalances } from "@/lib/savingsFunds";
import {
  isValidMonthKey,
  parseAmountToCents,
  validateBalance,
} from "@/lib/savingsFundShape.cjs";

/**
 * Saves one month of fund balances.
 *
 * The body carries only the boxes that changed. Everything else is left
 * untouched on purpose: a fund the household skipped this month keeps
 * carrying its last known figure forward and says so on the dashboard, rather
 * than being stamped with a date nobody checked on.
 *
 * An entry with an empty amount clears that month's row for the fund, which
 * is how a mistyped figure is taken back.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    monthKey?: string;
    entries?: { fundId?: string; amount?: string | null }[];
  };

  if (!isValidMonthKey(body.monthKey)) {
    return NextResponse.json({ error: "Pick a month in YYYY-MM format." }, { status: 400 });
  }
  const monthKey = body.monthKey as string;

  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "No entries were sent." }, { status: 400 });
  }

  const entries: { fundId: string; balance: number | null }[] = [];
  for (const entry of body.entries) {
    if (!entry || typeof entry.fundId !== "string" || entry.fundId === "") {
      return NextResponse.json({ error: "An entry arrived without a fund." }, { status: 400 });
    }

    const raw = entry.amount;
    // An empty box means "clear this month's figure", which is a different
    // instruction from an unreadable one — so emptiness is checked before
    // parsing rather than inferred from the parser returning null.
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      entries.push({ fundId: entry.fundId, balance: null });
      continue;
    }

    const cents = parseAmountToCents(raw);
    if (cents === null) {
      return NextResponse.json(
        { error: `"${String(raw)}" is not an amount.` },
        { status: 400 },
      );
    }

    const problem = validateBalance({ monthKey, balance: cents });
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    entries.push({ fundId: entry.fundId, balance: cents });
  }

  const result = await saveBalances(monthKey, entries);

  // The saved grid comes back rather than the caller patching its own state,
  // so the carried markers and the group totals are the server's answer and
  // cannot drift from it.
  const groups = await getFundGroups(monthKey);

  return NextResponse.json({ ...result, monthKey, groups });
}

export const dynamic = "force-dynamic";
