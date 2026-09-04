/**
 * Record migrations that are already in the schema but missing from the journal.
 *
 * `drizzle-kit push` applies schema changes straight to the database and never
 * writes to drizzle's journal. Production has been pushed to at some point, so
 * the schema is complete while the journal still stops at 0004. Every later
 * migration is therefore "pending", and `migrate` dies trying to CREATE TABLE
 * something that already exists — silently, because drizzle-kit eats the error.
 *
 * This does not run any migration SQL. For each pending migration it checks
 * that the tables and columns that migration creates are genuinely present,
 * and only then records it as applied. A migration whose objects are missing is
 * reported and left alone: that one really does need to run.
 *
 * Read-only unless --apply is passed.
 */

import { Client } from "pg";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/**
 * What each migration creates, so its presence can be verified rather than
 * assumed. A migration absent from this map is never auto-recorded.
 */
const CREATES = {
  "0005_group_plan": [["groups", "plan"]],
  "0006_windy_trauma": [["groups", "default_monthly_target"]],
  "0007_deep_preak": [["joint_account_transactions", "bank_charge"]],
  "0008_expense_category_allocations": [["expense_category_allocations", null]],
  "0009_expense_category_allocation_positions": [["expense_category_allocations", "position"]],
  "0010_bank_to_bank_transfers": [
    ["joint_account_transactions", "bank_transfer_id"],
    ["joint_account_transactions", "bank_transfer_account_id"],
  ],
};

const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function exists(table, column) {
  const result = column
    ? await client.query(
        "select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2",
        [table, column],
      )
    : await client.query(
        "select 1 from information_schema.tables where table_schema='public' and table_name=$1",
        [table],
      );
  return result.rowCount > 0;
}

const journal = JSON.parse(
  readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
);

const recorded = new Set(
  (await client.query("select hash from drizzle.__drizzle_migrations")).rows.map((r) => r.hash),
);

console.log(`\nJournal rows in the database: ${recorded.size}`);
console.log(`Migrations in the repository: ${journal.entries.length}\n`);

const toRecord = [];
for (const entry of journal.entries) {
  const sql = readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");

  if (recorded.has(hash)) {
    console.log(`   recorded   ${entry.tag}`);
    continue;
  }

  const creates = CREATES[entry.tag];
  if (!creates) {
    console.log(`   UNKNOWN    ${entry.tag}  (not in the verification map — left alone)`);
    continue;
  }

  const missing = [];
  for (const [table, column] of creates) {
    if (!(await exists(table, column))) missing.push(column ? `${table}.${column}` : table);
  }

  if (missing.length > 0) {
    console.log(`   NEEDS RUN  ${entry.tag}  (missing: ${missing.join(", ")})`);
    continue;
  }

  console.log(`   in schema  ${entry.tag}  -> can be recorded as applied`);
  toRecord.push({ tag: entry.tag, hash, when: entry.when });
}

if (toRecord.length === 0) {
  console.log("\nNothing to record.\n");
} else if (!apply) {
  console.log(
    `\n${toRecord.length} migration(s) are already in the schema but not in the journal.`,
  );
  console.log("Re-run with --apply to record them. Nothing has been changed.\n");
} else {
  for (const { tag, hash, when } of toRecord) {
    await client.query(
      'insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)',
      [hash, when],
    );
    console.log(`   recorded   ${tag}`);
  }
  console.log(`\nRecorded ${toRecord.length}. \`migrate\` should now be a no-op.\n`);
}

await client.end();
