"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminHealth } from "@/lib/adminHealth";
import type { JobName, JobStatus } from "@/lib/jobRegistry";

const JOBS: { name: JobName; label: string; description: string }[] = [
  {
    name: "sync",
    label: "Sync from Actual Budget",
    description:
      "Re-downloads every account, category, transaction and budget month. This is also a full transaction backfill — there is no incremental window.",
  },
  {
    name: "snapshots",
    label: "Rebuild balance history",
    description:
      "Reconstructs daily balances for the Savings and Debt — Loans accounts by walking transactions backwards from today.",
  },
];

const PROBLEM_LABELS: Record<string, string> = {
  "unknown-account": "no account by this name",
  "unknown-category": "no category by this name",
  "unknown-group": "no category group by this name",
  "missing-required-group": "required group missing from config",
};

function StatusLine({ status }: { status: JobStatus }) {
  if (status.state === "idle") return null;

  const colour =
    status.state === "running"
      ? "text-text-secondary"
      : status.state === "success"
        ? "text-emerald-400"
        : "text-red-400";

  return (
    <p className={`mt-2 flex items-center gap-2 text-sm ${colour}`}>
      {status.state === "running" && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      <span>
        {status.state === "running" ? "Running…" : status.message ?? status.state}
      </span>
    </p>
  );
}

export function AdminPanel({
  health,
  initialJobs,
}: {
  health: AdminHealth;
  initialJobs: Record<JobName, JobStatus>;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [month, setMonth] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const anyRunning = Object.values(jobs).some((j) => j.state === "running");

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/jobs");
    if (res.ok) setJobs(((await res.json()) as { jobs: Record<JobName, JobStatus> }).jobs);
  }, []);

  // Only poll while something is running — otherwise this sits idle for hours.
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void loadJobs(), 2000);
    return () => clearInterval(id);
  }, [anyRunning, loadJobs]);

  async function start(job: JobName, monthArg?: string) {
    setError(null);
    const res = await fetch("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job, month: monthArg }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    void loadJobs();
  }

  function startInsights() {
    if (month === "all") {
      const count = health.months.length;
      const ok = window.confirm(
        `Regenerate every month? That is ${count} months, one Claude API call each, run one after another.`,
      );
      if (!ok) return;
      void start("insights");
    } else {
      void start("insights", month);
    }
  }

  const button =
    "rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Maintenance</h2>
        {anyRunning && (
          <p className="text-sm text-text-secondary">
            One job runs at a time — they read and write the same tables.
          </p>
        )}

        {JOBS.map((job) => (
          <div key={job.name} className="rounded-xl border border-card-border bg-card-bg p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <h3 className="font-medium text-text-primary">{job.label}</h3>
                <p className="mt-1 text-sm text-text-secondary">{job.description}</p>
              </div>
              <button
                className={button}
                disabled={anyRunning}
                onClick={() => void start(job.name)}
              >
                Run
              </button>
            </div>
            <StatusLine status={jobs[job.name]} />
          </div>
        ))}

        <div className="rounded-xl border border-card-border bg-card-bg p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h3 className="font-medium text-text-primary">Regenerate AI insights</h3>
              <p className="mt-1 text-sm text-text-secondary">
                One Claude API call per month, run one after another. Regenerating a
                single month replaces it immediately, ignoring the 24-hour cache.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-text-primary"
              >
                <option value="all">All months</option>
                {health.months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button className={button} disabled={anyRunning} onClick={startInsights}>
                Run
              </button>
            </div>
          </div>
          <StatusLine status={jobs.insights} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Config health</h2>

        <div className="rounded-xl border border-card-border bg-card-bg p-5">
            <p className="text-sm text-text-secondary">
              Loaded from <code className="text-text-primary">{health.config.path}</code>
              {health.config.isExample && (
                <span className="ml-2 text-warning-text">— this is the placeholder file</span>
              )}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Database has {health.counts.accounts} accounts, {health.counts.categories}{" "}
              categories, {health.counts.groups} category groups.
            </p>

            {health.problems.length === 0 ? (
              <p className="mt-4 text-sm text-emerald-400">
                Every configured name matches something in the database.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-sm text-warning-text">
                  {health.problems.length} configured{" "}
                  {health.problems.length === 1 ? "name matches" : "names match"} nothing in
                  the database. These filter and total silently, so the numbers on the
                  dashboard are wrong rather than missing.
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="text-text-secondary">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Setting</th>
                      <th className="py-2 pr-4 font-medium">Value</th>
                      <th className="py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="text-text-primary">
                    {health.problems.map((p) => (
                      <tr key={`${p.setting}:${p.value}`} className="border-t border-card-border">
                        <td className="py-2 pr-4 font-mono text-xs">{p.setting}</td>
                        <td className="py-2 pr-4">{p.value}</td>
                        <td className="py-2 text-text-secondary">
                          {PROBLEM_LABELS[p.kind] ?? p.kind}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          )}
        </div>
      </section>
    </div>
  );
}
