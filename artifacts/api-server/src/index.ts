import app from "./app";
import { logger } from "./lib/logger";
import { schedule as cronSchedule } from "node-cron";
import { sendMonthlyDigest, previousMonth } from "./lib/digest";
import { db } from "@workspace/db";
import { groupsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { assertExternalProductionConfiguration } from "./lib/productionConfig";
import { ensureSubscriptionPlanCatalogue } from "./lib/subscription-catalog";

// Backfill removed — contributions are now derived from deposits + direct expense payments

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

assertExternalProductionConfiguration();

async function startServer() {
  // Keep this additive migration idempotent so credential auth can be enabled
  // safely on an existing deployment even when the migration runner was not
  // invoked separately.
  await db.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar`,
  );
  logger.info("Credential authentication schema is ready");

  // Price lives in code; the plans table is a copy of it. Seeding on every boot
  // keeps the two from drifting, which matters because a member's subscription
  // row points at this table by foreign key.
  await ensureSubscriptionPlanCatalogue();
  logger.info("Subscription plan catalogue is seeded");

  app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Failed to initialize database schema");
  process.exit(1);
});

// ── Monthly digest cron — runs at 08:00 on the 1st of every month ─────────
// The job covers the *previous* calendar month so all data is complete.
// Processes each group separately so every household gets its own digest.
cronSchedule(
  "0 8 1 * *",
  async () => {
    const { month, year } = previousMonth();
    logger.info(
      { month, year },
      "Running scheduled monthly digest for all groups",
    );

    const groups = await db.select({ id: groupsTable.id }).from(groupsTable);

    for (const group of groups) {
      logger.info(
        { month, year, groupId: group.id },
        "Sending scheduled digest for group",
      );
      await sendMonthlyDigest(month, year, { groupId: group.id }).catch(
        (err) => {
          logger.error(
            { err, groupId: group.id },
            "Scheduled digest failed for group",
          );
        },
      );
    }
  },
  { timezone: "Africa/Nairobi" },
);
