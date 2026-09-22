import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfigSource } from "./configSource.cjs";

// The container ran on config/dashboard.example.json for months without
// anyone noticing: the Unraid template never set DASHBOARD_CONFIG, the real
// config is kept out of the image on purpose, and loadConfig() falls through
// to the example silently. Callers need to be able to tell which file won.

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-source-"));
  fs.mkdirSync(path.join(dir, "config"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeConfig(name: string) {
  fs.writeFileSync(path.join(dir, "config", name), "{}");
}

test("falling back to the example file is reported as such", () => {
  writeConfig("dashboard.example.json");

  const source = resolveConfigSource({ cwd: dir, env: {} });

  expect(source.path).toBe(path.join(dir, "config", "dashboard.example.json"));
  expect(source.isExample).toBe(true);
});

test("DASHBOARD_CONFIG aimed at the example is still the example", () => {
  // The test suite is run this way on purpose, and a relative path here would
  // otherwise compare unequal to the absolute fallback and pass as real.
  writeConfig("dashboard.example.json");

  const source = resolveConfigSource({
    cwd: dir,
    env: { DASHBOARD_CONFIG: "config/dashboard.example.json" },
  });

  expect(source.path).toBe(path.join(dir, "config", "dashboard.example.json"));
  expect(source.isExample).toBe(true);
});

test("a real config alongside the example wins and is not flagged", () => {
  writeConfig("dashboard.example.json");
  writeConfig("dashboard.json");

  const source = resolveConfigSource({ cwd: dir, env: {} });

  expect(source.path).toBe(path.join(dir, "config", "dashboard.json"));
  expect(source.isExample).toBe(false);
});

test("a DASHBOARD_CONFIG pointing at nothing is reported, not passed over in silence", () => {
  // The failure this exists for: on a container, the variable is set to the
  // host path. That directory is real on the machine and absent inside the
  // container, so the walk falls through to the example and the advice that
  // follows — "set DASHBOARD_CONFIG" — is advice already taken.
  writeConfig("dashboard.example.json");

  const source = resolveConfigSource({
    cwd: dir,
    env: { DASHBOARD_CONFIG: "/mnt/user/appdata/actual-dashboard/config.json" },
  });

  expect(source.isExample).toBe(true);
  expect(source.missingPath).toBe("/mnt/user/appdata/actual-dashboard/config.json");
});

test("a relative DASHBOARD_CONFIG is reported as the path actually looked for", () => {
  // Echoing the raw variable would name something the reader cannot check.
  writeConfig("dashboard.example.json");

  const source = resolveConfigSource({
    cwd: dir,
    env: { DASHBOARD_CONFIG: "config/nope.json" },
  });

  expect(source.missingPath).toBe(path.join(dir, "config", "nope.json"));
});

test("a DASHBOARD_CONFIG that exists reports no missing path", () => {
  writeConfig("dashboard.example.json");
  writeConfig("real.json");

  const source = resolveConfigSource({
    cwd: dir,
    env: { DASHBOARD_CONFIG: path.join(dir, "config", "real.json") },
  });

  expect(source.isExample).toBe(false);
  expect(source.missingPath).toBeNull();
});

test("inline JSON wins and says nothing about a stale DASHBOARD_CONFIG", () => {
  // The inline config is in use, so the unused path is not a problem to
  // report — saying so would send the reader after a variable that is doing
  // no harm.
  writeConfig("dashboard.example.json");

  const source = resolveConfigSource({
    cwd: dir,
    env: { DASHBOARD_CONFIG_JSON: "{}", DASHBOARD_CONFIG: "/nowhere/config.json" },
  });

  expect(source.path).toBeNull();
  expect(source.missingPath).toBeNull();
});
