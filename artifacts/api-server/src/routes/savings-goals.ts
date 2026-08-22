import { Router } from "express";
import { db } from "@workspace/db";
import {
  savingsGoalsTable,
  savingsGoalContributionsTable,
  jointAccountTxTable,
  usersTable,
  groupMembershipsTable,
} from "@workspace/db";
import {
  DeleteSavingsGoalContributionParams,
  DeleteSavingsGoalContributionResponse,
} from "@workspace/api-zod";
import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import {
  getActiveGroupId,
  requireGroupManager,
  requireMemberSelfAttribution,
  requireSharedTransactionEligibility,
} from "../lib/activeGroup";

const router = Router();

const CreateGoalBody = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  deadline: z.string().optional(),
});

const UpdateGoalBody = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0, "currentAmount cannot be negative").optional(),
  deadline: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
  reason: z.string().trim().min(1).optional(),
});

const GoalIdParam = z.object({
  id: z.coerce.number().int().positive(),
});

function formatGoal(g: typeof savingsGoalsTable.$inferSelect) {
  return {
    ...g,
    deadline: g.deadline ?? null,
    createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt,
  };
}

/** Validate that a non-null member ID belongs to the active group. Returns an error string or null. */
async function validateMemberId(id: string, groupId: number): Promise<string | null> {
  const [member] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.userId, id), eq(groupMembershipsTable.groupId, groupId)))
    .limit(1);
  if (!member) return `Member ID '${id}' is not a recognised household member`;
  return null;
}

// Contributor split attribution. Amounts are whole KES only — DB columns are
// integer, so decimals would be silently truncated and break sum invariants.
const ContributorSplitSchema = z.object({
  userId: z.string().nullable(),
  amount: z.number().int().positive(),
});

type ContributorSplit = z.infer<typeof ContributorSplitSchema>;

/**
 * Distribute a whole-KES `total` across contributor splits using the
 * largest-remainder (Hamilton) method so the per-split integers always sum
 * exactly to `total`, with no rounding-based over- or under-attribution.
 * Returns one { userId, amount } per split whose allocated amount is > 0.
 */
function distributeSplits(
  splits: ContributorSplit[],
  total: number,
): { userId: string | null; amount: number }[] {
  const totalSplits = splits.reduce((s, c) => s + c.amount, 0);
  // Floor each proportional share first, then hand any remaining whole units to
  // the contributors with the largest fractional remainders.
  const floored = splits.map((split) => {
    const exact = (split.amount / totalSplits) * total;
    const floor = Math.floor(exact);
    return { split, floor, remainder: exact - floor };
  });
  const remainder = total - floored.reduce((s, e) => s + e.floor, 0);
  const sorted = [...floored].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remainder; i++) sorted[i].floor += 1;

  return floored
    .filter((e) => e.floor > 0)
    .map((e) => ({ userId: e.split.userId ?? null, amount: e.floor }));
}

/**
 * Validate contributor splits: sum must equal `total` exactly, and every named
 * (non-null) member ID must belong to the active group. Returns an error string or
 * null.
 */
async function validateContributorSplits(
  splits: ContributorSplit[],
  total: number,
  groupId: number,
): Promise<string | null> {
  const splitTotal = splits.reduce((s, c) => s + c.amount, 0);
  if (splitTotal !== total) {
    return `Contributor split amounts (${splitTotal}) must sum to the total amount (${total})`;
  }
  for (const split of splits) {
    if (split.userId !== null) {
      const err = await validateMemberId(split.userId, groupId);
      if (err) return err;
    }
  }
  return null;
}

router.get("/savings-goals", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const goals = await db
    .select()
    .from(savingsGoalsTable)
    .where(eq(savingsGoalsTable.groupId, groupId))
    .orderBy(savingsGoalsTable.createdAt);

  res.json(goals.map(formatGoal));
});

router.post("/savings-goals", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { name, targetAmount, deadline } = parsed.data;

  const [goal] = await db
    .insert(savingsGoalsTable)
    .values({
      groupId,
      name,
      targetAmount,
      currentAmount: 0,
      deadline: deadline ?? null,
      createdByUserId: req.user!.id,
      isCompleted: false,
    })
    .returning();

  res.status(201).json(formatGoal(goal));
});

