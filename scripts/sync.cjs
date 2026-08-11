globalThis.navigator = { platform: "linux", userAgent: "" };

const api = require("@actual-app/api");
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");

const { SKIP_CATEGORIES, SKIP_INCOME } = loadConfig();

const skipNames = new Set([...SKIP_CATEGORIES, ...SKIP_INCOME]);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const fs = require("fs");
  const dataDir = process.env.ACTUAL_DATA_DIR || "/tmp/actual-sync-data";
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  console.log("Initializing Actual API...");
  await api.init({
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
    dataDir,
  });

  console.log("Downloading budget...");
  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);

  let totalRecords = 0;

  try {
    // 1. Sync accounts
    console.log("Syncing accounts...");
    const accounts = await api.getAccounts();
    for (const acct of accounts) {
      const balance = await api.getAccountBalance(acct.id);
      await pool.query(
        `INSERT INTO "Account" (id, name, type, balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name=$2, type=$3, balance=$4`,
        [acct.id, acct.name, acct.type || null, balance]
      );
    }
    console.log(`  ${accounts.length} accounts synced`);
    totalRecords += accounts.length;

    // 1b. Upsert today's balance snapshot per account (ET date)
    const todayET = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // YYYY-MM-DD
    for (const acct of accounts) {
      const balance = await api.getAccountBalance(acct.id);
      await pool.query(
        `INSERT INTO "AccountBalanceSnapshot" ("accountId", date, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT ("accountId", date) DO UPDATE SET balance = EXCLUDED.balance`,
        [acct.id, todayET, balance]
      );
    }
    console.log(`  ${accounts.length} balance snapshots upserted for ${todayET}`);

    // 2. Sync categories
    console.log("Syncing categories...");
    const categoriesRaw = await api.getCategories();
    const categoryGroups = await api.getCategoryGroups();
    const groupMap = new Map(categoryGroups.map((g) => [g.id, g.name]));

    const categories = categoriesRaw.filter((c) => "group_id" in c);
    for (const cat of categories) {
      const groupName = groupMap.get(cat.group_id) || null;
      await pool.query(
        `INSERT INTO "Category" (id, name, "groupName", hidden, "isIncome")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name=$2, "groupName"=$3, hidden=$4, "isIncome"=$5`,
        [cat.id, cat.name, groupName, cat.hidden || false, cat.is_income || false]
      );
    }
    console.log(`  ${categories.length} categories synced`);
    totalRecords += categories.length;

    // 3. Build payee name lookup
    console.log("Fetching payees...");
    const payees = await api.getPayees();
    const payeeMap = new Map(payees.map((p) => [p.id, p.name]));
    console.log(`  ${payees.length} payees loaded`);

    // 4. Sync transactions (per account)
    console.log("Syncing transactions...");
    let txCount = 0;
    const startDate = "2020-01-01";
    const endDate = new Date().toISOString().slice(0, 10);

    for (const acct of accounts) {
      const transactions = await api.getTransactions(acct.id, startDate, endDate);
      for (const tx of transactions) {
        if (tx.is_child) continue;

        const payeeName = tx.payee_name || payeeMap.get(tx.payee) || null;

        await pool.query(
          `INSERT INTO "Transaction" (id, date, amount, payee, notes, "categoryId", "accountId")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET date=$2, amount=$3, payee=$4, notes=$5, "categoryId"=$6, "accountId"=$7`,
          [
            tx.id,
            tx.date,
            tx.amount,
            payeeName,
            tx.notes || null,
            tx.category || null,
            acct.id,
          ]
        );
        txCount++;
      }
    }
    console.log(`  ${txCount} transactions synced`);
    totalRecords += txCount;

    // 5. Sync budget amounts
    console.log("Syncing budget amounts...");
    const budgetMonths = await api.getBudgetMonths();
    let budgetCount = 0;

    for (const month of budgetMonths) {
      const budgetData = await api.getBudgetMonth(month);

      if (budgetData.categoryGroups) {
        for (const group of budgetData.categoryGroups) {
          const cats = group.categories || [];
          for (const cat of cats) {
            if (!cat.budgeted && cat.budgeted !== 0) continue;

            await pool.query(
              `INSERT INTO "CategoryBudget" (id, month, "budgetedAmount", "categoryId")
               VALUES (gen_random_uuid(), $1, $2, $3)
               ON CONFLICT ("categoryId", month) DO UPDATE SET "budgetedAmount"=$2`,
              [month, cat.budgeted, cat.id]
            );
            budgetCount++;
          }
        }
      }
    }
    console.log(`  ${budgetCount} budget entries synced`);
    totalRecords += budgetCount;

    // 6. Log the sync
    await pool.query(
      `INSERT INTO "SyncLog" (id, "syncedAt", status, message, "recordCount")
       VALUES (gen_random_uuid(), NOW(), 'success', 'Full sync completed', $1)`,
      [totalRecords]
    );

    console.log(`\nSync complete! ${totalRecords} total records synced.`);

    // Generate AI insight (non-fatal)
    if (process.env.ANTHROPIC_API_KEY) {
      console.log("\nGenerating AI insight...");
      try {
        const { execSync } = require("child_process");
        execSync("node scripts/generate-insight.cjs", {
          stdio: "inherit",
          env: { ...process.env },
        });
      } catch (insightError) {
        console.error("AI insight generation failed (non-fatal):", insightError.message);
      }
    } else {
      console.log("\nSkipping AI insight (ANTHROPIC_API_KEY not set).");
    }
  } catch (error) {
    console.error("Sync failed:", error);
    await pool.query(
      `INSERT INTO "SyncLog" (id, "syncedAt", status, message)
       VALUES (gen_random_uuid(), NOW(), 'error', $1)`,
      [error.message]
    );
    throw error;
  } finally {
    await api.shutdown();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
