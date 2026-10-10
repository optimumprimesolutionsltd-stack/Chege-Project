import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { entriesToSortReady, gatherMoneyInWithoutSource, gatherSourcedToCheck, NOT_SURE_CATEGORY } from "../lib/entries-to-sort";
import { reversalLinksReady } from "../lib/reversal-links";
import { DEBT_KINDS, sortAsDebt, unsortDebt } from "../lib/sort-as-debt";

const router = Router();

const markSchema = z.object({ transactionIds: z.array(z.number().int().positive()).min(1).max(1000) });

/**
 * Money in saved as "Not sure", marked to be sorted out (lib/entries-to-sort).
 * Only deposits of the active budget are kept, so an id from another budget
 * cannot be named by guessing. Sent after a save, and never in its way.
 */
router.post("/entries-to-sort", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!entriesToSortReady()) {
    res.status(503).json({ error: "Entries to sort cannot be kept yet." });
    return;
  }
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the entries to sort out later." });
    return;
  }
  const mine = await db
    .select({ id: jointAccountTxTable.id })
    .from(jointAccountTxTable)
    .where(and(
      eq(jointAccountTxTable.groupId, groupId),
      eq(jointAccountTxTable.type, "deposit"),
      inArray(jointAccountTxTable.id, [...new Set(parsed.data.transactionIds)]),
    ));
  for (const row of mine) {
    await db.execute(sql`
      INSERT INTO "entries_to_sort" ("transaction_id", "group_id")
      VALUES (${row.id}, ${groupId})
      ON CONFLICT ("transaction_id") DO NOTHING`);    // Marked again (Undo after "Leave it"): no longer left with no source.
    await db.execute(sql`DELETE FROM "entries_left_unsourced" WHERE "transaction_id" = ${row.id} AND "group_id" = ${groupId}`);
  }
  res.status(201).json({ kept: mine.length });
});

/**
 * What is still to sort, oldest first: spending under "Not sure yet", and
 * marked money in that still has no income source. An entry drops off by
 * itself once it is given a category or a source.
 */
router.get("/entries-to-sort", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  // Money in with no source joins the list by itself, every year, unless the
  // person left it so (lib/entries-to-sort). Personal budget only: money in to a
  // Shared group is members' contributions. Never worth failing the list over.
  // In a Shared group only imported money in from people, banks and agents
  // (lib/entries-to-sort), not members' contributions.
  await gatherMoneyInWithoutSource(groupId, undefined, !req.group?.isPrivate).catch(() => 0);
  await gatherSourcedToCheck(groupId).catch(() => 0);
  const marked = entriesToSortReady()
    ? sql`OR (${jointAccountTxTable.type} = 'deposit' AND ${jointAccountTxTable.incomeSourceId} IS NULL
        AND ${jointAccountTxTable.id} IN (SELECT "transaction_id" FROM "entries_to_sort" WHERE "group_id" = ${groupId}))
      OR (${jointAccountTxTable.type} = 'deposit' AND EXISTS (SELECT 1 FROM "entries_to_check" c
        WHERE c."transaction_id" = ${jointAccountTxTable.id} AND c."group_id" = ${groupId}
          AND c."income_source_id" = ${jointAccountTxTable.incomeSourceId}))`
    : sql``;
  // Either half of a reversal has nothing left to sort: the payment and its money
  // back cancel out. A payment saved as Not sure and reversed later stayed on the
  // list and looked like spending still to be filed (6 Oct 2026).
  const notReversed = reversalLinksReady()
    ? sql`AND NOT EXISTS (SELECT 1 FROM "reversal_links" r
        WHERE r."reversal_transaction_id" = ${jointAccountTxTable.id} OR r."original_transaction_id" = ${jointAccountTxTable.id})`
    : sql``;
  const rows = await db
    .select({
      id: jointAccountTxTable.id,
      type: jointAccountTxTable.type,
      amount: jointAccountTxTable.amount,
      date: jointAccountTxTable.date,
      description: jointAccountTxTable.description,
      // The entry's own note, shown and kept while it is sorted out.
      notes: jointAccountTxTable.notes,
      // Set only on money in listed to check (lib/entries-to-sort gatherSourcedToCheck).
      incomeSourceId: jointAccountTxTable.incomeSourceId,
      // Who it is recorded under, so Undo can put a changed depositor back.
      madeById: jointAccountTxTable.madeById,
      // Its account, where "Passed through my M-Pesa" looks for the other half.
      accountId: jointAccountTxTable.accountId,
    })
    .from(jointAccountTxTable)
    .where(and(
      eq(jointAccountTxTable.groupId, groupId),
      sql`((${jointAccountTxTable.type} = 'disbursement' AND lower(${jointAccountTxTable.expenseCategory}) = lower(${NOT_SURE_CATEGORY})) ${marked}) ${notReversed}`,
    ))
    .orderBy(asc(jointAccountTxTable.date), asc(jointAccountTxTable.id))
    // A whole year's statement saved as Not sure is well over a thousand.
    .limit(5000);
  res.json({
    notSureCategory: NOT_SURE_CATEGORY,
    entries: rows.map((row) => ({ ...row, amount: Number(row.amount), direction: row.type === "deposit" ? "in" : "out" })),
  });
});

