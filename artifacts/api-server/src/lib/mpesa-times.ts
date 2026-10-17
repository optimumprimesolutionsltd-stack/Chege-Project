import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * The time of day on M-Pesa entries ("Can we have timestamps for the mpesa?",
 * 17 Oct 2026). A message and a statement row both carry it; an entry keeps
 * only its day. The phone sends receipt -> time pairs whenever it reads
 * M-Pesa (lib/mpesaTimes there); they are kept here per budget and copied
 * onto every entry with that receipt and no time yet - entries saved earlier
 * included, and entries an import save job saves later (runJob calls
 * fillMpesaTimes when it finishes).
 *
 * The time is "HH:MM", 24-hour, Kenyan time, as M-Pesa printed it.
 */

export type ReceiptTime = { receipt: string; time: string };

const RECEIPT = /^[A-Z0-9]{8,15}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** At most this many pairs in one send: a year of statement is about 5,000 lines. */
export const MAX_TIMES = 10_000;

let ready = false;

export function mpesaTimesReady(): boolean {
  return ready;
}

export function setMpesaTimesReadyForTests(value: boolean): void {
  ready = value;
}

/** The pairs table; the entries' own column is added before the server listens (index.ts). */
export async function ensureMpesaTimes(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "mpesa_receipt_times" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "receipt" text NOT NULL,
        "time_of_day" text NOT NULL,
        PRIMARY KEY ("group_id", "receipt")
      )`);
    ready = true;
  } catch (err) {
    logger.error({ err }, "Could not set up M-Pesa times");
  }
}

/** Well-formed pairs only, one per receipt (the last sent wins), upper-cased. */
export function cleanTimes(input: unknown): ReceiptTime[] {
  if (!Array.isArray(input)) return [];
  const byReceipt = new Map<string, string>();
  for (const raw of input.slice(0, MAX_TIMES)) {
    if (!raw || typeof raw !== "object") continue;
    const receipt = String((raw as { receipt?: unknown }).receipt ?? "").trim().toUpperCase();
    const time = String((raw as { time?: unknown }).time ?? "").trim();
    if (RECEIPT.test(receipt) && TIME.test(time)) byReceipt.set(receipt, time);
  }
  return [...byReceipt.entries()].map(([receipt, time]) => ({ receipt, time }));
}

/** Keeps the pairs for the budget and fills them in; how many entries got a time. */
export async function keepMpesaTimes(groupId: number, times: readonly ReceiptTime[]): Promise<number> {
  if (!ready || times.length === 0) return 0;
  for (let at = 0; at < times.length; at += 500) {
    const chunk = times.slice(at, at + 500);
    await db.execute(sql`
      INSERT INTO "mpesa_receipt_times" ("group_id", "receipt", "time_of_day")
      VALUES ${sql.join(chunk.map((one) => sql`(${groupId}, ${one.receipt}, ${one.time})`), sql`, `)}
      ON CONFLICT ("group_id", "receipt") DO UPDATE SET "time_of_day" = EXCLUDED."time_of_day"`);
  }
  return fillMpesaTimes(groupId);
}

/** Every entry in the budget with a known receipt and no time yet gets its time. */
export async function fillMpesaTimes(groupId: number): Promise<number> {
  if (!ready) return 0;
  const result = await db.execute(sql`
    UPDATE "joint_account_transactions" tx
       SET "time_of_day" = known."time_of_day"
      FROM "mpesa_receipt_times" known
     WHERE known."group_id" = ${groupId}
       AND tx."group_id" = ${groupId}
       AND tx."mpesa_receipt" = known."receipt"
       AND tx."time_of_day" IS NULL`);
  return Number((result as { rowCount?: number | null }).rowCount ?? 0);
}
