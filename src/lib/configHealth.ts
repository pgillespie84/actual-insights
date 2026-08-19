/**
 * Cross-references configured names against what the sync actually put in the
 * database.
 *
 * Every setting in the household config is matched by exact string — account
 * names, category names, category group names. A name that matches nothing is
 * not an error anywhere: the filter simply excludes nothing, or the group
 * simply totals nothing, and the dashboard shows a confident wrong number.
 * This is the only thing that surfaces those.
 */

/**
 * Kinds that mean "this configured name matched nothing in the database".
 * These are the only ones `report` can produce, since it works by set
 * membership against a table of real names.
 */
type NameKind = "unknown-account" | "unknown-category" | "unknown-group";

/**
 * Kinds that describe the shape of the config itself rather than a name that
 * failed to match, so no database lookup applies.
 */
type ShapeKind = "missing-required-group" | "malformed-list";

export type ProblemKind = NameKind | ShapeKind;

/**
 * constants.ts reads these keys by hand, through `requireGroup`, so a config
 * without one of them throws when the metric is computed — naming the setting —
 * rather than degrading into a wrong number.
 *
 * Not at import, despite what this comment used to say: they are function
 * bodies, so nothing evaluates until a query calls them. This list is what
 * surfaces the same problem on the admin page before a request hits it.
 */
const REQUIRED_NET_WORTH_GROUPS = [
  "Savings",
  "Debt — Loans",
  "Debt — Credit Cards",
  "Retirement",
  "Taxable Investments",
];

export interface ConfigProblem {
  /** Dotted path to the offending setting, e.g. `NET_WORTH_GROUPS.Savings`. */
  setting: string;
  value: string;
  kind: ProblemKind;
}

export interface DatabaseNames {
  accountNames: string[];
  categoryNames: string[];
  groupNames: string[];
}

export interface HealthCheckConfig {
  NET_WORTH_GROUPS?: Record<string, string[]>;
  BUDGET_BUCKETS?: Record<string, string[]>;
  SKIP_CATEGORIES?: string[];
  SKIP_INCOME?: string[];
  BUSINESS_CATEGORIES?: string[];
  EXCLUDED_ACCOUNTS?: string[];
}

export function checkConfigHealth(
  config: HealthCheckConfig,
  db: DatabaseNames,
): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const known: Record<NameKind, Set<string>> = {
    "unknown-account": new Set(db.accountNames),
    "unknown-category": new Set(db.categoryNames),
    "unknown-group": new Set(db.groupNames),
  };

  /**
   * Check one configured list of names against the database.
   *
   * The shape guard lives here rather than at the call sites because every
   * setting reaches the database through this one function, and a value that is
   * a bare string instead of a list would otherwise be iterated character by
   * character — one bogus row per letter. loadConfig.cjs is a raw JSON.parse, so
   * the `string[]` type is a claim about hand-edited JSON rather than something
   * anything enforces.
   */
  const report = (setting: string, values: string[], kind: NameKind) => {
    if (!Array.isArray(values)) {
      problems.push({
        setting,
        value: JSON.stringify(values) ?? String(values),
        kind: "malformed-list",
      });
      return;
    }
    for (const value of values) {
      if (!known[kind].has(value)) problems.push({ setting, value, kind });
    }
  };

  const netWorthGroups = config.NET_WORTH_GROUPS ?? {};
  for (const required of REQUIRED_NET_WORTH_GROUPS) {
    if (!(required in netWorthGroups)) {
      problems.push({
        setting: "NET_WORTH_GROUPS",
        value: required,
        kind: "missing-required-group",
      });
    }
  }

  // No shape check here: report() guards every setting, so a group that is not
  // a list is reported once by the same rule as any other malformed list.
  for (const [group, names] of Object.entries(netWorthGroups)) {
    report(`NET_WORTH_GROUPS.${group}`, names, "unknown-account");
  }

  report("SKIP_CATEGORIES", config.SKIP_CATEGORIES ?? [], "unknown-category");
  report("SKIP_INCOME", config.SKIP_INCOME ?? [], "unknown-category");
  report("BUSINESS_CATEGORIES", config.BUSINESS_CATEGORIES ?? [], "unknown-category");
  report("EXCLUDED_ACCOUNTS", config.EXCLUDED_ACCOUNTS ?? [], "unknown-account");

  // BUDGET_BUCKETS lists category *group* names, matched against
  // Category.groupName rather than Category.name.
  for (const [bucket, groups] of Object.entries(config.BUDGET_BUCKETS ?? {})) {
    report(`BUDGET_BUCKETS.${bucket}`, groups, "unknown-group");
  }

  return problems;
}
