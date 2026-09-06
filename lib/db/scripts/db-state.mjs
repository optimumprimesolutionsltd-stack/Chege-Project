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
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

// Match the way drizzle itself decides what has run: by the hash of each
// file, not by how many rows the journal happens to hold. Counting rows and
// calling the first N files applied reads plausibly and is wrong whenever the
// journal is out of order or has gaps, which is the exact situation this
// script exists for. It once reported 0009 through 0017 as pending when all
// but one were recorded, and sent an investigation after the wrong migration.
const recordedHashes = new Set(applied.map((row) => row.hash));

// Drizzle iterates the journal, not the directory, so a .sql file missing from
// _journal.json can never run on any database and nothing says so. Two were
// missing here once, and the schema they create reached production only by
// hand.
let registered = new Set();
let journalEntries = [];
try {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
  );
  journalEntries = journal.entries;
  registered = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
} catch (error) {
  console.log(`Could not read the journal metadata: ${error.message}`);
}

/**
 * The silent skip.
 *
 * Drizzle does not run the migrations whose hashes are missing. It reads the
 * single most recently recorded row and runs only those whose journal `when` is
 * greater than its created_at:
 *
 *   if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
 *
 * So a migration registered with a `when` earlier than one already recorded is
 * never executed and never recorded - and `migrate` still prints "All
 * migrations applied. Nothing left pending."
 *
 * That is exactly how 0022, 0023 and 0024 reached production as journal entries
 * with no columns behind them: the older entries had been stamped a day apart
 * into the future, so a real clock reading was in their past.
 */
const latestRecorded = applied.reduce(
  (newest, row) => Math.max(newest, Number(row.created_at) || 0),
  0,
);
// Only the entries after the last one drizzle actually recorded can still be
// skipped. Everything before it has already had its chance to run, and some of
// it was baselined into the journal during the push repair rather than run
// normally - so its file hash does not match and it looks pending forever. A
// warning that cries wolf about six-week-old migrations teaches people to
// scroll past the section, which is how the last three got missed.
const lastRecordedIndex = journalEntries.reduce(
  (last, entry, index) => (recordedHashes.has(hashOfTag(entry.tag)) ? index : last),
  -1,
);
const skipped = journalEntries.filter(
  (entry, index) =>
    index > lastRecordedIndex &&
    !recordedHashes.has(hashOfTag(entry.tag)) &&
    Number(entry.when) <= latestRecorded,
);
const outOfOrder = journalEntries.filter(
  (entry, index) => index > 0 && Number(entry.when) <= Number(journalEntries[index - 1].when),
);

function hashOfTag(tag) {
  try {
    return createHash("sha256")
      .update(readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf8"))
      .digest("hex");
  } catch {
    return "";
  }
}

console.log(`Recorded in the database: ${applied.length}`);
console.log(`Migration files in the repository: ${files.length}`);
for (const file of files) {
  const hash = createHash("sha256")
    .update(readFileSync(path.join(migrationsDir, file), "utf8"))
    .digest("hex");
  const status = !registered.has(file)
    ? "UNREGISTERED"
    : recordedHashes.has(hash)
      ? "applied"
      : "PENDING";
  const note =
    status === "UNREGISTERED" ? "  (not in _journal.json - drizzle will never run it)" : "";
  console.log(`   ${status.padEnd(12)} ${file}${note}`);
}

if (skipped.length > 0) {
  console.log("\nWILL NEVER RUN - journal timestamp is not after the newest recorded one:");
  for (const entry of skipped) {
    console.log(`   ${entry.tag}  (when=${entry.when}, newest recorded=${latestRecorded})`);
  }
  console.log("   Drizzle compares timestamps, not hashes, so `migrate` will report success");
  console.log("   and do nothing. Raise these `when` values above the newest recorded one.");
}

if (outOfOrder.length > 0) {
  console.log("\nOUT OF ORDER - a later entry is stamped no later than the one before it:");
  for (const entry of outOfOrder) console.log(`   ${entry.tag}  (when=${entry.when})`);
}

// The specific schema the migrations are supposed to create. groups.plan is
// listed first because hasMemberCapacity() selects it on every join attempt:
// if 0005 never landed, creating an invite link and sending an email invite
// both throw, and Express answers with a raw HTML 500.
//
// This is the question that matters: whether the schema is there, regardless
// of what the journal claims.
const checks = [
  ["groups", "plan"],
  ["group_invite_links", null],
  ["expense_category_allocations", null],
  ["expense_category_allocations", "position"],
  ["joint_account_transactions", "bank_transfer_id"],
  ["joint_account_transactions", "bank_transfer_account_id"],
];

console.log("\nSchema the migrations should have created:");
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
