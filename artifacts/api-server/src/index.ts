import app from "./app";
import { logger } from "./lib/logger";
import { schedule as cronSchedule } from "node-cron";
import { sendMonthlyDigest, previousMonth } from "./lib/digest";

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
