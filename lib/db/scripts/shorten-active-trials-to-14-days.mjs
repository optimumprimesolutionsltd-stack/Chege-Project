/**
 * One-off: recompute trial_ends_at for every trial subscription to the
 * current 14-day policy.
 *
 * TRIAL_DAYS (@workspace/jamvi-pricing) governs new signups only —
 * trial_ends_at is "set once, at signup, and never moved" (see its comment
 * in lib/db/src/schema/groups.ts), so it changed from 30 to 14 days
 * (2026-09-11) without touching anyone already on a trial. This backfills
 * every row still in "trial" status to createdAt + 14 days, matching what a
 * fresh signup gets today.
 *
 * Only status = 'trial' rows are touched — active/past_due/cancelled/expired
 * subscriptions are untouched regardless of how they got there. Safe to
 * re-run: it always recomputes from the same createdAt, never compounds.
 *
 * Run in a Render Shell the same way as a migration:
 *   node lib/db/scripts/shorten-active-trials-to-14-days.mjs
 * Add --dry-run to only report what would change.
 */

import { Client } from "pg";

const TRIAL_DAYS = 14;
const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const before = await client.query(
    `SELECT id, user_id, created_at, trial_ends_at,
            created_at + make_interval(days => $1) AS new_trial_ends_at
     FROM user_subscriptions
     WHERE status = 'trial'
     ORDER BY created_at`,
    [TRIAL_DAYS],
  );

  console.log(`${before.rows.length} trial subscription(s) found.`);
  for (const row of before.rows) {
    const alreadyExpired = new Date(row.new_trial_ends_at) <= new Date();
    console.log(
      `  user ${row.user_id}: trial_ends_at ${row.trial_ends_at?.toISOString?.() ?? row.trial_ends_at} `
      + `-> ${row.new_trial_ends_at.toISOString()}${alreadyExpired ? "  (already past — becomes lapsed immediately)" : ""}`,
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
  } else if (before.rows.length > 0) {
    const result = await client.query(
      `UPDATE user_subscriptions
       SET trial_ends_at = created_at + make_interval(days => $1), updated_at = now()
       WHERE status = 'trial'`,
      [TRIAL_DAYS],
    );
    console.log(`\nUpdated ${result.rowCount} row(s).`);
  } else {
    console.log("\nNothing to update.");
  }
} finally {
  await client.end();
}
