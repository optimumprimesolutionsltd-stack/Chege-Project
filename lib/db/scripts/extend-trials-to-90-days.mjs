/**
 * One-off: give everyone still within 90 days of signing up the 3-month trial
 * new signups now get (TRIAL_DAYS 14 -> 90 in @workspace/jamvi-pricing,
 * 15 Oct 2026: "make the trial 90 days everywhere, including people already
 * on a trial").
 *
 * - status 'trial': trial_ends_at becomes created_at + 90 days. Never
 *   shortened - a later end date is kept.
 * - status 'expired' that never paid (no current_period_start) and is still
 *   within 90 days of signing up: back to 'trial' with the same end date, so
 *   someone whose 14 days ran out last week is not locked out while a
 *   newcomer gets three months. Skipped when the person already has another
 *   current subscription (the one-current-row index).
 *
 * Paid, past-due and cancelled subscriptions are never touched. Safe to
 * re-run: it always works from the same created_at.
 *
 * Run in a Render Shell the same way as a migration:
 *   node lib/db/scripts/extend-trials-to-90-days.mjs --dry-run
 *   node lib/db/scripts/extend-trials-to-90-days.mjs
 */

import { Client } from "pg";

const TRIAL_DAYS = 90;
const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const trialing = `
  SELECT id, user_id, status, created_at, trial_ends_at,
         GREATEST(COALESCE(trial_ends_at, created_at), created_at + make_interval(days => $1)) AS new_trial_ends_at
  FROM user_subscriptions
  WHERE status = 'trial'
  ORDER BY created_at`;

const lapsed = `
  SELECT s.id, s.user_id, s.status, s.created_at, s.trial_ends_at,
         s.created_at + make_interval(days => $1) AS new_trial_ends_at
  FROM user_subscriptions s
  WHERE s.status = 'expired'
    AND s.current_period_start IS NULL
    AND s.created_at + make_interval(days => $1) > now()
    AND NOT EXISTS (
      SELECT 1 FROM user_subscriptions o
      WHERE o.user_id = s.user_id AND o.id <> s.id AND o.status IN ('trial', 'pending', 'active', 'past_due'))
    AND s.id = (SELECT max(l.id) FROM user_subscriptions l WHERE l.user_id = s.user_id)
  ORDER BY s.created_at`;

const show = (label, rows) => {
  console.log(`${rows.length} ${label}.`);
  for (const row of rows) {
    console.log(`  user ${row.user_id}: ${row.status}, trial_ends_at ${row.trial_ends_at?.toISOString?.() ?? row.trial_ends_at} -> ${row.new_trial_ends_at.toISOString()}`);
  }
};

try {
  await client.query("BEGIN");
  const onTrial = (await client.query(trialing, [TRIAL_DAYS])).rows;
  const ranOut = (await client.query(lapsed, [TRIAL_DAYS])).rows;
  show("trial subscription(s) to extend", onTrial);
  show("lapsed trial(s), never paid, still within 90 days, to reopen", ranOut);

  if (dryRun) {
    await client.query("ROLLBACK");
    console.log("\n--dry-run: nothing written.");
  } else {
    const extended = await client.query(
      `UPDATE user_subscriptions
       SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, created_at), created_at + make_interval(days => $1)), updated_at = now()
       WHERE status = 'trial'`,
      [TRIAL_DAYS],
    );
    let reopened = 0;
    for (const row of ranOut) {
      const result = await client.query(
        `UPDATE user_subscriptions
         SET status = 'trial', trial_ends_at = created_at + make_interval(days => $1), updated_at = now()
         WHERE id = $2 AND status = 'expired'`,
        [TRIAL_DAYS, row.id],
      );
      reopened += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`\nExtended ${extended.rowCount} trial(s); reopened ${reopened} lapsed trial(s).`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
