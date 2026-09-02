import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.STAGING_DATABASE_URL;

if (!connectionString) {
  console.error("STAGING_DATABASE_URL is required; refusing to use DATABASE_URL or run against an unspecified database.");
  process.exit(2);
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
});

const legacyPredicate = `lower(btrim(name)) IN ('rent', 'accommodation')`;

const legacyQueries = [
  {
    source: "budget_categories",
    sql: `SELECT count(*)::int AS count FROM budget_categories WHERE ${legacyPredicate}`,
  },
  {
    source: "expenses",
    sql: `SELECT count(*)::int AS count FROM expenses WHERE lower(btrim(category)) IN ('rent', 'accommodation')`,
  },
  {
    source: "expense_category_allocations",
    sql: `SELECT count(*)::int AS count FROM expense_category_allocations WHERE lower(btrim(category)) IN ('rent', 'accommodation')`,
  },
  {
    source: "joint_account_transactions",
    sql: `SELECT count(*)::int AS count FROM joint_account_transactions WHERE lower(btrim(expense_category)) IN ('rent', 'accommodation')`,
  },
  {
    source: "budget_plan_categories",
    sql: `SELECT count(*)::int AS count FROM budget_plan_categories WHERE lower(btrim(category_name)) IN ('rent', 'accommodation')`,
  },
  {
    source: "onboarding_category_selections",
    sql: `SELECT count(*)::int AS count FROM onboarding_category_selections WHERE lower(btrim(name)) IN ('rent', 'accommodation')`,
  },
  {
    source: "onboarding_budget_allocations",
    sql: `SELECT count(*)::int AS count FROM onboarding_budget_allocations WHERE lower(btrim(category_name)) IN ('rent', 'accommodation')`,
  },
  {
    source: "onboarding_preferences.category_names",
    sql: `
      SELECT count(*)::int AS count
      FROM onboarding_preferences
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(category_names) AS item(name)
        WHERE lower(btrim(item.name)) IN ('rent', 'accommodation')
      )
    `,
  },
];

const foreignKeyQueries = [
  {
    relationship: "expense_category_allocations -> expenses",
    sql: `
      SELECT count(*)::int AS count
      FROM expense_category_allocations allocation
      LEFT JOIN expenses expense
        ON expense.id = allocation.expense_id
       AND expense.group_id = allocation.group_id
      WHERE expense.id IS NULL
    `,
  },
  {
    relationship: "budget_plan_categories -> budget_plans",
    sql: `
      SELECT count(*)::int AS count
      FROM budget_plan_categories plan_category
      LEFT JOIN budget_plans plan ON plan.id = plan_category.budget_plan_id
      WHERE plan.id IS NULL
    `,
  },
  {
    relationship: "budget_plan_categories -> budget_categories",
    sql: `
      SELECT count(*)::int AS count
      FROM budget_plan_categories plan_category
      WHERE plan_category.budget_category_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM budget_categories category
          WHERE category.id = plan_category.budget_category_id
        )
    `,
  },
  {
    relationship: "joint_account_transactions -> expenses",
    sql: `
      SELECT count(*)::int AS count
      FROM joint_account_transactions transaction
      WHERE transaction.expense_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM expenses expense
          WHERE expense.id = transaction.expense_id
        )
    `,
  },
  {
    relationship: "onboarding_category_selections -> onboarding_preferences",
    sql: `
      SELECT count(*)::int AS count
      FROM onboarding_category_selections selection
      WHERE NOT EXISTS (
        SELECT 1
        FROM onboarding_preferences preference
        WHERE preference.id = selection.onboarding_preference_id
      )
    `,
  },
  {
    relationship: "onboarding_budget_allocations -> onboarding_preferences",
    sql: `
      SELECT count(*)::int AS count
      FROM onboarding_budget_allocations allocation
      WHERE NOT EXISTS (
        SELECT 1
        FROM onboarding_preferences preference
        WHERE preference.id = allocation.onboarding_preference_id
      )
    `,
  },
];

async function countRows(client: pg.PoolClient, sql: string): Promise<number> {
  const result = await client.query<{ count: number }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL lock_timeout = '5s'");

    const database = await client.query<{ database: string; user: string }>(
      "SELECT current_database() AS database, current_user AS user",
    );

    const legacyRows = Object.fromEntries(
      await Promise.all(
        legacyQueries.map(async ({ source, sql }) => [source, await countRows(client, sql)] as const),
      ),
    );

    const duplicateCategories = await client.query<{
      group_id: number | null;
      normalized_name: string;
      duplicate_count: number;
      category_ids: number[];
      stored_names: string[];
    }>(`
      SELECT
        group_id,
        lower(btrim(name)) AS normalized_name,
        count(*)::int AS duplicate_count,
        array_agg(id ORDER BY id) AS category_ids,
        array_agg(name ORDER BY id) AS stored_names
      FROM budget_categories
      GROUP BY group_id, lower(btrim(name))
      HAVING count(*) > 1
      ORDER BY group_id, normalized_name
    `);

    const foreignKeyViolations = Object.fromEntries(
      await Promise.all(
        foreignKeyQueries.map(async ({ relationship, sql }) => [relationship, await countRows(client, sql)] as const),
      ),
    );

    const legacyTotal = Object.values(legacyRows).reduce((total, count) => total + count, 0);
    const foreignKeyTotal = Object.values(foreignKeyViolations).reduce((total, count) => total + count, 0);
    const duplicateTotal = duplicateCategories.rows.reduce(
      (total: number, row: { duplicate_count: number }) => total + Number(row.duplicate_count),
      0,
    );
    const passed = legacyTotal === 0 && duplicateTotal === 0 && foreignKeyTotal === 0;

    console.log(JSON.stringify({
      database: database.rows[0]?.database,
      databaseUser: database.rows[0]?.user,
      readOnly: true,
      legacyRows,
      legacyTotal,
      normalizedCategoryDuplicates: duplicateCategories.rows,
      duplicateTotal,
      foreignKeyViolations,
      foreignKeyTotal,
      passed,
    }, null, 2));

    await client.query("ROLLBACK");
    transactionStarted = false;

    if (!passed) {
      console.error("Staging verification failed: legacy aliases, normalized duplicates, or foreign-key violations were found.");
      process.exitCode = 1;
    }
  } finally {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Staging verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
