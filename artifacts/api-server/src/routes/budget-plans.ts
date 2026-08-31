import { Router } from "express";
import { and, eq } from "drizzle-orm";
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

export default router;
