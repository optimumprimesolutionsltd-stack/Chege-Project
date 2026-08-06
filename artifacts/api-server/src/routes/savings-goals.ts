import { Router } from "express";
import { db } from "@workspace/db";
import { savingsGoalsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

  res.json(formatGoal(updated));
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

  const [updated] = await db
    .update(savingsGoalsTable)
    .set(updates)
    .where(eq(savingsGoalsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

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
