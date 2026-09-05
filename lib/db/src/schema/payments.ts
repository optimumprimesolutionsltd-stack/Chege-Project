import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Where a payment has got to.
 *
 * Silence is the ordinary case, not an error: an STK prompt that is ignored
 * produces no callback at all, so a payment sits in `pending` until the STK
 * Query API is asked about it or it is timed out. Nothing may treat `pending`
 * as either success or failure.
 */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  /** No answer within the window. May still have succeeded on Safaricom's side,
   *  which is why reconciliation reads the query API rather than assuming. */
  TIMED_OUT: "timed_out",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * One row per STK Push attempt.
 *
 * The record is written before the prompt is sent, so a callback always has
 * something to reconcile against. Safaricom posts to a public URL with no
 * signature, so nothing in a callback is trusted on its own: it is matched to
 * a row we already created by checkoutRequestId, and a callback naming an
 * unknown id is discarded rather than believed.
 */
export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** What the member is buying, so a callback knows how far to extend them. */
    billingInterval: text("billing_interval").notNull(),
    amountKes: integer("amount_kes").notNull(),
    promoCode: text("promo_code"),
    /** The number the prompt went to, in Safaricom's 2547XXXXXXXX form. Kept
     *  because a member may pay from a different number than they signed up
     *  with, and support cannot reconcile a payment without it. */
    phoneNumber: text("phone_number").notNull(),
    status: text("status").notNull().default(PAYMENT_STATUS.PENDING),
    /** Safaricom's two identifiers for the attempt. checkoutRequestId is the
     *  one callbacks quote, so it carries the unique index. */
    merchantRequestId: text("merchant_request_id"),
    checkoutRequestId: text("checkout_request_id"),
    /** From the callback: 0 means paid, anything else explains why not. */
    resultCode: integer("result_code"),
    resultDesc: text("result_desc"),
    /** The confirmation code a member can read off their own SMS. */
    mpesaReceiptNumber: text("mpesa_receipt_number"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_user_created_idx").on(table.userId, table.createdAt),
    /** Callbacks are retried, so the same checkoutRequestId can arrive more
     *  than once. This is what stops one payment extending a subscription
     *  twice. */
    uniqueIndex("payments_checkout_request_idx").on(table.checkoutRequestId),
    index("payments_status_idx").on(table.status),
  ],
);

export type Payment = typeof paymentsTable.$inferSelect;
