import app from "./app";
import { logger } from "./lib/logger";
import { schedule as cronSchedule } from "node-cron";
import { sendMonthlyDigest, previousMonth } from "./lib/digest";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── One-time member fix ────────────────────────────────────────────────────
// Ensure the two authorised accounts are Lydiah (lydiah.karimi2015@gmail.com)
// and Frederick/Chege (mundarafrederick@gmail.com). The business account
// (optimumprimesolutionsltd@gmail.com / 62278925) must not be a member.
async function fixMembersIfNeeded() {
  const BUSINESS = "62278925";  // optimumprimesolutionsltd@gmail.com — remove
  const LYDIAH   = "63570605";  // lydiah.karimi2015@gmail.com         — add
  const CHEGE    = "63497598";  // mundarafrederick@gmail.com           — keep

  const business = await db.query.membersTable.findFirst({ where: eq(membersTable.userId, BUSINESS) });
  const lydiah   = await db.query.membersTable.findFirst({ where: eq(membersTable.userId, LYDIAH)   });
  const chege    = await db.query.membersTable.findFirst({ where: eq(membersTable.userId, CHEGE)    });

  if (business) {
    await db.delete(membersTable).where(eq(membersTable.userId, BUSINESS));
    logger.info("Members fix: removed business account (62278925)");
  }
  if (!lydiah) {
    await db.insert(membersTable).values({ userId: LYDIAH, addedByUserId: chege ? CHEGE : null }).onConflictDoNothing();
    logger.info("Members fix: added Lydiah (63570605)");
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
