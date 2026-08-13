import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { renderRoute } from "@/lib/renderRoute";
import { sendDashboardEmail } from "@/lib/mailer";
import { getCurrentMonthKeyET } from "@/lib/timezone";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const month = (body as { month?: string }).month || getCurrentMonthKeyET();

    const pdfBuffer = await renderRoute(`/?month=${month}&print=1`, {
      viewport: { width: 1280, height: 900 },
    });

    await sendDashboardEmail({ month, pdfBuffer });

    return NextResponse.json({ ok: true, month });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && (err as NodeJS.ErrnoException).cause;
    console.error("[email/send] Failed:", message, cause ? `(cause: ${cause})` : "");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
