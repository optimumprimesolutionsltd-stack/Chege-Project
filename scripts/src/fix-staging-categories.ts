/**
 * Renames the legacy category names the staging check refuses, to the name
 * they were always meant to become.
 *
 * `verify:staging-categories` reports "rent" and "accommodation" and stops.
 * Nothing existed to act on the report, so a single row created by somebody
 * testing turned that PR check permanently red — and a check that is always
 * red is a check nobody reads, which is worse than not having one.
 *
 * Both names are aliases of Housing. That mapping is not invented here: it is
 * the same one onboarding applies (ONBOARDING_CATEGORY_ALIASES), so a category
 * typed as "Rent" during setup already becomes Housing. Only a category
 * created later, by hand, escapes it.
 *
 * Read-only unless --apply is passed. Never touches production: it refuses
 * anything but STAGING_DATABASE_URL, the same way the verifier does.
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.STAGING_DATABASE_URL;

if (!connectionString) {
  console.error("STAGING_DATABASE_URL is required; refusing to use DATABASE_URL or run against an unspecified database.");
  process.exit(2);
}

const apply = process.argv.includes("--apply");

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
});

/** The canonical name each legacy alias becomes. */
const CANONICAL = "Housing";
const LEGACY = ["rent", "accommodation"];

type Renameable = {
  label: string;
  find: string;
  rename: string;
};

const targets: Renameable[] = [
  {
    label: "budget_categories.name",
    find: `SELECT id, group_id, name FROM budget_categories WHERE lower(btrim(name)) = ANY($1)`,
    rename: `UPDATE budget_categories SET name = $2 WHERE lower(btrim(name)) = ANY($1)`,
  },
  {
    label: "expenses.category",
    find: `SELECT id, group_id, category AS name FROM expenses WHERE lower(btrim(category)) = ANY($1)`,
    rename: `UPDATE expenses SET category = $2 WHERE lower(btrim(category)) = ANY($1)`,
  },
  {
    label: "expense_category_allocations.category",
    find: `SELECT id, group_id, category AS name FROM expense_category_allocations WHERE lower(btrim(category)) = ANY($1)`,
    rename: `UPDATE expense_category_allocations SET category = $2 WHERE lower(btrim(category)) = ANY($1)`,
  },
];

async function main() {
  const client = await pool.connect();
  let total = 0;
  const found: Array<{ label: string; rows: Array<{ id: number; group_id: number | null; name: string }> }> = [];

  try {
    for (const target of targets) {
      let rows: Array<{ id: number; group_id: number | null; name: string }> = [];
      try {
        const result = await client.query(target.find, [LEGACY]);
        rows = result.rows;
      } catch (error) {
        // A table this staging database does not have is not a failure; the
        // verifier skips missing relations the same way.
        console.log(`skipped ${target.label}: ${(error as Error).message}`);
        continue;
      }
      if (rows.length === 0) continue;
      found.push({ label: target.label, rows });
      total += rows.length;
    }

    if (total === 0) {
      console.log(`Nothing to rename. No "${LEGACY.join('" or "')}" rows in staging.`);
      return;
    }

    for (const entry of found) {
      console.log(`\n${entry.label} — ${entry.rows.length} row(s)`);
      for (const row of entry.rows) {
        console.log(`  group ${row.group_id ?? "?"} · id ${row.id} · "${row.name}" -> "${CANONICAL}"`);
      }
    }

    if (!apply) {
      console.log(`\n${total} row(s) would be renamed to "${CANONICAL}". Nothing has been changed.`);
      console.log("Re-run with --apply to rename them.\n");
      return;
    }

    // One transaction: a half-renamed database would leave the check red and
    // the data inconsistent, which is worse than either state alone.
    await client.query("BEGIN");
    try {
      for (const target of targets) {
        try {
          await client.query(target.rename, [LEGACY, CANONICAL]);
        } catch (error) {
          console.log(`skipped ${target.label}: ${(error as Error).message}`);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`\nRenamed ${total} row(s) to "${CANONICAL}". Re-run verify:staging-categories to confirm.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
