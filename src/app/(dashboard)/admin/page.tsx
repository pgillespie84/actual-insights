import { AdminPanel } from "@/components/AdminPanel";
import { getAdminHealth } from "@/lib/adminHealth";
import { getJobStatus, type JobName, type JobStatus } from "@/lib/jobRegistry";

export const dynamic = "force-dynamic";

const JOB_NAMES: JobName[] = ["sync", "snapshots", "insights"];

export default async function AdminPage() {
  const health = await getAdminHealth();
  const jobs = Object.fromEntries(
    JOB_NAMES.map((name) => [name, getJobStatus(name)]),
  ) as Record<JobName, JobStatus>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Run the maintenance scripts and check that the household config still matches
          what is in the database.
        </p>
      </div>
      <AdminPanel health={health} initialJobs={jobs} />
    </div>
  );
}
