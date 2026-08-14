/**
 * Tracks the long-running maintenance jobs the admin page starts.
 *
 * State is in memory on purpose. This runs as one Node process in one
 * container, and a job is a child process of it — if the process restarts, the
 * job died with it, so persisting the status would only preserve a lie.
 *
 * The scheduler starts the same sync script on a cron, so its overlap guard
 * lives here rather than privately in scheduler.ts.
 */

export type JobName = "sync" | "snapshots" | "insights";

export type JobState = "idle" | "running" | "success" | "failed";

export interface JobStatus {
  state: JobState;
  startedAt: number | null;
  finishedAt: number | null;
  /** Summary line on success, the error message on failure. */
  message: string | null;
}

const IDLE: JobStatus = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  message: null,
};

const statuses = new Map<JobName, JobStatus>();

export function resetJobRegistry(): void {
  statuses.clear();
}

export function getJobStatus(name: JobName): JobStatus {
  return statuses.get(name) ?? IDLE;
}

export function startJob(
  name: JobName,
  runner: () => Promise<string>,
): { started: true } | { started: false; reason: string } {
  // One at a time across all jobs, not one per job. They write and read the
  // same tables, so overlapping two different jobs is the dangerous case.
  for (const [running, status] of statuses) {
    if (status.state === "running") {
      return { started: false, reason: `${running} is already running` };
    }
  }

  statuses.set(name, {
    state: "running",
    startedAt: Date.now(),
    finishedAt: null,
    message: null,
  });

  const finish = (state: "success" | "failed", message: string) => {
    statuses.set(name, {
      state,
      startedAt: statuses.get(name)?.startedAt ?? null,
      finishedAt: Date.now(),
      message,
    });
  };

  // The caller is an HTTP route that has already responded, so a rejection has
  // nowhere to go but the status record.
  void runner().then(
    (summary) => finish("success", summary),
    (err: unknown) => finish("failed", err instanceof Error ? err.message : String(err)),
  );

  return { started: true };
}