// POST /savings-goals/cascade-contribute — distribute a payment waterfall-style across goals
router.post("/savings-goals/cascade-contribute", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireSharedTransactionEligibility(req, res)) return;

  const bodySchema = z.object({
    amount: z.number().int().positive(),
    goalIds: z.array(z.number().int().positive()).optional(),
    contributorSplits: z.array(ContributorSplitSchema).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { amount: totalAmount, goalIds, contributorSplits } = parsed.data;
  const effectiveContributorSplits =
    req.group?.role === "member" && (!contributorSplits || contributorSplits.length === 0)
      ? [{ userId: req.user!.id, amount: totalAmount }]
      : contributorSplits;

  if (
    effectiveContributorSplits &&
    !requireMemberSelfAttribution(
      req,
      res,
      effectiveContributorSplits.map((split) => split.userId),
    )
  ) return;

  // Reject duplicate goalIds before opening any transaction. Duplicates would
  // cause the same goal row to be updated and funded twice (or more), silently
  // overfunding it and inserting duplicate contribution history rows.
  if (goalIds && goalIds.length !== new Set(goalIds).size) {
    res.status(400).json({ error: "goalIds must not contain duplicates" });
    return;
  }

  // Validate contributor splits if provided
  if (effectiveContributorSplits && effectiveContributorSplits.length > 0) {
    const err = await validateContributorSplits(effectiveContributorSplits, totalAmount, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  const { allocations, leftover } = await db.transaction(async (tx) => {
    // Fetch and lock goals inside the transaction so two concurrent cascades
    // cannot both read the same stale balances and doubly-fund the same goals.
    let goals: (typeof savingsGoalsTable.$inferSelect)[];
    if (goalIds && goalIds.length > 0) {
      const all = await tx
        .select()
        .from(savingsGoalsTable)
        .where(and(eq(savingsGoalsTable.isCompleted, false), eq(savingsGoalsTable.groupId, groupId)))
        .for("update");
      const byId = Object.fromEntries(all.map((g) => [g.id, g]));
      goals = goalIds.map((id) => byId[id]).filter(Boolean);
    } else {
      goals = await tx
        .select()
        .from(savingsGoalsTable)
        .where(and(eq(savingsGoalsTable.isCompleted, false), eq(savingsGoalsTable.groupId, groupId)))
        .orderBy(savingsGoalsTable.createdAt)
        .for("update");
    }

    let remaining = totalAmount;
    const allocations: {
      goalId: number;
      goalName: string;
      allocated: number;
      newTotal: number;
      completed: boolean;
    }[] = [];

    for (const goal of goals) {
      if (remaining <= 0) break;
      const needed = goal.targetAmount - goal.currentAmount;
      if (needed <= 0) continue; // already full

      const allocated = Math.min(needed, remaining);
      remaining -= allocated;

      const [updated] = await tx
        .update(savingsGoalsTable)
        .set({
          currentAmount: sql`${savingsGoalsTable.currentAmount} + ${allocated}`,
          isCompleted: goal.currentAmount + allocated >= goal.targetAmount ? true : goal.isCompleted,
        })
        .where(and(eq(savingsGoalsTable.id, goal.id), eq(savingsGoalsTable.groupId, groupId)))
        .returning();

        if (effectiveContributorSplits && effectiveContributorSplits.length > 0) {
        // Distribute `allocated` across contributor splits with the largest-remainder
        // (Hamilton) method so per-split integers sum exactly to `allocated`.
        for (const row of distributeSplits(effectiveContributorSplits, allocated)) {
          await tx.insert(savingsGoalContributionsTable).values({
            groupId,
            goalId: goal.id,
            amount: row.amount,
            // null = Joint bank; named ID = individual member
            createdByUserId: row.userId,
          });
        }
      } else {
        // No splits provided → attribute to Joint bank (null). Never fall back to req.user.
        await tx.insert(savingsGoalContributionsTable).values({
          groupId,
          goalId: goal.id,
          amount: allocated,
          createdByUserId: null,
        });
      }

      allocations.push({
        goalId: goal.id,
        goalName: goal.name,
        allocated,
        newTotal: updated.currentAmount,
        completed: updated.isCompleted,
      });
    }

    return { allocations, leftover: remaining };
  });

  res.json({ totalAmount, allocations, leftover });
});

// POST /savings-goals/:id/contribute — atomic server-side increment (before /:id PATCH)
router.post("/savings-goals/:id/contribute", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireSharedTransactionEligibility(req, res)) return;

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodySchema = z.object({
    amount: z.number().int().positive(),
    userId: z.string().nullable().optional(),
    contributorSplits: z.array(ContributorSplitSchema).optional(),
  }).strict();
  const bodyParsed = bodySchema.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { id } = paramParsed.data;
  const { amount, contributorSplits } = bodyParsed.data;
  const hasSplits = !!(contributorSplits && contributorSplits.length > 0);

  // Reject ambiguous payloads: a single userId attribution and per-contributor
  // splits are mutually exclusive.
  if (hasSplits && bodyParsed.data.userId !== undefined && bodyParsed.data.userId !== null) {
    res.status(400).json({ error: "Provide either userId or contributorSplits, not both" });
    return;
  }

  // Explicit null or omitted → Joint bank (null). Never fall back to req.user.
  const userId = bodyParsed.data.userId ?? null;
  const effectiveUserId =
    req.group?.role === "member" && bodyParsed.data.userId === undefined
      ? req.user!.id
      : userId;

  if (hasSplits) {
    if (!requireMemberSelfAttribution(req, res, contributorSplits!.map((split) => split.userId))) return;
    const err = await validateContributorSplits(contributorSplits!, amount, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  } else if (!requireMemberSelfAttribution(req, res, [effectiveUserId])) {
    return;
  } else if (effectiveUserId !== null) {
    const err = await validateMemberId(effectiveUserId, groupId);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  // All reads and writes run inside a single transaction — a crash between them
  // rolls back everything.
  const updated = await db.transaction(async (tx) => {
    // Lock the row so concurrent contributions serialize at the DB level.
    const [goal] = await tx
      .select()
      .from(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
      .for("update");

    if (!goal) return null;

    // Cap the applied amount so the balance never exceeds the target.
    const needed = goal.targetAmount - goal.currentAmount;
    const actualAmount = Math.min(amount, needed);
    const willComplete = goal.currentAmount + actualAmount >= goal.targetAmount;

    const [updated] = await tx
      .update(savingsGoalsTable)
      .set({
        currentAmount: sql`${savingsGoalsTable.currentAmount} + ${actualAmount}`,
        isCompleted: willComplete ? true : goal.isCompleted,
      })
      .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
      .returning();

    if (!updated) return null;

    // Notes have always been the legacy signal for a balance correction.
    // Keep ordinary contribution rows note-free so existing correction history
    // remains distinguishable while newer rows also carry the explicit marker.
    if (hasSplits) {
      // Distribute the (possibly capped) actualAmount across splits with the
      // largest-remainder method so inserted rows sum exactly to actualAmount.
      for (const row of distributeSplits(contributorSplits!, actualAmount)) {
        await tx.insert(savingsGoalContributionsTable).values({
          groupId,
          goalId: id,
          amount: row.amount,
          // null = Joint bank; named ID = individual member
          createdByUserId: row.userId,
        });
      }
    } else {
      await tx.insert(savingsGoalContributionsTable).values({
        groupId,
        goalId: id,
        amount: actualAmount,
        // null = Joint bank; named userId = individual member
          createdByUserId: effectiveUserId,
      });
    }

    return updated;
  });

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatGoal(updated));
});

// GET /savings-goals/:id/contributions — chronological contribution history
router.get("/savings-goals/:id/contributions", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { id } = paramParsed.data;

  // Verify the goal still exists and belongs to this group before returning its history.
  const [goal] = await db
    .select({ id: savingsGoalsTable.id })
    .from(savingsGoalsTable)
    .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
    .limit(1);
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

  const rows = await db
    .select({
      id: savingsGoalContributionsTable.id,
      goalId: savingsGoalContributionsTable.goalId,
      amount: savingsGoalContributionsTable.amount,
      note: savingsGoalContributionsTable.note,
      createdByUserId: savingsGoalContributionsTable.createdByUserId,
      createdAt: savingsGoalContributionsTable.createdAt,
      contributorName: usersTable.firstName,
    })
    .from(savingsGoalContributionsTable)
    .leftJoin(usersTable, eq(savingsGoalContributionsTable.createdByUserId, usersTable.id))
    .where(
      and(
        eq(savingsGoalContributionsTable.goalId, id),
        eq(savingsGoalContributionsTable.groupId, groupId),
      ),
    )
    .orderBy(desc(savingsGoalContributionsTable.createdAt));

  res.json(rows.map((c) => ({
    ...c,
    // null createdByUserId = Joint bank; non-null but no user found = still use name or fallback
    contributorName: c.createdByUserId === null ? "Joint bank" : (c.contributorName ?? "Unknown"),
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  })));
});

// DELETE /savings-goals/:id/contributions/:contributionId — remove a manually
// recorded contribution and reverse the exact amount from the goal balance.
router.delete("/savings-goals/:id/contributions/:contributionId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = DeleteSavingsGoalContributionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid goal or contribution id" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.id, parsed.data.id), eq(savingsGoalsTable.groupId, groupId)))
      .for("update");
    if (!goal) return { kind: "goal-not-found" as const };

    const [contribution] = await tx
      .select()
      .from(savingsGoalContributionsTable)
      .where(and(
        eq(savingsGoalContributionsTable.id, parsed.data.contributionId),
        eq(savingsGoalContributionsTable.goalId, goal.id),
        eq(savingsGoalContributionsTable.groupId, groupId),
      ))
      .for("update");
    if (!contribution) return { kind: "contribution-not-found" as const };

    if (contribution.bankTransactionId !== null) return { kind: "linked-bank-transfer" as const };

    const nextAmount = goal.currentAmount - contribution.amount;
    if (nextAmount < 0) return { kind: "balance-mismatch" as const };

    await tx
      .delete(savingsGoalContributionsTable)
      .where(and(
        eq(savingsGoalContributionsTable.id, contribution.id),
        eq(savingsGoalContributionsTable.groupId, groupId),
      ));
    await tx
      .update(savingsGoalsTable)
      .set({
        currentAmount: nextAmount,
        isCompleted: nextAmount >= goal.targetAmount,
      })
      .where(and(eq(savingsGoalsTable.id, goal.id), eq(savingsGoalsTable.groupId, groupId)));

    return { kind: "deleted" as const };
  });

  if (result.kind === "goal-not-found" || result.kind === "contribution-not-found") {
    res.status(404).json({ error: "Contribution not found" });
    return;
  }
  if (result.kind === "linked-bank-transfer") {
    res.status(400).json({ error: "This contribution came from a bank transfer. Delete the transfer from Joint Bank instead." });
    return;
  }
  if (result.kind === "balance-mismatch") {
    res.status(400).json({ error: "This goal balance no longer matches its history. Reconcile the goal before removing this contribution." });
    return;
  }

  res.json(DeleteSavingsGoalContributionResponse.parse({ success: true }));
});

