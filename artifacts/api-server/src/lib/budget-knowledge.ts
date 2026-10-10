import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * The rest of what a budget taught Jamvi, on the server - after the payee
 * rules (lib/payee-rules). Each is one small document the phone keeps whole:
 *
 * - named-payees: names for outside accounts paid often (Named accounts)
 * - owner-business: your business's numbers and names (My business's accounts)
 * - other-budget-rules: payees that belong to another budget (the chama's paybill)
 * - payee-nicknames: what the person calls a payee in the import
 *
 * All lived on one phone, lost on a reinstall and unseen by the web (10 Oct
 * 2026). The phone's copy is a cache (mobile lib/knowledgeStore).
 */
export const KNOWLEDGE_KINDS = ["named-payees", "owner-business", "other-budget-rules", "payee-nicknames"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export const isKnowledgeKind = (kind: string): kind is KnowledgeKind => (KNOWLEDGE_KINDS as readonly string[]).includes(kind);

/** A document bigger than this is not a list of payees. */
export const MAX_DOC_BYTES = 256 * 1024;

let ready = false;

export function budgetKnowledgeReady(): boolean {
  return ready;
}

export function setBudgetKnowledgeReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureBudgetKnowledge(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "budget_knowledge" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "doc" jsonb NOT NULL,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY ("group_id", "kind")
      )`);
    ready = true;
    logger.info("Budget knowledge is ready");
  } catch (err) {
    logger.warn({ err }, "budget_knowledge is not available yet; it stays on the phone");
    const retry = setTimeout(() => void ensureBudgetKnowledge(), 60_000);
    retry.unref?.();
  }
}

export async function loadKnowledge(groupId: number): Promise<Partial<Record<KnowledgeKind, unknown>>> {
  if (!ready) return {};
  const result = await db.execute(sql`SELECT "kind", "doc" FROM "budget_knowledge" WHERE "group_id" = ${groupId}`);
  const docs: Partial<Record<KnowledgeKind, unknown>> = {};
  for (const row of result.rows as Array<{ kind: string; doc: unknown }>) {
    if (isKnowledgeKind(row.kind)) docs[row.kind] = row.doc;
  }
  return docs;
}

export async function saveKnowledge(groupId: number, kind: KnowledgeKind, doc: unknown): Promise<void> {
  if (!ready) return;
  await db.execute(sql`
    INSERT INTO "budget_knowledge" ("group_id", "kind", "doc") VALUES (${groupId}, ${kind}, ${JSON.stringify(doc)}::jsonb)
    ON CONFLICT ("group_id", "kind") DO UPDATE SET "doc" = EXCLUDED."doc", "updated_at" = now()`);
}
