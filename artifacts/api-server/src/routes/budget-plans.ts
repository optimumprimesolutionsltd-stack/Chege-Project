import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, budgetCategoriesTable, budgetPlanCategoriesTable, budgetPlansTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";

const router = Router();

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().max(80).nullable().optional(),
  durationType: z.enum(["ongoing", "week", "month", "quarter", "custom"]),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  categories: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    plannedAmount: z.number().int().min(0),
    priority: z.number().int().min(1).max(10).default(1),
    isCustom: z.boolean().default(false),
    position: z.number().int().min(0).default(0),
  })).max(100),
}).superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must not be before the start date." });
  if (value.durationType === "custom" && !value.endDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Custom budgets require an end date." });
});

router.post("/budget-plans/onboarding", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !requireGroupManager(req, res)) return;
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid budget plan.", details: parsed.error.flatten() }); return; }
  const data = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx.insert(budgetPlansTable).values({
        groupId,
        createdByUserId: req.user!.id,
        name: data.name,
        purpose: data.purpose ?? null,
        durationType: data.durationType,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        status: "active",
      }).returning();
      if (!plan) throw new Error("Could not create budget plan");
      for (const [position, item] of data.categories.entries()) {
        const existing = await tx.query.budgetCategoriesTable.findFirst({ where: and(eq(budgetCategoriesTable.groupId, groupId), eq(budgetCategoriesTable.name, item.name)) });
        const category = existing ?? (await tx.insert(budgetCategoriesTable).values({ groupId, name: item.name, budgetAmount: item.plannedAmount, priority: item.priority, color: "#6B7280", isRecurring: data.durationType === "ongoing" || data.durationType === "month" || data.durationType === "quarter" }).returning())[0];
        await tx.insert(budgetPlanCategoriesTable).values({ budgetPlanId: plan.id, budgetCategoryId: category?.id ?? null, categoryName: item.name, plannedAmount: item.plannedAmount, priority: item.priority, isCustom: item.isCustom, position: item.position ?? position });
      }
      return plan;
    });
    res.status(201).json(result);
  } catch (error) {
    req.log?.error({ error, groupId }, "Could not create onboarding budget plan");
    res.status(500).json({ error: "Could not create the budget plan." });
  }
});

/**
 * What onboarding set as this budget's purpose and duration. Read back so a
 * settings screen can show it, rather than leaving the row write-only from
 * the moment onboarding created it.
 */
router.get("/budget-plans/current", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const [plan] = await db
    .select()
    .from(budgetPlansTable)
    .where(and(eq(budgetPlansTable.groupId, groupId), eq(budgetPlansTable.status, "active")))
    .orderBy(desc(budgetPlansTable.createdAt))
    .limit(1);
  res.json(plan ?? null);
});

const updatePlanSchema = z.object({
  purpose: z.string().trim().max(80).nullable().optional(),
  durationType: z.enum(["ongoing", "week", "month", "quarter", "custom"]).optional(),
  endDate: z.string().date().nullable().optional(),
});

/**
 * Changing your mind about what this budget is for, or how long it runs,
 * without starting a new one. Categories and income streams are left alone -
 * those are already editable from Budget, this only ever covered the two
 * fields nothing else lets you touch.
 */
router.patch("/budget-plans/current", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !requireGroupManager(req, res)) return;

  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid budget plan update.", details: parsed.error.flatten() }); return; }

  const [existing] = await db
    .select()
    .from(budgetPlansTable)
    .where(and(eq(budgetPlansTable.groupId, groupId), eq(budgetPlansTable.status, "active")))
    .orderBy(desc(budgetPlansTable.createdAt))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "No active budget plan to update." }); return; }

  const nextDurationType = parsed.data.durationType ?? existing.durationType;
  // An end date only ever belongs to a custom budget. Moving away from
  // "custom" clears it rather than leaving a stale date sitting under a
  // duration type that no longer uses one; a new endDate always wins over
  // whatever was there, even when the type itself is not changing.
  const nextEndDate = parsed.data.endDate !== undefined
    ? parsed.data.endDate
    : nextDurationType === "custom" ? existing.endDate : null;

  if (nextDurationType === "custom" && !nextEndDate) { res.status(400).json({ error: "Custom budgets require an end date." }); return; }
  if (nextEndDate && nextEndDate < existing.startDate) { res.status(400).json({ error: "End date must not be before the start date." }); return; }

  const changes: { purpose?: string | null; durationType?: string; endDate?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (parsed.data.purpose !== undefined) changes.purpose = parsed.data.purpose;
  if (parsed.data.durationType !== undefined || parsed.data.endDate !== undefined) {
    changes.durationType = nextDurationType;
    changes.endDate = nextEndDate;
  }

  const [updated] = await db.update(budgetPlansTable).set(changes).where(eq(budgetPlansTable.id, existing.id)).returning();
  res.json(updated);
});

export default router;