import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Which M-Pesa a shared group's money moves through - asked once of its owner
 * or admin: "my worry is the app importing users mpesa when it may not be what
 * the group is using" (16 Oct 2026).
 *
 * - treasurer_line: members send to one member's own number. Only that member's
 *   phone messages may be read into the group (treasurerUserId).
 * - paybill / till: the group's own business number (lineNumber).
 * - bank: money goes to a bank account; M-Pesa only as deposits into it.
 * - none: the group does not use M-Pesa.
 *
 * Unanswered (no row): nobody's phone messages are read into the group, and the
 * phone asks. A Personal budget never has one - its M-Pesa is the person's own.
 */
export const GROUP_MPESA_SOURCES = ["treasurer_line", "paybill", "till", "bank", "none"] as const;
export type GroupMpesaSourceKind = (typeof GROUP_MPESA_SOURCES)[number];
export type GroupMpesaSource = { source: GroupMpesaSourceKind | null; lineNumber: string | null; treasurerUserId: string | null };

let ready = false;

export function groupMpesaSourceReady(): boolean {
  return ready;
}

export function setGroupMpesaSourceReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureGroupMpesaSource(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "group_mpesa_sources" (
        "group_id" integer PRIMARY KEY REFERENCES "groups"("id") ON DELETE CASCADE,
        "source" text NOT NULL,
        "line_number" text,
        "treasurer_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    ready = true;
    logger.info("Group M-Pesa sources are ready");
  } catch (err) {
    logger.warn({ err }, "group_mpesa_sources is not available yet; groups read no phone M-Pesa");
    const retry = setTimeout(() => void ensureGroupMpesaSource(), 60_000);
    retry.unref?.();
  }
}

/** Digits only, and at most 15 of them: a phone, Paybill or Till number. */
export function cleanLineNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "").slice(0, 15);
  return digits.length >= 5 ? digits : null;
}

export async function groupMpesaSource(groupId: number): Promise<GroupMpesaSource> {
  if (!ready) return { source: null, lineNumber: null, treasurerUserId: null };
  const result = await db.execute(sql`
    SELECT "source", "line_number" AS "lineNumber", "treasurer_user_id" AS "treasurerUserId"
      FROM "group_mpesa_sources" WHERE "group_id" = ${groupId} LIMIT 1`);
  const row = result.rows[0] as { source: string; lineNumber: string | null; treasurerUserId: string | null } | undefined;
  if (!row || !GROUP_MPESA_SOURCES.includes(row.source as GroupMpesaSourceKind)) return { source: null, lineNumber: null, treasurerUserId: null };
  return { source: row.source as GroupMpesaSourceKind, lineNumber: row.lineNumber, treasurerUserId: row.treasurerUserId };
}

export async function setGroupMpesaSource(groupId: number, value: GroupMpesaSource): Promise<void> {
  await db.execute(sql`
    INSERT INTO "group_mpesa_sources" ("group_id", "source", "line_number", "treasurer_user_id", "updated_at")
    VALUES (${groupId}, ${value.source}, ${value.lineNumber}, ${value.treasurerUserId}, now())
    ON CONFLICT ("group_id") DO UPDATE SET
      "source" = EXCLUDED."source",
      "line_number" = EXCLUDED."line_number",
      "treasurer_user_id" = EXCLUDED."treasurer_user_id",
      "updated_at" = now()`);
}
