import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * What Jamvi was taught about payees, per budget, on the server.
 *
 * The phone kept these on the device alone (mobile lib/payeeLearning): a
 * category for a payee, an account number or a till ("#ref:1234567", "#522522",
 * "jane wanjiku" -> "Family support"), and where money in from a payer goes
 * ("src:..." -> an income stream id). Lost on a reinstall, invisible to the
 * web and to the group's other admins - while the whole point of teaching
 * Jamvi once (Teach Jamvi, 9 Oct 2026) is that it stays taught. Kept here,
 * the phone's copy is only a cache (mobile lib/rulesStore).
 */

let ready = false;

export function payeeRulesReady(): boolean {
  return ready;
}

export function setPayeeRulesReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensurePayeeRules(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "payee_rules" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "key" text NOT NULL,
        "value" text NOT NULL,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY ("group_id", "key")
      )`);
    ready = true;
    logger.info("Payee rules are ready");
  } catch (err) {
    logger.warn({ err }, "payee_rules is not available yet; payee rules stay on the phone");
    const retry = setTimeout(() => void ensurePayeeRules(), 60_000);
    retry.unref?.();
  }
}

/** A rule's key and value, as the phone writes them: short text, never empty. */
export const MAX_KEY = 200;
export const MAX_VALUE = 200;
export const MAX_RULES = 5000;

export function cleanRules(input: unknown): Record<string, string> {
  const rules: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return rules;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const k = key.trim();
    const v = value.trim();
    if (!k || !v || k.length > MAX_KEY || v.length > MAX_VALUE) continue;
    rules[k] = v;
  }
  return rules;
}

export async function loadPayeeRules(groupId: number): Promise<Record<string, string>> {
  if (!ready) return {};
  const result = await db.execute(sql`SELECT "key", "value" FROM "payee_rules" WHERE "group_id" = ${groupId}`);
  const rules: Record<string, string> = {};
  for (const row of result.rows as Array<{ key: string; value: string }>) rules[row.key] = row.value;
  return rules;
}

/** Sets some rules and removes others, leaving the rest as they are. */
export async function changePayeeRules(groupId: number, set: Record<string, string>, remove: readonly string[]): Promise<void> {
  if (!ready) return;
  const entries = Object.entries(set);
  await db.transaction(async (tx) => {
    if (remove.length > 0) {
      await tx.execute(sql`DELETE FROM "payee_rules" WHERE "group_id" = ${groupId} AND "key" IN (${sql.join(remove.map((key) => sql`${key}`), sql`, `)})`);
    }
    for (const [key, value] of entries) {
      await tx.execute(sql`
        INSERT INTO "payee_rules" ("group_id", "key", "value") VALUES (${groupId}, ${key}, ${value})
        ON CONFLICT ("group_id", "key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now()`);
    }
  });
}

/** Replaces every rule of the budget with these. */
export async function replacePayeeRules(groupId: number, rules: Record<string, string>): Promise<void> {
  if (!ready) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "payee_rules" WHERE "group_id" = ${groupId}`);
    for (const [key, value] of Object.entries(rules)) {
      await tx.execute(sql`INSERT INTO "payee_rules" ("group_id", "key", "value") VALUES (${groupId}, ${key}, ${value})`);
    }
  });
}
