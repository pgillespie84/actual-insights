const fs = require("node:fs");

const { resolveConfigSource } = require("./configSource.cjs");

/**
 * Loads the dashboard config.
 *
 * Real household values live in config/dashboard.json, which is gitignored so
 * account names, balances-adjacent identifiers, and family names never enter
 * the repo. config/dashboard.example.json is tracked and acts as the fallback
 * so a fresh clone (and the test suite) boots without any setup.
 *
 * Resolution order lives in resolveConfigSource.cjs, which is also what the
 * admin page reads to report which file won. Keeping one copy matters: the
 * container silently ran on the example file for months because nothing
 * surfaced the fallback, so the fallback now warns.
 *
 * Shared by the Next server code (src/lib/constants.ts) and the CJS scripts.
 *
 * `source` lets a caller that has already resolved one pass it in. constants.ts
 * needs it anyway, to decide whether to show the placeholder banner, so without
 * this the candidate list is walked twice at import — and two walks can in
 * principle disagree about which file won.
 *
 * @param {{cwd?: string, env?: Record<string, string | undefined>,
 *   source?: {path: string | null, contents: string | null, isExample: boolean}}} [options]
 */
function loadConfig(options = {}) {
  const source = options.source ?? resolveConfigSource(options);

  if (source.isExample) {
    console.warn(
      `[config] No household config found — falling back to ${source.path}. ` +
        `Account and category filters will not match your data. ` +
        `Set DASHBOARD_CONFIG_JSON or DASHBOARD_CONFIG.`
    );
  }

  return source.path === null
    ? JSON.parse(source.contents)
    : JSON.parse(fs.readFileSync(source.path, "utf8"));
}

module.exports = { loadConfig };
