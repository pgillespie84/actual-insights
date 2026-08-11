const fs = require("node:fs");
const path = require("node:path");

/**
 * Loads the dashboard config.
 *
 * Real household values live in config/dashboard.json, which is gitignored so
 * account names, balances-adjacent identifiers, and family names never enter
 * the repo. config/dashboard.example.json is tracked and acts as the fallback
 * so a fresh clone (and the test suite) boots without any setup.
 *
 * Resolution order: $DASHBOARD_CONFIG, then config/dashboard.json, then
 * config/dashboard.example.json — all relative to the process working
 * directory, which is the app root both locally and in the container.
 *
 * Shared by the Next server code (src/lib/constants.ts) and the CJS scripts.
 */
function loadConfig() {
  const candidates = [
    process.env.DASHBOARD_CONFIG,
    path.join(process.cwd(), "config", "dashboard.json"),
    path.join(process.cwd(), "config", "dashboard.example.json"),
  ].filter(Boolean);

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }

  throw new Error(`No dashboard config found. Looked in: ${candidates.join(", ")}`);
}

module.exports = { loadConfig };
