import { spawn } from "node:child_process";
import path from "node:path";
import type { Cron as CronType } from "croner";
import { prisma } from "./prisma";
import { renderRoute } from "./renderRoute";
import { sendDashboardEmail, sendSyncFailureAlert, sendSyncRecoveryAlert } from "./mailer";

type CronCtor = new (
  expr: string,
  opts: { timezone?: string; protect?: boolean },
  fn: () => void | Promise<void>,
) => CronType;

// Module-scope set keeps Cron instances alive (prevents GC).
const jobs = new Set<CronType>();
let started = false;
let syncRunning = false;

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

function runSyncScript(): Promise<{ code: number; durationMs: number }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "sync.cjs");
    const startedAt = Date.now();
    log("spawning node", scriptPath);
    const child = spawn(process.execPath, [scriptPath], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(`[sync] ${chunk.toString()}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[sync] ${chunk.toString()}`);
    });

    child.on("exit", (code) => {
      resolve({ code: code ?? -1, durationMs: Date.now() - startedAt });
    });
    child.on("error", (err) => {
      process.stderr.write(`[sync] spawn error: ${err.message}\n`);
      resolve({ code: -1, durationMs: Date.now() - startedAt });
    });
  });
}


async function runSyncJob() {
  if (syncRunning) {
    log("sync job tick: already running, skipping");
    return;
  }
  syncRunning = true;

  try {
    log("sync job tick: starting");
    let code: number;
    let durationMs: number;

    try {
      const result = await runSyncScript();
      code = result.code;
      durationMs = result.durationMs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`sync job tick: threw ${message}`);
      code = -1;
      durationMs = 0;
    }

    // Atomic read-prev + write-current in a transaction
    const prevStatus = await prisma.$transaction(async (tx) => {
      const prev = await tx.syncLog.findFirst({
        orderBy: { syncedAt: "desc" },
        select: { status: true },
      });

      const action = handleSyncResult(code, durationMs, prev?.status ?? null);

      await tx.syncLog.create({
        data: { status: action.logStatus, message: action.logMessage },
      });

      return action;
    });

    log(`sync job tick: ${prevStatus.logStatus} in ${durationMs}ms`);

    // Send alerts outside the transaction
    if (prevStatus.alert === "recovery") {
      log("sync recovered — sending recovery alert");
      try {
        await sendSyncRecoveryAlert();
      } catch (emailErr) {
        log("failed to send recovery alert:", emailErr);
      }
    } else if (prevStatus.alert === "failure") {
      log("sync failed — sending failure alert");
      try {
        await sendSyncFailureAlert(new Error(prevStatus.logMessage));
      } catch (emailErr) {
        log("failed to send failure alert:", emailErr);
      }
    }
  } finally {
    syncRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Email job
// ---------------------------------------------------------------------------

function getPreviousMonthKeyET(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);

  // Go back one month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

async function runEmailJob() {
  const month = getPreviousMonthKeyET();
  log(`email job tick: rendering dashboard for ${month}`);
  try {
    const pdfBuffer = await renderRoute(`/?month=${month}&print=1`, {
      format: "pdf",
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
    const mod = (await import("croner")) as unknown as { Cron: CronCtor };

    if (syncCron) {
      const job = new mod.Cron(syncCron, { timezone, protect: true }, runSyncJob);
      jobs.add(job);
      log(`sync job registered: "${syncCron}" (tz=${timezone}) next=${job.nextRun()?.toISOString()}`);
    } else {
      log("SYNC_CRON unset, skipping sync schedule");
    }

    if (emailCron) {
      const job = new mod.Cron(emailCron, { timezone, protect: true }, runEmailJob);
      jobs.add(job);
      log(`email job registered: "${emailCron}" (tz=${timezone}) next=${job.nextRun()?.toISOString()}`);
    } else {
      log("EMAIL_CRON unset, skipping email schedule");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`failed to register jobs: ${message}`);
  }
}
