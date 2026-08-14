import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getJobStatus, type JobName } from "@/lib/jobRegistry";
import { startAdminJob } from "@/lib/adminJobs";

const JOB_NAMES: JobName[] = ["sync", "snapshots", "insights"];

// isAuthenticated(), never hasReadAccess(): the PDF renderer's read-only token
// must not be able to start a sync.

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    jobs: Object.fromEntries(JOB_NAMES.map((name) => [name, getJobStatus(name)])),
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    job?: string;
    month?: string;
  };

  if (!JOB_NAMES.includes(body.job as JobName)) {
    return NextResponse.json({ error: `unknown job "${body.job}"` }, { status: 400 });
  }
  const name = body.job as JobName;

  const result = startAdminJob(name, body.month);
  if (!result.started) {
    // Not an error the user can fix by retrying immediately, so it is a
    // conflict rather than a failure.
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ started: name, status: getJobStatus(name) });
}
