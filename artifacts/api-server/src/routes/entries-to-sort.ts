import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, jointAccountTxTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { entriesToSortReady, NOT_SURE_CATEGORY } from "../lib/entries-to-sort";
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
      ON CONFLICT ("transaction_id") DO NOTHING`);
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
  const marked = entriesToSortReady()
    ? sql`OR (${jointAccountTxTable.type} = 'deposit' AND ${jointAccountTxTable.incomeSourceId} IS NULL
        AND ${jointAccountTxTable.id} IN (SELECT "transaction_id" FROM "entries_to_sort" WHERE "group_id" = ${groupId}))`
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
  if (!req.group?.isPrivate) {
    res.status(403).json({ error: "This is for a Personal budget: money in to a group is members' contributions." });
    return;
  }
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
  const since = from.data.from ? sql`AND t."date" >= ${from.data.from}` : sql``;
  const added = await db.execute(sql`
    INSERT INTO "entries_to_sort" ("transaction_id", "group_id")
    SELECT t."id", t."group_id"
    FROM "joint_account_transactions" t
    WHERE t."group_id" = ${groupId}
      AND t."type" = 'deposit'
      AND t."income_source_id" IS NULL
      AND t."is_borrowing" = false
      AND t."settles_contributor_id" IS NULL
      AND t."savings_goal_id" IS NULL
      AND t."bank_transfer_id" IS NULL
      AND t."transfer_direction" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "joint_account_deposit_splits" s
        WHERE s."transaction_id" = t."id" AND s."contributor_id" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM "reversal_links" r WHERE r."reversal_transaction_id" = t."id")
      ${since}
    ON CONFLICT ("transaction_id") DO NOTHING
    RETURNING "transaction_id"`);
  res.json({ added: added.rows.length });
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

export default router;
