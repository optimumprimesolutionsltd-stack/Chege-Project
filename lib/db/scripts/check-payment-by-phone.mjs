/**
 * One-off diagnostic: look up recent M-Pesa payments for a phone number, and
 * the subscription row for whoever made them.
 *
 * Read-only — changes nothing. Written to answer a live support question
 * ("I paid but the app still shows lapsed") without guessing: it shows
 * exactly what payments.stk-push recorded, whether Safaricom's callback ever
 * arrived (status stays 'pending' until it does — see routes/payments.ts),
 * and what the linked subscription currently looks like.
 *
 * Run in a Render Shell:
 *   node lib/db/scripts/check-payment-by-phone.mjs 0758449475
 */

import { Client } from "pg";

const rawPhone = process.argv[2];
if (!rawPhone) {
  console.error("Usage: node check-payment-by-phone.mjs <phone-number>");
  process.exit(1);
}

function normalizeMsisdn(input) {
  const digits = input.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error(`Could not normalize phone number: ${input}`);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this where the database is configured.");
  process.exit(1);
}

const phone = normalizeMsisdn(rawPhone);
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const payments = await client.query(
    `SELECT id, user_id, status, billing_interval, amount_kes, phone_number,
            checkout_request_id, merchant_request_id, mpesa_receipt_number,
            result_code, result_desc, paid_at, created_at, updated_at
     FROM payments
     WHERE phone_number = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [phone],
  );

  console.log(`Payments for ${phone}:`);
  if (payments.rows.length === 0) {
    console.log("  (none found)");
  }
  for (const row of payments.rows) {
    console.log(`\n  Payment #${row.id}`);
    console.log(`    user_id: ${row.user_id}`);
    console.log(`    status: ${row.status}`);
    console.log(`    amount: KES ${row.amount_kes} (${row.billing_interval})`);
    console.log(`    checkoutRequestId: ${row.checkout_request_id}`);
    console.log(`    mpesaReceiptNumber: ${row.mpesa_receipt_number}`);
    console.log(`    resultCode/Desc: ${row.result_code} / ${row.result_desc}`);
    console.log(`    paidAt: ${row.paid_at}`);
    console.log(`    created/updated: ${row.created_at} / ${row.updated_at}`);
  }

  const userIds = [...new Set(payments.rows.map((row) => row.user_id))];
  if (userIds.length > 0) {
    const subs = await client.query(
      `SELECT user_id, status, billing_interval, trial_ends_at, current_period_start,
              current_period_end, grace_ends_at, updated_at
       FROM user_subscriptions
       WHERE user_id = ANY($1)`,
      [userIds],
    );
    console.log(`\nSubscription row(s):`);
    for (const row of subs.rows) {
      console.log(`\n  user ${row.user_id}`);
      console.log(`    status: ${row.status}`);
      console.log(`    billingInterval: ${row.billing_interval}`);
      console.log(`    currentPeriodEnd: ${row.current_period_end}`);
      console.log(`    graceEndsAt: ${row.grace_ends_at}`);
      console.log(`    updatedAt: ${row.updated_at}`);
    }
  }
} finally {
  await client.end();
}
