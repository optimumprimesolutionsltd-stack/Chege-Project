import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";
import { TAKEN_BACK_PREFIX } from "./mpesa-parser/import";
import { notOwnerBusinessMoney } from "./owner-business-money";

/** The receipt code a take-back undid, or null when the description is not one. */
export function takenBackReceipt(description: string | null | undefined): string | null {
  if (!description?.startsWith(TAKEN_BACK_PREFIX)) return null;
  const code = description.slice(TAKEN_BACK_PREFIX.length).trim().toUpperCase();
  return /^[A-Z0-9]{8,15}$/.test(code) ? code : null;
}

/**
 * Whether reversal_links exists yet, and the one condition every income figure
 * adds once it does.
 *
 * A "money back" deposit linked to the payment it reversed is not income (see
 * migration 0047). Every query that counts deposits as income has to leave it
 * out - but a query naming a table that is not there fails outright, and
 * migrations here are run by hand after a deploy. So the condition is only
 * added once the table is known to exist; until then the figures are exactly
 * what they were, which is right, because nothing can be linked yet either.
 *
 * Known at startup and rechecked, not asked per request, so the figures cost no
 * extra round trip and the request paths keep the queries they always had.
 */

let ready = false;

export function reversalLinksReady(): boolean {
  return ready;
}

/** For tests: pretend the table exists, or not. */
export function setReversalLinksReadyForTests(value: boolean): void {
  ready = value;
}

/**
 * What marks money in as money back from a reversed payment: the way an
 * M-Pesa import files a reversal ("Money back: a reversed payment", "Money
 * back: reversal of ..."). Such money is never income, whether or not the
 * payment it undid is recorded or linked - it only ever returns what left.
 */
export const MONEY_BACK_PATTERN = "Money back%";

/**
 * The condition every income figure adds, leaving out money back from a
 * reversed payment: any deposit filed as money back, and - once the table
 * exists - any deposit linked in reversal_links. `depositId` is the deposit's
 * id column as the calling query names it, for example sql`t.id`.
 */
export function notAReversal(depositId: SQL | unknown): SQL {
  // ...and any receipt a reversal took back again (TAKEN_BACK_PREFIX), and
  // money from the owner's own business (lib/owner-business), which is not
  // income either and needs leaving out of the same figures.
  const filedAsMoneyBack = sql`${notOwnerBusinessMoney(depositId)} AND NOT EXISTS (SELECT 1 FROM joint_account_transactions mb WHERE mb.id = ${depositId} AND mb.description ILIKE ${MONEY_BACK_PATTERN})
    AND NOT EXISTS (SELECT 1 FROM joint_account_transactions rc JOIN joint_account_transactions tb
      ON tb.group_id = rc.group_id AND tb.type = 'disbursement' AND tb.description = ${TAKEN_BACK_PREFIX} || rc.mpesa_receipt
      WHERE rc.id = ${depositId} AND rc.mpesa_receipt IS NOT NULL)`;
  if (!ready) return filedAsMoneyBack;
  return sql`${filedAsMoneyBack} AND NOT EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.reversal_transaction_id = ${depositId})`;
}

/** True, in SQL, for a deposit that is money back from a reversed payment. */
export function isMoneyBack(depositId: SQL | unknown, description: SQL | unknown): SQL {
  const linked = ready
    ? sql` OR EXISTS (SELECT 1 FROM reversal_links rl WHERE rl.reversal_transaction_id = ${depositId})`
    : sql``;
  return sql`(${description} ILIKE ${MONEY_BACK_PATTERN}${linked})`;
}

/**
 * The one payment a money-back entry can be linked to without asking, or null.
 *
 * Usually that is the only payment of the same amount before it. But one bill
 * paid twice the same day - two identical KCB paybill payments, one of which
 * came back - gives two, and asking which is pointless: they are the same
 * payment to the same payee on the same day, account and category, and linking either
 * leaves the same figures. Payee names are compared without spaces or
 * punctuation, since M-Pesa writes one paybill as "806 38 76" and "8063876".
 */
export function soleReversalCandidate<T extends { tx: { date: unknown; description: string | null; accountId: number | null; expenseCategory?: string | null } }>(
  candidates: readonly T[],
  /** The money back's own day. M-Pesa reverses a payment the day it is made, so
   *  payments of that amount on that day are the ones it can be; the same
   *  amount paid on other days in the window (a monthly KCB payment, say)
   *  used to make every reversal of it look ambiguous and none was matched. */
  moneyBackDay?: string | null,
): T | null {
  const day = moneyBackDay ? String(moneyBackDay).slice(0, 10) : null;
  const sameDay = day ? candidates.filter((row) => String(row.tx.date).slice(0, 10) === day) : [];
  if (sameDay.length > 0) candidates = sameDay;
  if (candidates.length === 0) return null;
  const key = (row: T) =>
    [String(row.tx.date), row.tx.accountId ?? "", row.tx.expenseCategory ?? "", (row.tx.description ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")].join("|");
  const first = key(candidates[0]);
  return candidates.every((row) => key(row) === first) ? candidates[0] : null;
}

// Built when used, not at load, so importing this touches nothing.
const createStatement = () => sql`
  CREATE TABLE IF NOT EXISTS "reversal_links" (
    "reversal_transaction_id" integer PRIMARY KEY
      REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
    "original_transaction_id" integer NOT NULL UNIQUE
      REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
    "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
    "original_category" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`;

/**
 * Make sure the table exists, then remember that it does. The same statement as
 * migration 0047 and just as idempotent, so running migrate later records it
 * without changing anything - the precedent is password_hash in index.ts.
 *
 * Called after the server is listening and never allowed to stop it: if it
 * fails, reversals simply stay unavailable and every figure stays as it was.
 * Retried every minute until it succeeds.
 */
export async function ensureReversalLinks(): Promise<void> {
  try {
    await db.execute(createStatement());
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "reversal_links_group_idx" ON "reversal_links" ("group_id")`);
    ready = true;
    logger.info("Reversal links are ready");
  } catch (err) {
    logger.warn({ err }, "reversal_links is not available yet; money back is counted as before");
    const retry = setTimeout(() => void ensureReversalLinks(), 60_000);
    retry.unref?.();
  }
}
