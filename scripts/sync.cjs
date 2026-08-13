globalThis.navigator = { platform: "linux", userAgent: "" };

const api = require("@actual-app/api");
const { Pool } = require("pg");
require("dotenv").config({ override: true });

const { loadConfig } = require("../src/lib/loadConfig.cjs");
const { insertRows } = require("../src/lib/batchInsert.cjs");

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
    // 1. Sync accounts, and today's balance snapshot for each (ET date).
    // One balance fetch feeds both: they used to be two loops asking the API
    // for the same numbers twice.
    console.log("Syncing accounts...");
    const accounts = await api.getAccounts();
    const todayET = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // YYYY-MM-DD

    const accountRows = [];
    const snapshotRows = [];
    for (const acct of accounts) {
      const balance = await api.getAccountBalance(acct.id);
      accountRows.push([acct.id, acct.name, acct.type || null, balance]);
      snapshotRows.push([acct.id, todayET, balance]);
    }

    await insertRows(pool, {
      table: "Account",
      columns: ["id", "name", "type", "balance"],
      conflictTarget: ["id"],
    }, accountRows);
    console.log(`  ${accounts.length} accounts synced`);
    totalRecords += accounts.length;

    await insertRows(pool, {
      table: "AccountBalanceSnapshot",
      columns: ["accountId", "date", "balance"],
      conflictTarget: ["accountId", "date"],
    }, snapshotRows);
    console.log(`  ${accounts.length} balance snapshots upserted for ${todayET}`);

    // 2. Sync categories
    console.log("Syncing categories...");
    const categoriesRaw = await api.getCategories();
    const categoryGroups = await api.getCategoryGroups();
    const groupMap = new Map(categoryGroups.map((g) => [g.id, g.name]));

    const categories = categoriesRaw.filter((c) => "group_id" in c);
    await insertRows(pool, {
      table: "Category",
      columns: ["id", "name", "groupName", "hidden", "isIncome"],
      conflictTarget: ["id"],
    }, categories.map((cat) => [
      cat.id,
      cat.name,
      groupMap.get(cat.group_id) || null,
      cat.hidden || false,
      cat.is_income || false,
    ]));
    console.log(`  ${categories.length} categories synced`);
    totalRecords += categories.length;

    // 3. Build payee name lookup
    console.log("Fetching payees...");
    const payees = await api.getPayees();
    const payeeMap = new Map(payees.map((p) => [p.id, p.name]));
    console.log(`  ${payees.length} payees loaded`);

    // 4. Sync transactions (per account)
    console.log("Syncing transactions...");
    const startDate = "2020-01-01";
    const endDate = new Date().toISOString().slice(0, 10);
    const transactionRows = [];

    for (const acct of accounts) {
      const transactions = await api.getTransactions(acct.id, startDate, endDate);
      for (const tx of transactions) {
        if (tx.is_child) continue;

        transactionRows.push([
          tx.id,
          tx.date,
          tx.amount,
          tx.payee_name || payeeMap.get(tx.payee) || null,
          tx.notes || null,
          tx.category || null,
          acct.id,
        ]);
      }
    }

    await insertRows(pool, {
      table: "Transaction",
      columns: ["id", "date", "amount", "payee", "notes", "categoryId", "accountId"],
      conflictTarget: ["id"],
    }, transactionRows);
    const txCount = transactionRows.length;
    console.log(`  ${txCount} transactions synced`);
    totalRecords += txCount;

    // 5. Sync budget amounts
    console.log("Syncing budget amounts...");
    const budgetMonths = await api.getBudgetMonths();
    const budgetRows = [];

    for (const month of budgetMonths) {
      const budgetData = await api.getBudgetMonth(month);

      if (budgetData.categoryGroups) {
        for (const group of budgetData.categoryGroups) {
          const cats = group.categories || [];
          for (const cat of cats) {
            if (!cat.budgeted && cat.budgeted !== 0) continue;

            budgetRows.push([month, cat.budgeted, cat.id]);
          }
        }
      }
    }

    await insertRows(pool, {
      table: "CategoryBudget",
      expressions: { id: "gen_random_uuid()" },
      columns: ["month", "budgetedAmount", "categoryId"],
      conflictTarget: ["categoryId", "month"],
    }, budgetRows);
    const budgetCount = budgetRows.length;
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