/**
 * Money in already saved with no income source, gathered into the list to sort
 * out. An import used to ask nothing of money in when the budget had no income
 * sources, so a whole year could be saved with the balance right and the income
 * picture empty (4 Oct 2026). Personal budget only: in a Shared group money in
 * is members' contributions, which need no source.
 *
 * Only plain money in: not borrowing (Fuliza included), a repayment, a move
 * between accounts or to and from savings, a member's contribution or a
 * reversal. Gathered when asked, so what was "left without a source" stays off
 * until the person asks again.
 */
router.post("/entries-to-sort/money-in-without-source", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!entriesToSortReady()) {
    res.status(503).json({ error: "Entries to sort cannot be kept yet." });
    return;
  }
  // From a day on - the phone sends 1 January of the year being worked on
  // ("I want to work with 2026 only"). Without it, every year.
  const from = z.object({ from: z.string().date().optional() }).safeParse(req.body ?? {});
  if (!from.success) {
    res.status(400).json({ error: "Send the day to start from as YYYY-MM-DD." });
    return;
  }
  const added = await gatherMoneyInWithoutSource(groupId, from.data.from, !req.group?.isPrivate);
  res.json({ added });
});

/** "Leave it without a source": money in taken off the list as it is. */
router.delete("/entries-to-sort/:transactionId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = Number(req.params.transactionId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Which entry?" });
    return;
  }
  if (entriesToSortReady()) {
    await db.execute(sql`DELETE FROM "entries_to_sort" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
    // Remembered, so the next gathering does not put it back.
    await db.execute(sql`
      INSERT INTO "entries_left_unsourced" ("transaction_id", "group_id")
      SELECT ${id}, ${groupId}
       WHERE EXISTS (SELECT 1 FROM "joint_account_transactions" WHERE "id" = ${id} AND "group_id" = ${groupId} AND "type" = 'deposit')
      ON CONFLICT DO NOTHING`);
  }
  res.status(204).end();
});

const checkedSchema = markSchema.extend({ again: z.boolean().optional() });

/**
 * Money in listed to check, kept with the source it has ("Keep ..."): off the
 * list. `again` (Undo) puts it back, with the source it has now.
 */
router.post("/entries-to-sort/checked", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!entriesToSortReady()) {
    res.status(503).json({ error: "Entries to sort cannot be kept yet." });
    return;
  }
  const parsed = checkedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the entries you checked." });
    return;
  }
  const ids = [...new Set(parsed.data.transactionIds)];
  if (parsed.data.again) {
    for (const id of ids) {
      await db.execute(sql`
        INSERT INTO "entries_to_check" ("transaction_id", "group_id", "income_source_id")
        SELECT t."id", t."group_id", t."income_source_id" FROM "joint_account_transactions" t
         WHERE t."id" = ${id} AND t."group_id" = ${groupId} AND t."type" = 'deposit' AND t."income_source_id" IS NOT NULL
        ON CONFLICT ("transaction_id") DO UPDATE SET "income_source_id" = EXCLUDED."income_source_id"`);
    }
  } else {
    for (const id of ids) await db.execute(sql`DELETE FROM "entries_to_check" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
  }
  res.status(204).end();
});