// GET /savings-goals/consistency-check — surface goals with balance/history mismatches.
router.get("/savings-goals/consistency-check", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const rows = await db
    .select({
      id: savingsGoalsTable.id,
      name: savingsGoalsTable.name,
      currentAmount: savingsGoalsTable.currentAmount,
      contributionTotal: sql<number>`COALESCE(SUM(${savingsGoalContributionsTable.amount}), 0)`,
    })
    .from(savingsGoalsTable)
    .leftJoin(
      savingsGoalContributionsTable,
      and(
        eq(savingsGoalContributionsTable.goalId, savingsGoalsTable.id),
        eq(savingsGoalContributionsTable.groupId, groupId),
      ),
    )
    .where(eq(savingsGoalsTable.groupId, groupId))
    .groupBy(savingsGoalsTable.id);

  const inconsistentGoals = rows
    .filter((r) => r.currentAmount !== Number(r.contributionTotal))
    .map((r) => ({
      id: r.id,
      name: r.name,
      currentAmount: r.currentAmount,
      contributionTotal: Number(r.contributionTotal),
      discrepancy: r.currentAmount - Number(r.contributionTotal),
    }));

  res.json({ ok: inconsistentGoals.length === 0, inconsistentGoals });
});

router.patch("/savings-goals/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = UpdateGoalBody.safeParse(req.body);
  if (!bodyParsed.success) {
    const firstIssue = bodyParsed.error.issues[0];
    const message = firstIssue?.message ?? "Invalid request body";
    res.status(400).json({ error: message });
    return;
  }

  const { id } = paramParsed.data;
  const { reason, ...updates } = bodyParsed.data;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    let delta: number | undefined;
    if (updates.currentAmount !== undefined) {
      const [existing] = await tx
        .select({ currentAmount: savingsGoalsTable.currentAmount })
        .from(savingsGoalsTable)
        .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
        .for("update");
      if (!existing) return null;
      const previousAmount = existing.currentAmount;

      delta = updates.currentAmount - previousAmount;
      if (delta < 0 && previousAmount > 0 && Math.abs(delta) > previousAmount * 0.5 && !reason) {
        return { validationError: `A correction of ${Math.abs(delta).toFixed(2)} would reduce the balance by more than 50%. Provide a 'reason' field to confirm this is intentional.` };
      }
    }

    const { currentAmount: _ignored, ...otherUpdates } = updates;
    const setClause: Record<string, unknown> = { ...otherUpdates };
    if (delta !== undefined) {
      setClause.currentAmount = sql`${savingsGoalsTable.currentAmount} + ${delta}`;
    }

    const [updated] = await tx
      .update(savingsGoalsTable)
      .set(setClause)
      .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
      .returning();

    if (!updated) return null;

    // Record a manual adjustment contribution — note req.user as the actor (manual adjustments
    // are always by the signed-in user, not attributed to Joint bank)
    if (delta !== undefined && delta !== 0) {
      await tx.insert(savingsGoalContributionsTable).values({
        groupId,
        goalId: id,
        amount: delta,
        note: reason ?? "Manual adjustment",
        isBalanceCorrection: true,
        createdByUserId: req.user!.id,
      });
    }

    return updated;
  });

  if (!result) { res.status(404).json({ error: "Not found" }); return; }

  if ("validationError" in result) {
    res.status(400).json({ error: result.validationError });
    return;
  }

  res.json(formatGoal(result));
});

router.delete("/savings-goals/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = GoalIdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { id } = parsed.data;

  const deleted = await db.transaction(async (tx) => {
    const [existingGoal] = await tx
      .select({ id: savingsGoalsTable.id })
      .from(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
      .for("update");
    if (!existingGoal) return null;

    // A transfer is a linked two-ledger movement. Leaving its bank side behind
    // would make the household's history misleading and impossible to reverse.
    const [linkedTransfer] = await tx
      .select({ id: jointAccountTxTable.id })
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.savingsGoalId, id), eq(jointAccountTxTable.groupId, groupId)))
      .limit(1);
    if (linkedTransfer) return { linkedTransfer: true };

    await tx
      .delete(savingsGoalContributionsTable)
      .where(
        and(
          eq(savingsGoalContributionsTable.goalId, id),
          eq(savingsGoalContributionsTable.groupId, groupId),
        ),
      );

    const [goal] = await tx
      .delete(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.groupId, groupId)))
      .returning();

    return goal ?? null;
  });

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  if ("linkedTransfer" in deleted) {
    res.status(409).json({
      error: "Delete or reverse the linked bank transfers before deleting this savings goal.",
    });
    return;
  }

  res.json({ success: true });
});

export default router;
