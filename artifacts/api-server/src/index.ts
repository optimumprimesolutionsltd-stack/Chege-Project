import app from "./app";
import { logger } from "./lib/logger";
import { schedule as cronSchedule } from "node-cron";
import { sendMonthlyDigest, previousMonth } from "./lib/digest";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── One-time member fix ────────────────────────────────────────────────────
// An unknown account (63497598) grabbed Lydiah's membership slot before she
// could sign in. This runs at startup: if the unknown account is a member and
// Lydiah's real account (63570605) is not, swap them.
async function fixMembersIfNeeded() {
  const UNKNOWN = "63497598";      // mundarafrederick@gmail.com — not Lydiah
  const LYDIAH  = "63570605";      // lydiah.karimi2015@gmail.com — the real Lydiah

  const unknown = await db.query.membersTable.findFirst({ where: eq(membersTable.userId, UNKNOWN) });
  const lydiah  = await db.query.membersTable.findFirst({ where: eq(membersTable.userId, LYDIAH)  });

  if (unknown && !lydiah) {
    await db.delete(membersTable).where(eq(membersTable.userId, UNKNOWN));
    await db.insert(membersTable).values({ userId: LYDIAH, addedByUserId: null }).onConflictDoNothing();
    logger.info("Members fix applied: replaced unknown account with Lydiah (63570605)");
  }
}

fixMembersIfNeeded().catch(err => logger.error({ err }, "Members fix failed"));

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ── Monthly digest cron — runs at 08:00 on the 1st of every month ─────────
// The job covers the *previous* calendar month so all data is complete.
cronSchedule("0 8 1 * *", () => {
  const { month, year } = previousMonth();
  logger.info({ month, year }, "Running scheduled monthly digest");
  sendMonthlyDigest(month, year).catch((err) => {
    logger.error({ err }, "Scheduled digest failed");
  });
});
