/**
 * Pure parser for the SPOTLIGHT_CATEGORIES env var.
 *
 * Contract: comma-separated list of EXACTLY 3 non-empty category names.
 * Returns null if missing or invalid; the dashboard hides the spotlight column
 * when null.
 */

const REQUIRED_COUNT = 3;

export function parseSpotlightCategories(raw: string | undefined): string[] | null {
  if (raw === undefined || raw === null) return null;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length !== REQUIRED_COUNT) return null;
  if (parts.some((p) => p.length === 0)) return null;
  return parts;
}

export function getSpotlightCategories(): string[] | null {
  return parseSpotlightCategories(process.env.SPOTLIGHT_CATEGORIES);
}
