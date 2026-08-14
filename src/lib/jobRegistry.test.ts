import { test, expect, beforeEach } from "vitest";
import { startJob, getJobStatus, resetJobRegistry } from "./jobRegistry";

// The admin buttons and the cron scheduler both start the same scripts. They
// all write to the same tables, so exactly one runs at a time, and the page
// polls for what happened.

beforeEach(() => {
  resetJobRegistry();
});

/** A runner the test controls, so nothing is spawned. */
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a job with nothing running starts, and reports itself running", () => {
  const job = deferred();

  const result = startJob("sync", () => job.promise);

  expect(result).toEqual({ started: true });
  expect(getJobStatus("sync").state).toBe("running");
});

test("a different job is refused while one is running", async () => {
  // Not just the same job twice. Sync rewrites Account and Transaction, and
  // the snapshot rebuild reads Transaction to derive balances, so a snapshot
  // run overlapping a sync would reconstruct history from half-synced data.
  const sync = deferred();
  startJob("sync", () => sync.promise);

  const result = startJob("snapshots", () => Promise.resolve("never runs"));

  expect(result).toEqual({ started: false, reason: "sync is already running" });
  expect(getJobStatus("snapshots").state).toBe("idle");

  sync.resolve("done");
  await sync.promise;

  expect(startJob("snapshots", () => Promise.resolve("now it runs"))).toEqual({
    started: true,
  });
});

test("a finished job records success and its summary", async () => {
  const job = deferred();
  startJob("sync", () => job.promise);

  job.resolve("14203 records synced");
  await job.promise;

  const status = getJobStatus("sync");
  expect(status.state).toBe("success");
  expect(status.message).toBe("14203 records synced");
  expect(status.finishedAt).not.toBeNull();
});

test("a failed job records the error message rather than throwing", async () => {
  const job = deferred();
  startJob("sync", () => job.promise);

  job.reject(new Error("exited with code 1"));
  await job.promise.catch(() => {});

  const status = getJobStatus("sync");
  expect(status.state).toBe("failed");
  expect(status.message).toBe("exited with code 1");
});
