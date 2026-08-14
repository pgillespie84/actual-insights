import { runScript } from "./runScript";
import { startJob, type JobName } from "./jobRegistry";

/**
 * The three maintenance jobs the admin page can start, and the scripts behind
 * them. Kept in one place so the route does not build command lines itself.
 */
export const JOB_LABELS: Record<JobName, string> = {
  sync: "Sync from Actual Budget",
  snapshots: "Rebuild balance history",
  insights: "Regenerate AI insights",
};

/**
 * Starts a job. `month` applies to insights only: a YYYY-MM key regenerates
 * that one month, and omitting it rebuilds every month.
 *
 * The month is validated again inside the script by parseInsightArgs, so a
 * junk value fails there rather than producing an insight for nothing.
 */
export function startAdminJob(name: JobName, month?: string) {
  switch (name) {
    case "sync":
      return startJob(name, () => runScript("sync.cjs"));
    case "snapshots":
      return startJob(name, () => runScript("backfill-snapshots.cjs"));
    case "insights":
      return startJob(name, () =>
        runScript("generate-insight.cjs", [month ? `--month=${month}` : "--backfill"]),
      );
  }
}
