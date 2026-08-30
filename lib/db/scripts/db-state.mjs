/**
 * What the database actually looks like, versus what the repository expects.
 *
 * Read-only. Written because `drizzle-kit migrate` failed twice against
 * production and printed no reason at all — its spinner swallows the
 * exception, so even redirecting output to a file yielded nothing but pnpm's
 * "the thing I ran failed". When the tool cannot say what is wrong, ask the
 * database.
 */

import { Client } from "pg";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const tables = (
  await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )
).rows.map((row) => row.table_name);

console.log(`\nTables in this database (${tables.length}):`);
for (const table of tables) console.log(`   ${table}`);

let applied = [];
try {
  applied = (
    await client.query(
      "select hash, created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
} catch (error) {
  console.log(`\nNo drizzle journal table found: ${error.message}`);
  console.log("That means drizzle has never recorded a migration here.");
}

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`\nRecorded as applied: ${applied.length}`);
console.log(`Migration files in the repository: ${files.length}`);
files.forEach((file, index) => {
  console.log(`   ${index < applied.length ? "applied" : "PENDING"}  ${file}`);
});

// The specific things the three newest migrations are supposed to create. This
// is the question that matters: whether the schema is there, regardless of what
// the journal claims.
const checks = [
  ["expense_category_allocations", null],
  ["expense_category_allocations", "position"],
  ["joint_account_transactions", "bank_transfer_id"],
  ["joint_account_transactions", "bank_transfer_account_id"],
];

console.log("\nWhat 0008 to 0010 should have created:");
for (const [table, column] of checks) {
  let present;
  if (column === null) {
    present = tables.includes(table);
  } else {
    const result = await client.query(
      "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
      [table, column],
    );
    present = result.rowCount > 0;
  }
  const label = column ? `${table}.${column}` : table;
  console.log(`   ${present ? "present" : "MISSING"}  ${label}`);
}

await client.end();
console.log("");