const debtSchema = z.object({ kind: z.enum(DEBT_KINDS), partyId: z.number().int().positive().nullable().optional() });

/**
 * Sorted out as a debt: lent, paid back, borrowed or repaid to you, with the
 * person when known (lib/sort-as-debt). Leaves the list.
 */
router.post("/entries-to-sort/:transactionId/debt", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const id = Number(req.params.transactionId);
  const parsed = debtSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    res.status(400).json({ error: "Say what kind of debt it is." });
    return;
  }
  const result = await sortAsDebt(groupId, id, parsed.data.kind, parsed.data.partyId ?? null);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(204).end();
});

/** Undo the above: back on the list as it was. */
router.delete("/entries-to-sort/:transactionId/debt", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const id = Number(req.params.transactionId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Which entry?" });
    return;
  }
  const result = await unsortDebt(groupId, id);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(204).end();
});

/**
 * Money in from one payer that is already filed under an income source, so the
 * phone can offer to change them all when the person picks another ("if the user
 * says it's for a business but earlier had specified differently, how do we
 * correct this instantly", 10 Oct 2026). Matched on the exact description here;
 * the phone narrows it to the same payer (payeeLearning sourceRuleKey) and, for
 * one kind of payment, to its amounts.
 */
const payerQuery = z.object({ description: z.string().trim().min(1).max(300) });

router.post("/payer-money-in/find", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const parsed = payerQuery.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Say which payer." });
    return;
  }
  const result = await db.execute(sql`
    SELECT t."id", t."amount", t."date"::text AS "date", t."description", t."income_source_id" AS "incomeSourceId"
      FROM "joint_account_transactions" t
     WHERE t."group_id" = ${groupId}
       AND t."type" = 'deposit'
       AND t."income_source_id" IS NOT NULL
       AND t."bank_transfer_id" IS NULL
       AND t."savings_goal_id" IS NULL
       AND lower(t."description") = lower(${parsed.data.description})
       AND NOT EXISTS (SELECT 1 FROM "joint_account_deposit_splits" s WHERE s."transaction_id" = t."id")
     ORDER BY t."date" DESC
     LIMIT 2000`);
  const rows = result.rows as Array<{ id: number; amount: number | string; date: string; description: string; incomeSourceId: number }>;
  res.json({ entries: rows.map((row) => ({ id: Number(row.id), amount: Number(row.amount), date: row.date, description: row.description, incomeSourceId: Number(row.incomeSourceId) })) });
});

const refileSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(2000),
  incomeSourceId: z.number().int().positive(),
});

/**
 * Those entries moved to another income source in one go: its owner becomes who
 * the money came in under, as Sort them out does. Only money in that already had
 * a source, in this budget, and not a move between accounts.
 */
router.post("/payer-money-in/refile", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = refileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Say which entries, and where they go." });
    return;
  }
  const source = await db.execute(sql`
    SELECT "user_id" AS "userId" FROM "income_sources" WHERE "id" = ${parsed.data.incomeSourceId} AND "group_id" = ${groupId} LIMIT 1`);
  const owner = (source.rows[0] as { userId?: string } | undefined)?.userId;
  if (!owner) {
    res.status(400).json({ error: "Choose an income source of this budget." });
    return;
  }
  const ids = [...new Set(parsed.data.ids)];
  const updated = await db.execute(sql`
    UPDATE "joint_account_transactions"
       SET "income_source_id" = ${parsed.data.incomeSourceId}, "made_by_id" = ${owner}
     WHERE "group_id" = ${groupId}
       AND "type" = 'deposit'
       AND "income_source_id" IS NOT NULL
       AND "bank_transfer_id" IS NULL
       AND "id" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    RETURNING "id"`);
  res.json({ refiled: updated.rows.length });
});

export default router;
