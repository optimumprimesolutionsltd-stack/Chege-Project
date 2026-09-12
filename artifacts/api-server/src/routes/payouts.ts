/**
 * Merry-go-round: a rotating payout for a shared group.
 *
 * Each round the treasurer picks a member and records what the pot paid them.
 * Recording a payout also writes a joint-account disbursement, so the bank
 * balance and this history move together. There is no stored rotation — this
 * is simply the record of who has received and in what order.
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  bankAccountsTable,
  db,
  groupContributorsTable,
  groupPayoutsTable,
  groupsTable,
  jointAccountTxTable,
} from "@workspace/db";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getActiveGroupId, requireGroupManager, requireTransactionEligibility } from "../lib/activeGroup";

const router: IRouter = Router();

type PayoutRow = { roundNumber: number; contributorId: number; amount: number };
type MemberRow = { id: number; name: string };

/**
 * Fold the payout history into the shape the client needs: the next round
 * number, the total paid out, and per-member how many turns they have had and
 * when. Pure, so the rotation summary can be tested without a database.
 */
export function summarizePayouts(payouts: PayoutRow[], members: MemberRow[]) {
  const timesReceived: Record<number, number> = {};
  const lastRound: Record<number, number> = {};
  for (const payout of payouts) {
    timesReceived[payout.contributorId] = (timesReceived[payout.contributorId] ?? 0) + 1;
    lastRound[payout.contributorId] = Math.max(lastRound[payout.contributorId] ?? 0, payout.roundNumber);
  }
  const highestRound = payouts.reduce((max, payout) => Math.max(max, payout.roundNumber), 0);
  return {
    nextRound: highestRound + 1,
    totalPaidOut: payouts.reduce((sum, payout) => sum + payout.amount, 0),
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      timesReceived: timesReceived[member.id] ?? 0,
      lastRound: lastRound[member.id] ?? null,
    })),
  };
}

async function isMerryGoRoundEnabled(groupId: number): Promise<boolean> {
  const [group] = await db
    .select({ enabled: groupsTable.merryGoRoundEnabled })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  return group?.enabled ?? false;
}

/** The rotation so far, plus who has and has not had a turn. */
router.get("/payouts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const [enabled, payouts, contributors] = await Promise.all([
    isMerryGoRoundEnabled(groupId),
    db
      .select({
        id: groupPayoutsTable.id,
        roundNumber: groupPayoutsTable.roundNumber,
        contributorId: groupPayoutsTable.contributorId,
        name: groupContributorsTable.name,
        amount: groupPayoutsTable.amount,
        date: groupPayoutsTable.date,
        note: groupPayoutsTable.note,
      })
      .from(groupPayoutsTable)
      .innerJoin(groupContributorsTable, eq(groupContributorsTable.id, groupPayoutsTable.contributorId))
      .where(eq(groupPayoutsTable.groupId, groupId))
      .orderBy(desc(groupPayoutsTable.roundNumber)),
    db
      .select({ id: groupContributorsTable.id, name: groupContributorsTable.name })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.groupId, groupId), isNull(groupContributorsTable.archivedAt)))
      .orderBy(asc(groupContributorsTable.name)),
  ]);

  res.json({ enabled, payouts, ...summarizePayouts(payouts, contributors) });
});

const payoutInput = z.object({
  contributorId: z.number().int().positive(),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.number().int().positive().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Record a payout: move the money out of the joint account and log the round. */
router.post("/payouts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  if (!(await isMerryGoRoundEnabled(groupId))) {
    res.status(400).json({
      error: "The merry-go-round is off for this budget. Turn it on in the contribution settings first.",
    });
    return;
  }

  const parsed = payoutInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a member, an amount above zero, and a date." });
    return;
  }

  const [recipient] = await db
    .select({ id: groupContributorsTable.id, name: groupContributorsTable.name })
    .from(groupContributorsTable)
    .where(and(
      eq(groupContributorsTable.id, parsed.data.contributorId),
      eq(groupContributorsTable.groupId, groupId),
      isNull(groupContributorsTable.archivedAt),
    ))
    .limit(1);
  if (!recipient) {
    res.status(400).json({ error: "That member is not in this group." });
    return;
  }

  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(parsed.data.accountId === undefined
      ? eq(bankAccountsTable.groupId, groupId)
      : and(eq(bankAccountsTable.id, parsed.data.accountId), eq(bankAccountsTable.groupId, groupId)))
    .orderBy(asc(bankAccountsTable.id))
    .limit(1);
  if (!account) {
    res.status(400).json({ error: "Set up a bank account first — the payout comes out of it." });
    return;
  }

  const payout = await db.transaction(async (tx) => {
    const [{ maxRound }] = await tx
      .select({ maxRound: sql<number>`COALESCE(MAX(${groupPayoutsTable.roundNumber}), 0)` })
      .from(groupPayoutsTable)
      .where(eq(groupPayoutsTable.groupId, groupId));
    const roundNumber = Number(maxRound) + 1;

    const [movement] = await tx
      .insert(jointAccountTxTable)
      .values({
        groupId,
        accountId: account.id,
        type: "disbursement",
        amount: parsed.data.amount,
        description: `Merry-go-round payout to ${recipient.name} — round ${roundNumber}`,
        date: parsed.data.date,
        madeById: null,
      })
      .returning({ id: jointAccountTxTable.id });

    const [row] = await tx
      .insert(groupPayoutsTable)
      .values({
        groupId,
        contributorId: recipient.id,
        transactionId: movement.id,
        roundNumber,
        amount: parsed.data.amount,
        date: parsed.data.date,
        note: parsed.data.note ?? null,
        recordedByUserId: req.user?.id ?? null,
      })
      .returning();
    return row;
  });

  res.status(201).json({ ...payout, name: recipient.name });
});

/**
 * Undo a recorded round: remove the payout and the joint-account disbursement
 * it created, so the bank balance goes back to where it was. Any round can be
 * removed — round numbers do not have to stay contiguous.
 */
router.delete("/payouts/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid round." });
    return;
  }

  const removed = await db.transaction(async (tx) => {
    const [payout] = await tx
      .select({ id: groupPayoutsTable.id, transactionId: groupPayoutsTable.transactionId })
      .from(groupPayoutsTable)
      .where(and(eq(groupPayoutsTable.id, id), eq(groupPayoutsTable.groupId, groupId)))
      .limit(1);
    if (!payout) return null;

    await tx.delete(groupPayoutsTable).where(eq(groupPayoutsTable.id, payout.id));
    if (payout.transactionId != null) {
      await tx
        .delete(jointAccountTxTable)
        .where(and(eq(jointAccountTxTable.id, payout.transactionId), eq(jointAccountTxTable.groupId, groupId)));
    }
    return payout.id;
  });

  if (removed === null) {
    res.status(404).json({ error: "That round was not found." });
    return;
  }
  res.json({ id: removed });
});

export default router;
