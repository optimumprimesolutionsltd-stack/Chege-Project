import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { applyCovers, moveBetween, splitOff, splitsReady, undoSplit } from "../lib/transaction-splits";

/**
 * One payment, more than one category (lib/transaction-splits): split by hand,
 * by what a person's money covers, or by moving money between two categories
 * for a month - and undone.
 */
const router = Router();

const category = z.string().trim().min(1).max(120);
const money = z.number().positive().max(100_000_000);

const splitSchema = z.object({
  transactionId: z.number().int().positive(),
  parts: z.array(z.object({ category, amount: money })).min(1).max(12),
  rest: category.optional(),
});
const coversSchema = z.object({
  transactionIds: z.array(z.number().int().positive()).min(1).max(500),
  payeeKey: z.string().trim().min(1).max(200),
  plan: z.array(z.object({ category, monthly: money })).min(1).max(12),
  rest: category,
});
const candidatesSchema = z.object({
  names: z.array(z.string().trim().min(2).max(200)).min(1).max(50),
  since: z.string().date(),
});
const infoSchema = z.object({ transactionId: z.number().int().positive() });
const moveSchema = z.object({
  from: category,
  to: category,
  amount: money,
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  note: z.string().trim().max(200).optional(),
});
const undoSchema = z.object({ transactionId: z.number().int().positive() });

/** Every category named is one of this budget's: a part is never filed under a name nobody has. */
async function unknownCategory(groupId: number, names: readonly string[]): Promise<string | null> {
  const wanted = [...new Set(names.map((name) => name.trim()))];
  const result = await db.execute(sql`
    SELECT "name" FROM "budget_categories" WHERE "group_id" = ${groupId}
       AND "name" IN (${sql.join(wanted.map((name) => sql`${name}`), sql`, `)})`);
  const have = new Set((result.rows as Array<{ name: string }>).map((row) => row.name));
  return wanted.find((name) => !have.has(name)) ?? null;
}

const notReady = (res: Parameters<Parameters<typeof router.post>[1]>[1]) =>
  res.status(503).json({ error: "Splitting a payment is not available yet. Try again in a minute." });

router.post("/transaction-splits/split", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!splitsReady()) { notReady(res); return; }
  const parsed = splitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Say which payment, and each part's category and amount." }); return; }
  const missing = await unknownCategory(groupId, [...parsed.data.parts.map((part) => part.category), ...(parsed.data.rest ? [parsed.data.rest] : [])]);
  if (missing) { res.status(400).json({ error: `${missing} is not one of this budget's categories.` }); return; }
  const ids = await db.transaction((trx) => splitOff(trx, groupId, parsed.data.transactionId, parsed.data.parts, { reason: "manual", rest: parsed.data.rest }));
  if (!ids) { res.status(409).json({ error: "This payment cannot be split that way: the parts come to more than it, or it is a move, a loan or a fee." }); return; }
  res.status(201).json({ parts: ids });
});

/** What a person's money covers, applied to their payments not split yet. */
router.post("/transaction-splits/covers", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!splitsReady()) { notReady(res); return; }
  const parsed = coversSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Say whose payments, what they cover, and where the rest goes." }); return; }
  const missing = await unknownCategory(groupId, [...parsed.data.plan.map((item) => item.category), parsed.data.rest]);
  if (missing) { res.status(400).json({ error: `${missing} is not one of this budget's categories.` }); return; }
  const split = await applyCovers(groupId, parsed.data.transactionIds, parsed.data);
  res.json({ split });
});

/**
 * Money out to these payees since a day, not split yet: the phone narrows them
 * to the person (payeeLearning payeeKey) and applies what they cover. Found by
 * the name in the description, sent in the body, never the address.
 */
router.post("/transaction-splits/candidates", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!splitsReady()) { res.json({ entries: [] }); return; }
  const parsed = candidatesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Say which payees, and since when." }); return; }
  const result = await db.execute(sql`
    SELECT t."id", t."amount", t."date"::text AS "date", t."description", t."expense_category" AS "category"
      FROM "joint_account_transactions" t
     WHERE t."group_id" = ${groupId} AND t."type" = 'disbursement' AND t."date" >= ${parsed.data.since}::date
       AND (${sql.join(parsed.data.names.map((name) => sql`lower(t."description") LIKE ${`%${name.toLowerCase().replace(/[\\%_]/g, "")}%`}`), sql` OR `)})
       AND t."bank_transfer_id" IS NULL AND t."savings_goal_id" IS NULL AND t."charge_for_transaction_id" IS NULL
       AND t."expense_id" IS NULL AND t."is_lending" = false AND t."settles_contributor_id" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "transaction_splits" ts WHERE ts."part_transaction_id" = t."id" OR ts."root_transaction_id" = t."id")
       AND NOT EXISTS (SELECT 1 FROM "covers_applied" ca WHERE ca."transaction_id" = t."id")
     ORDER BY t."date", t."id"
     LIMIT 500`);
  const rows = result.rows as Array<{ id: number; amount: number | string; date: string; description: string; category: string | null }>;
  res.json({ entries: rows.map((row) => ({ id: Number(row.id), amount: Number(row.amount), date: row.date, description: row.description, category: row.category })) });
});

/** A payment's split, if it has one: its root and every part, so it can be shown and undone. */
router.post("/transaction-splits/info", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Say which payment." }); return; }
  if (!splitsReady()) { res.json({ root: null, parts: [] }); return; }
  const result = await db.execute(sql`
    WITH root AS (
      SELECT COALESCE((SELECT ts."root_transaction_id" FROM "transaction_splits" ts
                        WHERE ts."part_transaction_id" = ${parsed.data.transactionId} AND ts."group_id" = ${groupId}), ${parsed.data.transactionId}) AS id
    )
    SELECT t."id", t."amount", t."expense_category" AS category, (t."id" = (SELECT id FROM root)) AS "isRoot"
      FROM "joint_account_transactions" t
     WHERE t."group_id" = ${groupId}
       AND (t."id" = (SELECT id FROM root)
         OR t."id" IN (SELECT ts."part_transaction_id" FROM "transaction_splits" ts WHERE ts."root_transaction_id" = (SELECT id FROM root)))
     ORDER BY t."id"`);
  const rows = result.rows as Array<{ id: number; amount: number | string; category: string | null; isRoot: boolean }>;
  if (rows.length <= 1) { res.json({ root: null, parts: [] }); return; }
  res.json({
    root: Number(rows.find((row) => row.isRoot)?.id ?? parsed.data.transactionId),
    parts: rows.map((row) => ({ id: Number(row.id), amount: Number(row.amount), category: row.category, isRoot: Boolean(row.isRoot) })),
  });
});

router.post("/transaction-splits/move", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!splitsReady()) { notReady(res); return; }
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.from === parsed.data.to) { res.status(400).json({ error: "Say from which category, to which, how much and for which month." }); return; }
  const missing = await unknownCategory(groupId, [parsed.data.from, parsed.data.to]);
  if (missing) { res.status(400).json({ error: `${missing} is not one of this budget's categories.` }); return; }
  const moved = await moveBetween(groupId, parsed.data);
  res.json({ moved });
});

router.post("/transaction-splits/undo", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!splitsReady()) { notReady(res); return; }
  const parsed = undoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Say which payment." }); return; }
  const parts = await undoSplit(groupId, parsed.data.transactionId);
  res.json({ parts });
});

export default router;
