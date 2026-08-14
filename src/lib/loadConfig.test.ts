import { test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./loadConfig.cjs";

// Running on the placeholder config is not an error — a fresh clone and the
// test suite both rely on it — but it silently makes every account and
// category filter match nothing real. It has to announce itself.

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-config-"));
  fs.mkdirSync(path.join(dir, "config"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeConfig(name: string, body: object = {}) {
  fs.writeFileSync(path.join(dir, "config", name), JSON.stringify(body));
}

test("falling back to the example config warns, naming the file", () => {
  writeConfig("dashboard.example.json", { HOUSEHOLD_NAMES: "the household" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const config = loadConfig({ cwd: dir, env: {} });

  expect(config.HOUSEHOLD_NAMES).toBe("the household");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0].join(" ")).toContain("dashboard.example.json");
});

test("an already-resolved source is used rather than resolved again", () => {
  // constants.ts needs the resolved source anyway, to decide whether to show
  // the placeholder banner. Passing it in means one walk of the candidate list
  // at import instead of two, and one source of truth for which file won.
  writeConfig("dashboard.example.json", { HOUSEHOLD_NAMES: "the household" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const config = loadConfig({
    source: {
      path: path.join(dir, "config", "dashboard.example.json"),
      contents: null,
      isExample: true,
    },
  });

  expect(config.HOUSEHOLD_NAMES).toBe("the household");
  // Still warns: the caller resolving it does not make the fallback fine.
  expect(warn).toHaveBeenCalledTimes(1);
});

test("DASHBOARD_CONFIG_JSON beats every file and does not warn", () => {
  // Unraid installs one container from a template. Mounting a file is an
  // extra step people skip, so the whole config can arrive as one masked
  // variable instead.
  writeConfig("dashboard.example.json");
  writeConfig("dashboard.json", { HOUSEHOLD_NAMES: "from file" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const config = loadConfig({
    cwd: dir,
    env: { DASHBOARD_CONFIG_JSON: JSON.stringify({ HOUSEHOLD_NAMES: "from env" }) },
  });

  expect(config.HOUSEHOLD_NAMES).toBe("from env");
  expect(warn).not.toHaveBeenCalled();
});

test("a real config loads without warning", () => {
  writeConfig("dashboard.example.json");
  writeConfig("dashboard.json", { HOUSEHOLD_NAMES: "real" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const config = loadConfig({ cwd: dir, env: {} });

  expect(config.HOUSEHOLD_NAMES).toBe("real");
  expect(warn).not.toHaveBeenCalled();
});
