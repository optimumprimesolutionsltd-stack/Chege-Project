/**
 * One-off: turn reversals of money RECEIVED, saved as money in, into money out.
 *
 * Until 5 Oct 2026 the M-Pesa message import read every reversal as money
 * back ("Money back: reversal of <code>", a deposit). A reversal goes either
 * way: when somebody reverses money they sent you, the message says it "is
 * debited from your M-PESA account" and the money leaves. Each one saved as a
 * deposit put the M-Pesa balance out by twice its amount, which is one reason
 * Jamvi's M-Pesa balance stopped matching Safaricom's.
 *
 * The message itself is not kept, so the direction is read from what it undid:
 * a reversal of a receipt code recorded in the same budget as money IN can only
 * have taken that money back. Those rows become what the import now saves
 * (see TAKEN_BACK_PREFIX in artifacts/api-server/src/lib/mpesa-parser/import.ts):
 * a disbursement "Taken back: reversal of <code>" with no category, which takes
 * the receipt out of income as well. If one was linked in reversal_links to a
 * payment it never undid, that link is removed and the payment's category put
 * back.
 *
 * Reversals whose code is not recorded anywhere cannot be told apart, so they
 * are only listed, to check against the Safaricom statement.
 *
 * Run in a Render Shell the same way as a migration:
 *   node lib/db/scripts/fix-taken-back-reversals.mjs --dry-run
 *   node lib/db/scripts/fix-taken-back-reversals.mjs
 * Safe to re-run: a fixed row no longer matches.
 */

import { Client } from "pg";

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const WRONG = `
  SELECT mb.id, mb.group_id, mb.date, mb.amount, mb.description,
         rc.id AS receipt_id, rc.description AS receipt_description
  FROM joint_account_transactions mb
  JOIN joint_account_transactions rc
    ON rc.group_id = mb.group_id
   AND rc.type = 'deposit'
   AND rc.mpesa_receipt = substring(mb.description from '^Money back: reversal of ([A-Z0-9]+)$')
  WHERE mb.type = 'deposit' AND mb.description LIKE 'Money back: reversal of %'`;

const UNKNOWN = `
  SELECT mb.id, mb.group_id, mb.date, mb.amount, mb.description
  FROM joint_account_transactions mb
  WHERE mb.type = 'deposit' AND mb.description LIKE 'Money back: reversal of %'
    AND NOT EXISTS (
      SELECT 1 FROM joint_account_transactions o
      WHERE o.group_id = mb.group_id
        AND o.mpesa_receipt = substring(mb.description from '^Money back: reversal of ([A-Z0-9]+)$'))
  ORDER BY mb.group_id, mb.date`;

const fmt = (row) => `  #${row.id} group ${row.group_id} ${new Date(row.date).toISOString().slice(0, 10)} KES ${row.amount}  ${row.description}`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const wrong = (await client.query(`${WRONG} ORDER BY mb.group_id, mb.date`)).rows;
  console.log(`${wrong.length} reversal(s) of money received, saved as money in:`);
  for (const row of wrong) console.log(`${fmt(row)}  (undid #${row.receipt_id} "${row.receipt_description}")`);

  const unknown = (await client.query(UNKNOWN)).rows;
  console.log(`\n${unknown.length} money-back reversal(s) whose original is not recorded (left as they are; check against the statement):`);
  for (const row of unknown) console.log(fmt(row));

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
  } else if (wrong.length > 0) {
    const ids = wrong.map((row) => row.id);
    await client.query("BEGIN");
    const linksTable = (await client.query(`SELECT to_regclass('reversal_links') AS t`)).rows[0].t;
    let unlinked = 0;
    if (linksTable) {
      await client.query(
        `UPDATE joint_account_transactions p SET expense_category = rl.original_category
         FROM reversal_links rl
         WHERE rl.reversal_transaction_id = ANY($1::int[]) AND p.id = rl.original_transaction_id`,
        [ids],
      );
      unlinked = (await client.query(`DELETE FROM reversal_links WHERE reversal_transaction_id = ANY($1::int[])`, [ids])).rowCount;
    }
    const updated = await client.query(
      `UPDATE joint_account_transactions
       SET type = 'disbursement',
           description = replace(description, 'Money back: reversal of ', 'Taken back: reversal of '),
           income_source_id = NULL,
           expense_category = NULL
       WHERE id = ANY($1::int[]) AND type = 'deposit'`,
      [ids],
    );
    await client.query("COMMIT");
    console.log(`\nTurned ${updated.rowCount} into money out; removed ${unlinked} wrong reversal link(s).`);
  } else {
    console.log("\nNothing to fix.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await client.end();
}
