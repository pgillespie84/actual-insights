import { loadConfig } from "./loadConfig.cjs";
import { resolveConfigSource } from "./configSource.cjs";

export interface DashboardConfig {
  HOUSEHOLD_NAMES: string;
  SKIP_CATEGORIES: string[];
  SKIP_INCOME: string[];
  TOP_CATEGORY_EXCLUSIONS: string[];
  BUDGET_BUCKETS: Record<string, string[]>;
  BUSINESS_CATEGORIES: string[];
  EXCLUDED_ACCOUNTS: string[];
  NET_WORTH_GROUPS: Record<string, string[]>;
}

/**
 * Which file (or env var) the config came from, and whether it is the tracked
 * placeholder. The dashboard shows a banner when it is: running on the example
 * means every account and category filter below matches nothing real.
 *
 * Resolved once here and handed to loadConfig, so there is one answer to
 * "which file won" rather than two independent walks of the candidate list.
 */
const source = resolveConfigSource();

export const CONFIG_SOURCE: { path: string | null; isExample: boolean } = {
  path: source.path,
  isExample: source.isExample,
};

const config: DashboardConfig = loadConfig({ source });

export const CONFIG = config;

export const SKIP_CATEGORIES: string[] = config.SKIP_CATEGORIES;

export const SKIP_INCOME: string[] = config.SKIP_INCOME;

/**
 * Categories kept out of the "top spending" rankings on the dashboard.
 *
 * Deliberately separate from SKIP_CATEGORIES. That list removes a category
 * from every figure in the app; this one removes it only from the two widgets
 * that rank categories and payees by size. The mortgage belongs here and not
 * there: it is real money that has to stay in the totals, but it wins the
 * ranking every month by construction, so a slot spent on it is a slot not
 * spent on something that might change a decision.
 *
 * The AI payload is not filtered by this. The model needs the complete picture
 * for its totals to reconcile; the exclusions are about where your attention
 * goes, not about what is true.
 *
 * Optional, so a config written before this setting existed still loads.
 */
export const TOP_CATEGORY_EXCLUSIONS: string[] = config.TOP_CATEGORY_EXCLUSIONS ?? [];

export const BUDGET_BUCKETS: Record<string, string[]> = config.BUDGET_BUCKETS;

export const BUSINESS_CATEGORIES: string[] = config.BUSINESS_CATEGORIES;

export const NET_WORTH_GROUPS: Record<string, string[]> = config.NET_WORTH_GROUPS;

export const EXCLUDED_ACCOUNTS: string[] = config.EXCLUDED_ACCOUNTS;

/**
 * A NET_WORTH_GROUPS entry the queries index by hand, or a legible error.
 *
 * A config missing one of these used to fail in whatever way the caller
 * happened to break. `getSavingsAccountNames()` returned undefined, Prisma
 * dropped the resulting `in: undefined` filter and matched every account,
 * which is a confident wrong number on a rendered page; once the coverage
 * check started calling `.every` on the same value it became a TypeError and a
 * 500 on the whole dashboard. Neither told the reader which setting was wrong.
 *
 * Failing loudly is the right call on a financial figure, but it has to name
 * the setting — which is why the caller passes it rather than this hardcoding
 * one map. `checkConfigHealth` reports both conditions on the admin page, so a
 * bad config is visible before a request reaches this.
 */
export function requireGroup(
  groups: Record<string, string[]>,
  key: string,
  settingName: string,
): string[] {
  const names = groups[key];
  if (!Array.isArray(names)) {
    throw new Error(
      `Config is missing ${settingName}["${key}"], or it is not a list of ` +
        `account names. Add it to the dashboard config — this metric cannot ` +
        `be computed without it.`,
    );
  }
  return names;
}

export function getSavingsAccountNames(): string[] {
  return requireGroup(NET_WORTH_GROUPS, "Savings", "NET_WORTH_GROUPS");
}

export function getNonMortgageDebtAccountNames(): string[] {
  return requireGroup(NET_WORTH_GROUPS, "Debt — Loans", "NET_WORTH_GROUPS");
}

/**
 * Debt you can actually pay down month to month: loans and credit cards.
 *
 * The mortgage is excluded deliberately. A 30-year balance moving a few
 * hundred dollars a month swamps the signal the debt metric exists to show,
 * and it never changes a decision.
 */
export function getPayableDebtAccountNames(): string[] {
  return [
    ...requireGroup(NET_WORTH_GROUPS, "Debt — Loans", "NET_WORTH_GROUPS"),
    ...requireGroup(NET_WORTH_GROUPS, "Debt — Credit Cards", "NET_WORTH_GROUPS"),
  ];
}

export function getInvestmentAccountNames(): string[] {
  return [
    ...requireGroup(NET_WORTH_GROUPS, "Retirement", "NET_WORTH_GROUPS"),
    ...requireGroup(NET_WORTH_GROUPS, "Taxable Investments", "NET_WORTH_GROUPS"),
  ];
}
