import { loadConfig } from "./loadConfig.cjs";
import { resolveConfigSource } from "./configSource.cjs";
import { syncedFundGroup } from "./fundsFromActual.cjs";

export interface DashboardConfig {
  HOUSEHOLD_NAMES: string;
  SKIP_CATEGORIES: string[];
  SKIP_INCOME: string[];
  TOP_CATEGORY_EXCLUSIONS?: string[];
  SKIP_VENDOR_CATEGORIES?: string[];
  SYNCED_FUND_GROUP?: string;
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

export const CONFIG_SOURCE: {
  path: string | null;
  isExample: boolean;
  /** A $DASHBOARD_CONFIG that named a file that is not there. */
  missingPath: string | null;
} = {
  path: source.path,
  isExample: source.isExample,
  missingPath: source.missingPath ?? null,
};

const config: DashboardConfig = loadConfig({ source });

export const CONFIG = config;

export const SKIP_CATEGORIES: string[] = config.SKIP_CATEGORIES;

export const SKIP_INCOME: string[] = config.SKIP_INCOME;

/**
/**
 * An optional list of names, or an empty one.
 *
 * The `string[]` on the config interface is a claim about hand-edited JSON,
 * not something loadConfig enforces — it is a bare JSON.parse. A bare string
 * is the easy mistake here, since the setting is typed into an Unraid text
 * box: `"SKIP_VENDOR_CATEGORIES": "Mortgage"` would spread character by
 * character into the query and match nothing.
 *
 * The elements are checked too, not just the container. A list holding a
 * number reaches Prisma as a `notIn` against a String column, which rejects
 * the query — so the dashboard route 500s on a typo, where every other bad
 * value in this file degrades to hiding nothing.
 *
 * A bad element costs only itself: the names either side of it still hide
 * what they name. Dropping the whole list would leave the operator reading an
 * admin page that blames one entry while the setting had stopped working
 * entirely. checkConfigHealth reads the raw config rather than this, so the
 * bad value is still reported there.
 *
 * Only the optional key goes through this. SKIP_CATEGORIES and the other
 * required lists stay raw on purpose: they are load-bearing for every expense
 * figure, and quietly emptying one would turn a config typo into wrong money
 * on the page. Those are better off failing where the admin page can name
 * them, which is what checkConfigHealth's malformed-list check is for.
 */
export function optionalNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((name) => typeof name === "string");
}

/**
 * Categories the Top vendors widget hides, on top of the household skip lists.
 *
 * Optional, and empty when absent: every config that predates this key — the
 * one in the running container included, which lives in DASHBOARD_CONFIG_JSON
 * rather than in the repo — has to keep booting. Empty means the widget shows
 * what it always showed, so a config that never sets this is not a broken one.
 *
 * A name here that matches no category is reported on the admin page rather
 * than silently doing nothing, which is the failure mode that matters: the
 * chart looks unchanged either way.
 */
export const SKIP_VENDOR_CATEGORIES: string[] = optionalNameList(
  config.SKIP_VENDOR_CATEGORIES,
);

/**
 * Categories kept out of the Top categories widget.
 *
 * Sibling of SKIP_VENDOR_CATEGORIES above, and the same argument one widget
 * over: the mortgage wins that ranking every month by construction, so a slot
 * spent on it is a slot not spent on something that might change a decision.
 * Two keys rather than one because the two rankings are separate questions and
 * a household may well want the mortgage out of one and not the other.
 *
 * Deliberately not part of SKIP_CATEGORIES. That list removes a category from
 * every figure in the app; this one removes it from a single widget. The money
 * stays in every total, every trend, and everything the AI insight is given —
 * the model needs the complete picture for its totals to reconcile, and the
 * exclusions are about where your attention goes, not about what is true.
 *
 * Optional and empty when absent, through the same helper and for the same
 * reason: a config written before this key existed still has to boot.
 */
export const TOP_CATEGORY_EXCLUSIONS: string[] = optionalNameList(
  config.TOP_CATEGORY_EXCLUSIONS,
);

/**
 * The savings fund group whose figures the sync copies from Actual, or null.
 *
 * Optional and off when absent. Read here only so the admin grid can say
 * which boxes the next sync will overwrite; the writing happens in the sync.
 * See fundsFromActual.cjs.
 */
export const SYNCED_FUND_GROUP: string | null = syncedFundGroup(config);

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
