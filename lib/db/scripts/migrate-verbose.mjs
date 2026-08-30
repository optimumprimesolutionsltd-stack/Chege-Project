/**
 * Apply migrations and, when one fails, say why.
 *
 * `drizzle-kit migrate` exits 1 without printing anything useful — the
 * progress spinner overwrites the error before it reaches the terminal, and it
 * is lost even when stdout and stderr are redirected to a file. Running the
 * migrator directly means the Postgres error, with its detail and hint, is
 * caught and printed in full.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsFolder = path.join(
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

try {
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(client), { migrationsFolder });
  console.log("\nAll migrations applied. Nothing left pending.");
} catch (error) {
  console.error("\nMIGRATION FAILED\n");
  console.error(`message: ${error.message}`);
  // Postgres puts the useful part in these, and they are what drizzle-kit ate.
  for (const key of ["code", "detail", "hint", "where", "schema", "table", "column", "constraint", "file", "line", "routine"]) {
    if (error[key]) console.error(`${key}: ${error[key]}`);
  }
  if (error.cause) console.error(`\ncause: ${error.cause?.message ?? error.cause}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
