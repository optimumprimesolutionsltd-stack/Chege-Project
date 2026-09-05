import app from "./app";
import { logger } from "./lib/logger";
import { schedule as cronSchedule } from "node-cron";
import { sendMonthlyDigest, previousMonth } from "./lib/digest";
import { db } from "@workspace/db";
import { groupsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { assertExternalProductionConfiguration } from "./lib/productionConfig";
import { ensureSubscriptionPlanCatalogue } from "./lib/subscription-catalog";
import { runSubscriptionLifecycle } from "./lib/subscription-reminders";

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

  app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Price lives in code and the plans table is a copy of it, so this reseeds
  // on every boot to keep the two from drifting.
  //
  // After listening, and unable to stop the service. It was previously awaited
  // before app.listen, which made a data problem into a failure to boot: on a
  // database still holding the seven old packages, inserting Jamvi at
  // display_order 1 collides with Personal Free over the unique index on that
  // column, the promise rejects, and the health check never passes. Seeding is
  // useful, but it is not worth the service for.
  void ensureSubscriptionPlanCatalogue()
    .then(() => logger.info("Subscription plan catalogue is seeded"))
    .catch((err) => logger.warn(
      { err },
      "Could not seed the subscription plan catalogue; migrations remain the source of truth",
    ));
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

// ── Subscription lifecycle — daily at 07:00 ──────────────────────────────
// Moves trials and paid periods on, and sends the one reminder that is due.
//
// Access does not depend on this running: it is computed from each
// subscription's own dates on every request, so a member is treated correctly
// whether or not the job ran. What the job adds is the status other things can
// read, and the warning nobody would otherwise get — which matters because
// STK Push cannot deduct on its own, so renewal needs the member to act.
//
// Safe to re-run by hand after a failure: transitions are idempotent and the
// unique index on subscription_reminders stops a second email.
cronSchedule(
  "0 7 * * *",
  async () => {
    try {
      const result = await runSubscriptionLifecycle();
      logger.info(result, "Subscription lifecycle run complete");
    } catch (err) {
      logger.error({ err }, "Subscription lifecycle run failed");
    }
  },
  { timezone: "Africa/Nairobi" },
);
