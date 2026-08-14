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
 * @param {{cwd?: string, env?: Record<string, string | undefined>}} [options]
 * @returns {{path: string | null, contents: string | null, isExample: boolean}}
 */
function resolveConfigSource(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const inline = env.DASHBOARD_CONFIG_JSON?.trim();
  if (inline) {
    return { path: null, contents: inline, isExample: false };
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

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return { path: file, contents: null, isExample: file === example };
    }
  }

  throw new Error(`No dashboard config found. Looked in: ${candidates.join(", ")}`);
}

module.exports = { resolveConfigSource };
