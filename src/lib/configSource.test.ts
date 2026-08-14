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
