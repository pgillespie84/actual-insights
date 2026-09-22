const fs = require("node:fs");
const path = require("node:path");

/**
 * Reports where `loadConfig()` would read the config from, and whether that is
 * the tracked placeholder rather than a real household config.
 *
 * Resolution order: $DASHBOARD_CONFIG_JSON (the whole config inline, for
 * single-container installs with nothing mounted), then $DASHBOARD_CONFIG,
 * then config/dashboard.json, then config/dashboard.example.json.
 *
 * `cwd` and `env` are arguments so this can be tested against a fixture tree.
 *
 * `missingPath` is set when $DASHBOARD_CONFIG names a file that is not there.
 * Falling through to the next candidate is still the right behaviour, but
 * doing it silently makes a wrong path indistinguishable from an unset one —
 * and the advice that follows, "set DASHBOARD_CONFIG", is then advice the
 * reader has already taken. The commonest way to get this wrong is a host
 * path on a containerised install, where /mnt/user/appdata/... exists on the
 * machine and not inside the container.
 *
 * @param {{cwd?: string, env?: Record<string, string | undefined>}} [options]
 * @returns {{path: string | null, contents: string | null, isExample: boolean,
 *   missingPath: string | null}}
 */
function resolveConfigSource(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const inline = env.DASHBOARD_CONFIG_JSON?.trim();
  if (inline) {
    return { path: null, contents: inline, isExample: false, missingPath: null };
  }

  const example = path.join(cwd, "config", "dashboard.example.json");
  // Resolved against cwd, so a relative $DASHBOARD_CONFIG lands in the same
  // place as the built-in candidates and compares equal to them. The test
  // suite is run with DASHBOARD_CONFIG pointed at the example, and without
  // this it would not be recognised as the example.
  const candidates = [
    env.DASHBOARD_CONFIG,
    path.join(cwd, "config", "dashboard.json"),
    example,
  ]
    .filter(Boolean)
    .map((file) => path.resolve(cwd, file));

  // Resolved the same way the candidate was, so the message names the path
  // that was actually looked for rather than the raw variable — a relative
  // DASHBOARD_CONFIG is otherwise reported as something no one can check.
  const configured = env.DASHBOARD_CONFIG
    ? path.resolve(cwd, env.DASHBOARD_CONFIG)
    : null;
  const missingPath = configured && !fs.existsSync(configured) ? configured : null;

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return { path: file, contents: null, isExample: file === example, missingPath };
    }
  }

  throw new Error(`No dashboard config found. Looked in: ${candidates.join(", ")}`);
}

module.exports = { resolveConfigSource };
