import { loadConfig } from "./loadConfig.cjs";
import { resolveConfigSource } from "./configSource.cjs";

export interface DashboardConfig {
  HOUSEHOLD_NAMES: string;
  SKIP_CATEGORIES: string[];
  SKIP_INCOME: string[];
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
 * the setting. `checkConfigHealth` reports the same problem on the admin page.
 */
export function requireGroup(
  groups: Record<string, string[]>,
  key: string,
): string[] {
  const names = groups[key];
  if (!Array.isArray(names)) {
    throw new Error(
      `Config is missing NET_WORTH_GROUPS["${key}"], or it is not a list of ` +
        `account names. Add it to the dashboard config — this metric cannot ` +
        `be computed without it.`,
    );
  }
  return names;
}

export function getSavingsAccountNames(): string[] {
  return requireGroup(NET_WORTH_GROUPS, "Savings");
}

export function getNonMortgageDebtAccountNames(): string[] {
  return requireGroup(NET_WORTH_GROUPS, "Debt — Loans");
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
    ...requireGroup(NET_WORTH_GROUPS, "Debt — Loans"),
    ...requireGroup(NET_WORTH_GROUPS, "Debt — Credit Cards"),
  ];
}

export function getInvestmentAccountNames(): string[] {
  return [
    ...requireGroup(NET_WORTH_GROUPS, "Retirement"),
    ...requireGroup(NET_WORTH_GROUPS, "Taxable Investments"),
  ];
}
