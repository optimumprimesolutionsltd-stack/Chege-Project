import { Router } from "express";
import { db } from "@workspace/db";
import { savingsGoalsTable, savingsGoalContributionsTable, usersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const CreateGoalBody = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  deadline: z.string().optional(),
});

const UpdateGoalBody = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0).optional(),
  deadline: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
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

router.get("/savings-goals", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const goals = await db
    .select()
    .from(savingsGoalsTable)
    .orderBy(savingsGoalsTable.createdAt);

  res.json(goals.map(formatGoal));
});

router.post("/savings-goals", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { name, targetAmount, deadline } = parsed.data;

  const [goal] = await db
    .insert(savingsGoalsTable)
    .values({
      name,
      targetAmount,
      currentAmount: 0,
      deadline: deadline ?? null,
      createdByUserId: req.user.id,
      isCompleted: false,
    })
    .returning();

  res.status(201).json(formatGoal(goal));
});

// POST /savings-goals/cascade-contribute — distribute a payment waterfall-style across goals
router.post("/savings-goals/cascade-contribute", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const bodySchema = z.object({
    amount: z.number().positive(),
    goalIds: z.array(z.number().int().positive()).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { amount: totalAmount, goalIds } = parsed.data;

  // Fetch goals in requested order or all active goals by creation date
  let goals: (typeof savingsGoalsTable.$inferSelect)[];
  if (goalIds && goalIds.length > 0) {
    const all = await db.select().from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.isCompleted, false));
    const byId = Object.fromEntries(all.map((g) => [g.id, g]));
    goals = goalIds.map((id) => byId[id]).filter(Boolean);
  } else {
    goals = await db.select().from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.isCompleted, false))
      .orderBy(savingsGoalsTable.createdAt);
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

    const [updated] = await db
      .update(savingsGoalsTable)
      .set({
        currentAmount: sql`${savingsGoalsTable.currentAmount} + ${allocated}`,
        isCompleted: goal.currentAmount + allocated >= goal.targetAmount ? true : goal.isCompleted,
      })
      .where(eq(savingsGoalsTable.id, goal.id))
      .returning();

    await db.insert(savingsGoalContributionsTable).values({
      goalId: goal.id,
      amount: allocated,
      createdByUserId: req.user.id,
    });

    allocations.push({
      goalId: goal.id,
      goalName: goal.name,
      allocated,
      newTotal: updated.currentAmount,
      completed: updated.isCompleted,
    });
  }

  res.json({ totalAmount, allocations, leftover: remaining });
});

// POST /savings-goals/:id/contribute — atomic server-side increment (before /:id PATCH)
router.post("/savings-goals/:id/contribute", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodySchema = z.object({ amount: z.number().positive() });
  const bodyParsed = bodySchema.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { id } = paramParsed.data;
  const { amount } = bodyParsed.data;

  // Atomic increment — avoids read-modify-write race conditions
  const [updated] = await db
    .update(savingsGoalsTable)
    .set({ currentAmount: sql`${savingsGoalsTable.currentAmount} + ${amount}` })
    .where(eq(savingsGoalsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Record contribution history
  await db.insert(savingsGoalContributionsTable).values({
    goalId: id,
    amount,
    createdByUserId: req.user.id,
  });

  res.json(formatGoal(updated));
});

// GET /savings-goals/:id/contributions — chronological contribution history
router.get("/savings-goals/:id/contributions", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { id } = paramParsed.data;

  const rows = await db
    .select({
      id: savingsGoalContributionsTable.id,
      goalId: savingsGoalContributionsTable.goalId,
      amount: savingsGoalContributionsTable.amount,
      createdByUserId: savingsGoalContributionsTable.createdByUserId,
      createdAt: savingsGoalContributionsTable.createdAt,
      contributorName: usersTable.firstName,
    })
    .from(savingsGoalContributionsTable)
    .leftJoin(usersTable, eq(savingsGoalContributionsTable.createdByUserId, usersTable.id))
    .where(eq(savingsGoalContributionsTable.goalId, id))
    .orderBy(desc(savingsGoalContributionsTable.createdAt));

  res.json(rows.map((c) => ({
    ...c,
    contributorName: c.contributorName ?? "Unknown",
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  })));
});

router.patch("/savings-goals/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const paramParsed = GoalIdParam.safeParse(req.params);
  if (!paramParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = UpdateGoalBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { id } = paramParsed.data;
  const updates = bodyParsed.data;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  // If currentAmount is being set directly, fetch the current value so we can
  // record the delta as a manual adjustment entry in the contribution history.
  let previousAmount: number | undefined;
  if (updates.currentAmount !== undefined) {
    const [existing] = await db
      .select({ currentAmount: savingsGoalsTable.currentAmount })
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    previousAmount = existing.currentAmount;
  }

  const [updated] = await db
    .update(savingsGoalsTable)
    .set(updates)
    .where(eq(savingsGoalsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Record a manual adjustment contribution so history totals stay consistent.
  if (updates.currentAmount !== undefined && previousAmount !== undefined) {
    const delta = updates.currentAmount - previousAmount;
    if (delta !== 0) {
      await db.insert(savingsGoalContributionsTable).values({
        goalId: id,
        amount: delta,
        note: "Manual adjustment",
        createdByUserId: req.user.id,
      });
    }
  }

  res.json(formatGoal(updated));
});

router.delete("/savings-goals/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = GoalIdParam.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(savingsGoalsTable)
    .where(eq(savingsGoalsTable.id, parsed.data.id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ success: true });
});

export default router;
