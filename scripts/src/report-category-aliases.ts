/**
 * Reports the alias categories the staging integrity check refuses, and says
 * what can be done about each one.
 *
 * This used to rename "rent" and "accommodation" to Housing. That cannot work:
 * budget_categories has a unique index on (group_id, lower(btrim(name))), and
 * the case that actually occurs is a group holding *both* the alias and
 * Housing — which is the whole reason the check fires. The rename would have
 * violated the index, rolled back, and changed nothing.
 *
 * Removing an unused alias is migration 0034, which runs unattended and proves
 * every reference is absent before deleting a row.
 *
 * What is left for a person is the case a migration must not decide: an alias
 * somebody has actually spent against. Merging that one moves money between
 * categories and may add two budgets together — a judgement about someone's
 * budget, not a schema change.
 *
 * So this reports and never writes. It refuses anything but
 * STAGING_DATABASE_URL, the same way the verifier does.
 */
import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.CATEGORY_CHECK_DATABASE_URL ?? process.env.STAGING_DATABASE_URL;

if (!connectionString) {
  console.error("CATEGORY_CHECK_DATABASE_URL is required; refusing to use DATABASE_URL or run against an unspecified database.");
  process.exit(2);
}

if (process.argv.includes("--apply")) {
  console.error("This script no longer writes. Removing an unused alias is migration 0034; an alias that has been used needs a decision, not a script.");
  process.exit(2);
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
});

/** Alias -> the name the app already treats it as. */
const ALIAS_OF: Record<string, string> = { rent: "Housing", accommodation: "Housing" };

type AliasRow = {
  id: number;
  group_id: number | null;
  name: string;
  canonical_present: boolean;
  child_count: number;
  expense_count: number;
  allocation_count: number;
  bank_tx_count: number;
};

const FIND_ALIASES = `
  SELECT alias.id,
         alias.group_id,
         alias.name,
         EXISTS (
           SELECT 1 FROM budget_categories canonical
           WHERE canonical.group_id = alias.group_id
             AND lower(btrim(canonical.name)) = 'housing'
         ) AS canonical_present,
         (SELECT count(*)::int FROM budget_categories child WHERE child.parent_id = alias.id) AS child_count,
         (SELECT count(*)::int FROM expenses e
           WHERE e.group_id = alias.group_id
             AND lower(btrim(e.category)) = lower(btrim(alias.name))) AS expense_count,
         (SELECT count(*)::int FROM expense_category_allocations a
           WHERE a.group_id = alias.group_id
             AND lower(btrim(a.category)) = lower(btrim(alias.name))) AS allocation_count,
         (SELECT count(*)::int FROM joint_account_transactions t
           WHERE t.group_id = alias.group_id
             AND lower(btrim(t.expense_category)) = lower(btrim(alias.name))) AS bank_tx_count
  FROM budget_categories alias
  WHERE lower(btrim(alias.name)) = ANY($1)
  ORDER BY alias.group_id, alias.name
`;

/** What should happen to this row, and why. */
function verdict(row: AliasRow): string {
  const uses = row.expense_count + row.allocation_count + row.bank_tx_count;
  if (!row.canonical_present) {
    return `leave alone — this group has no ${ALIAS_OF[row.name.trim().toLowerCase()] ?? "canonical"} category, so this one is its housing category, not a duplicate`;
  }
  if (row.child_count > 0) {
    return `needs a decision — ${row.child_count} subcategor${row.child_count === 1 ? "y is" : "ies are"} nested under it`;
  }
  if (uses > 0) {
    return `needs a decision — used ${uses} time${uses === 1 ? "" : "s"} (${row.expense_count} expense, ${row.allocation_count} allocation, ${row.bank_tx_count} bank), so merging it moves money`;
  }
  return "migration 0034 removes this — nothing has ever been recorded against it";
}

async function main() {
  const client = await pool.connect();
  try {
    // Print this first. The variable this reads used to be called
    // STAGING_DATABASE_URL and held a production connection string; anybody
    // acting on the rows below needs to know which database they are in.
    const where = await client.query<{ database: string; user: string }>(
      "SELECT current_database() AS database, current_user AS \"user\"",
    );
    console.log(`Reading database "${where.rows[0]?.database}" as "${where.rows[0]?.user}".
`);

    const { rows } = await client.query<AliasRow>(FIND_ALIASES, [Object.keys(ALIAS_OF)]);

    if (rows.length === 0) {
      console.log(`Nothing to report. No "${Object.keys(ALIAS_OF).join('" or "')}" categories in this database.`);
      return;
    }

    console.log(`${rows.length} alias categor${rows.length === 1 ? "y" : "ies"}:\n`);
    for (const row of rows) {
      console.log(`  group ${row.group_id ?? "?"} · id ${row.id} · "${row.name}"`);
      console.log(`    ${verdict(row)}\n`);
    }

    const needsDecision = rows.filter((row) => verdict(row).startsWith("needs a decision"));
    if (needsDecision.length > 0) {
      console.log(`${needsDecision.length} need${needsDecision.length === 1 ? "s" : ""} a person to decide. Nothing has been changed.\n`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
