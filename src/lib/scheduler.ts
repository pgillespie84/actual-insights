import { Cron } from "croner";
import { prisma } from "./prisma";
import { getCurrentMonthKeyET, getPreviousMonthKey } from "./timezone";
import { renderRoute } from "./renderRoute";
import { runScript } from "./runScript";
import { startJob } from "./jobRegistry";
import { sendDashboardEmail, sendSyncFailureAlert, sendSyncRecoveryAlert } from "./mailer";

// Module-scope set keeps Cron instances alive (prevents GC).
const jobs = new Set<Cron>();
let started = false;

export interface SyncResultAction {
  logStatus: "success" | "error";
  logMessage: string;
  alert: "failure" | "recovery" | null;
}

export function handleSyncResult(
  code: number,
  durationMs: number,
  prevStatus: string | null,
): SyncResultAction {
  if (code === 0) {
    return {
      logStatus: "success",
      logMessage: `Scheduled sync completed in ${durationMs}ms`,
      alert: prevStatus === "error" ? "recovery" : null,
    };
  }
  return {
    logStatus: "error",
    logMessage: `Scheduled sync exited with code ${code} after ${durationMs}ms`,
    alert: prevStatus !== "error" ? "failure" : null,
  };
}

function log(...args: unknown[]) {
  console.log("[scheduler]", ...args);
}

// ---------------------------------------------------------------------------
// Sync job
// ---------------------------------------------------------------------------

/**
 * Runs the sync script, then logs the outcome and alerts on a change of state.
 *
 * Rethrows on failure so the job registry records it as failed. The registry
 * is also what stops this overlapping an admin-page job — the guard used to be
 * a private `syncRunning` flag here, which the admin buttons could not see.
 */
async function syncAndLog(): Promise<string> {
  const startedAt = Date.now();
  let summary: string | null = null;
  let failure: Error | null = null;

  try {
    summary = await runScript("sync.cjs");
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  const durationMs = Date.now() - startedAt;

  // Atomic read-prev + write-current in a transaction
  const action = await prisma.$transaction(async (tx) => {
    const prev = await tx.syncLog.findFirst({
      orderBy: { syncedAt: "desc" },
      select: { status: true },
    });

    const result = handleSyncResult(failure ? -1 : 0, durationMs, prev?.status ?? null);

    await tx.syncLog.create({
      data: { status: result.logStatus, message: result.logMessage },
    });

    return result;
  });

  log(`sync job tick: ${action.logStatus} in ${durationMs}ms`);

  // Send alerts outside the transaction
  if (action.alert === "recovery") {
    log("sync recovered — sending recovery alert");
    try {
      await sendSyncRecoveryAlert();
    } catch (emailErr) {
      log("failed to send recovery alert:", emailErr);
    }
  } else if (action.alert === "failure") {
    log("sync failed — sending failure alert");
    try {
      await sendSyncFailureAlert(failure ?? new Error(action.logMessage));
    } catch (emailErr) {
      log("failed to send failure alert:", emailErr);
    }
  }

  if (failure) throw failure;
  return summary ?? "completed";
}

function runSyncJob() {
  const result = startJob("sync", syncAndLog);
  if (!result.started) {
    log(`sync job tick: skipped, ${result.reason}`);
    return;
  }
  log("sync job tick: starting");
}

// ---------------------------------------------------------------------------
// Email job
// ---------------------------------------------------------------------------

async function runEmailJob() {
  const month = getPreviousMonthKey(getCurrentMonthKeyET());
  log(`email job tick: rendering dashboard for ${month}`);
  try {
    const pdfBuffer = await renderRoute(`/?month=${month}&print=1`, {
      viewport: { width: 1280, height: 900 },
    });
    log(`email job tick: PDF rendered (${pdfBuffer.length} bytes), sending`);
    await sendDashboardEmail({ month, pdfBuffer });
    log("email job tick: sent successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`email job tick: failed — ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function startScheduler(): Promise<void> {
  if (started) {
    log("already started, skipping");
    return;
  }
  started = true;

  const timezone = process.env.CRON_TIMEZONE || "America/New_York";
  const syncCron = process.env.SYNC_CRON?.trim();
  const emailCron = process.env.EMAIL_CRON?.trim();

  if (!syncCron && !emailCron) {
    log("SYNC_CRON and EMAIL_CRON both unset, no jobs to schedule");
    return;
  }

  try {
    if (syncCron) {
      const job = new Cron(syncCron, { timezone, protect: true }, runSyncJob);
      jobs.add(job);
      log(`sync job registered: "${syncCron}" (tz=${timezone}) next=${job.nextRun()?.toISOString()}`);
    } else {
      log("SYNC_CRON unset, skipping sync schedule");
    }

    if (emailCron) {
      const job = new Cron(emailCron, { timezone, protect: true }, runEmailJob);
      jobs.add(job);
      log(`email job registered: "${emailCron}" (tz=${timezone}) next=${job.nextRun()?.toISOString()}`);
    } else {
      log("EMAIL_CRON unset, skipping email schedule");
    }
    // Covers a bad cron expression or a failed registration. It no longer
    // covers loading croner: that import moved to the top of the file, so a
    // module-load failure crashes at import time rather than arriving here.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`failed to register jobs: ${message}`);
  }
}
