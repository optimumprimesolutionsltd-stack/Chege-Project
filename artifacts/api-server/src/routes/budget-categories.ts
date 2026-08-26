import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable, expensesTable, jointAccountTxTable } from "@workspace/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";

const router = Router();

const STARTER_CATEGORIES = [
  { name: "Food", budgetAmount: 0, priority: 1, color: "#F97316" },
  { name: "Housing", budgetAmount: 0, priority: 1, color: "#F59E0B" },
  { name: "Utilities", budgetAmount: 0, priority: 1, color: "#EAB308" },
  { name: "Health", budgetAmount: 0, priority: 2, color: "#EF4444" },
  { name: "Education", budgetAmount: 0, priority: 2, color: "#3B82F6" },
  { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6" },
  { name: "Other", budgetAmount: 0, priority: 5, color: "#6B7280" },
] as const;

/**
 * A budget without any categories leaves its expense picker unusable. Seed a
 * small, editable starter set once so both new and older empty workspaces can
 * record their first expense immediately.
 */
async function seedStarterCategoriesIfMissing(groupId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [existingCategory] = await tx
      .select({ id: budgetCategoriesTable.id })
      .from(budgetCategoriesTable)
      .where(eq(budgetCategoriesTable.groupId, groupId))
      .limit(1);

    if (existingCategory) return;

    await tx
      .insert(budgetCategoriesTable)
      .values(
        STARTER_CATEGORIES.map((category) => ({
          ...category,
          groupId,
          isRecurring: true,
          activeMonth: null,
          activeYear: null,
        })),
      )
      .onConflictDoNothing();
  });
}

router.get("/budget-categories", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  await seedStarterCategoriesIfMissing(groupId);
  const categories = await db
    .select()
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.groupId, groupId))
    .orderBy(asc(budgetCategoriesTable.priority), asc(budgetCategoriesTable.name));
  res.json(categories);
});

const categoryFields = z.object({
  name: z.string().trim().min(1).max(80),
  budgetAmount: z.number().int().min(0),
  priority: z.number().int().min(1).max(10).optional().default(1),
  color: z.string().optional().default("#6B7280"),
  isRecurring: z.boolean().optional().default(true),
  activeMonth: z.number().int().min(1).max(12).nullable().optional(),
  activeYear: z.number().int().min(2000).max(2200).nullable().optional(),
});

const categorySchema = categoryFields.superRefine((data, ctx) => {
  if (!data.isRecurring && (data.activeMonth == null || data.activeYear == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "One-time budgets require an active month and year",
      path: ["activeMonth"],
    });
  }
});

router.post("/budget-categories", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: and(
      eq(budgetCategoriesTable.name, parsed.data.name),
      eq(budgetCategoriesTable.groupId, groupId),
    ),
  });
  if (duplicate) { res.status(409).json({ error: "A category with this name already exists" }); return; }
  try {
    const [row] = await db.insert(budgetCategoriesTable).values({
      ...parsed.data,
      groupId,
      activeMonth: parsed.data.isRecurring ? null : parsed.data.activeMonth,
      activeYear: parsed.data.isRecurring ? null : parsed.data.activeYear,
    }).returning();
    res.status(201).json(row);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
});

router.put("/budget-categories/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = categoryFields.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const [existing] = await db.select().from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.id, id), eq(budgetCategoriesTable.groupId, groupId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Category not found" }); return; }
  const merged = categorySchema.safeParse({ ...existing, ...parsed.data });
  if (!merged.success) { res.status(400).json({ error: "Invalid input", details: merged.error.flatten() }); return; }
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: and(
      eq(budgetCategoriesTable.name, merged.data.name),
      eq(budgetCategoriesTable.groupId, groupId),
      ne(budgetCategoriesTable.id, id),
    ),
  });
  if (duplicate) { res.status(409).json({ error: "A category with this name already exists" }); return; }
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(budgetCategoriesTable).set({
        ...merged.data,
        activeMonth: merged.data.isRecurring ? null : merged.data.activeMonth,
        activeYear: merged.data.isRecurring ? null : merged.data.activeYear,
      }).where(and(eq(budgetCategoriesTable.id, id), eq(budgetCategoriesTable.groupId, groupId))).returning();
      if (!updated) return undefined;

      if (existing.name !== updated.name) {
        await tx.update(expensesTable)
          .set({ category: updated.name })
          .where(and(eq(expensesTable.groupId, groupId), eq(expensesTable.category, existing.name)));
        await tx.update(jointAccountTxTable)
          .set({ expenseCategory: updated.name })
          .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.expenseCategory, existing.name)));
      }
      return updated;
    });
    if (!row) { res.status(404).json({ error: "Category not found" }); return; }
    res.json(row);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
});

router.delete("/budget-categories/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.id, id), eq(budgetCategoriesTable.groupId, groupId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ success: true });
});

export default router;
