import { prisma } from "./prisma";
import { CONFIG, CONFIG_SOURCE } from "./constants";
import { checkConfigHealth, type ConfigProblem } from "./configHealth";

export interface AdminHealth {
  config: { path: string; isExample: boolean };
  counts: { accounts: number; categories: number; groups: number };
  months: string[];
  problems: ConfigProblem[];
}

/**
 * Everything the admin page needs to say whether the config still matches the
 * data. Read on the server so the page renders with it already in place.
 */
export async function getAdminHealth(): Promise<AdminHealth> {
  const [accounts, categories, groups, months] = await Promise.all([
    prisma.account.findMany({ select: { name: true } }),
    prisma.category.findMany({ select: { name: true } }),
    prisma.category.findMany({
      where: { groupName: { not: null } },
      select: { groupName: true },
      distinct: ["groupName"],
    }),
    prisma.categoryBudget.findMany({
      select: { month: true },
      distinct: ["month"],
      orderBy: { month: "desc" },
    }),
  ]);

  return {
    config: {
      // A null path means the config arrived as DASHBOARD_CONFIG_JSON.
      path: CONFIG_SOURCE.path ?? "DASHBOARD_CONFIG_JSON",
      isExample: CONFIG_SOURCE.isExample,
    },
    counts: {
      accounts: accounts.length,
      categories: categories.length,
      groups: groups.length,
    },
    months: months.map((m) => m.month),
    problems: checkConfigHealth(CONFIG, {
      accountNames: accounts.map((a) => a.name),
      categoryNames: categories.map((c) => c.name),
      groupNames: groups.map((g) => g.groupName as string),
    }),
  };
}
