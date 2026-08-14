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

export type ProblemKind =
  | "unknown-account"
  | "unknown-category"
  | "unknown-group"
  | "missing-required-group";

/**
 * constants.ts indexes these four keys directly and spreads the result, so a
 * config without one of them throws at import rather than degrading.
 */
const REQUIRED_NET_WORTH_GROUPS = [
  "Savings",
  "Debt — Loans",
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
  const known: Record<ProblemKind, Set<string>> = {
    "unknown-account": new Set(db.accountNames),
    "unknown-category": new Set(db.categoryNames),
    "unknown-group": new Set(db.groupNames),
    "missing-required-group": new Set(),
  };

  const report = (setting: string, values: string[], kind: ProblemKind) => {
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
