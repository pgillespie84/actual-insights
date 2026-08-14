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

export function getSavingsAccountNames(): string[] {
  return NET_WORTH_GROUPS["Savings"];
}

export function getNonMortgageDebtAccountNames(): string[] {
  return NET_WORTH_GROUPS["Debt — Loans"];
}

export function getInvestmentAccountNames(): string[] {
  return [
    ...NET_WORTH_GROUPS["Retirement"],
    ...NET_WORTH_GROUPS["Taxable Investments"],
  ];
}
