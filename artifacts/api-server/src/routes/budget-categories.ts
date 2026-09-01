import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable, expensesTable, expenseCategoryAllocationsTable, groupsTable, jointAccountTxTable } from "@workspace/db";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  ApplyBudgetCategoryRecommendationsBody,
  ApplyBudgetCategoryRecommendationsResponse,
  GetBudgetCategoryRecommendationsResponse,
} from "@workspace/api-zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { categoryPackForKind, categoryPackRows, normalizedCategoryPackKind } from "../lib/categoryPacks";

const router = Router();
const UNCATEGORIZED_CATEGORY = "Uncategorized";

function isReservedBudgetCategoryName(name: string) {
  return name.trim().toLocaleLowerCase() === UNCATEGORIZED_CATEGORY.toLocaleLowerCase();
}

function normalizedCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

function recommendationPreview(kind: string | null | undefined, categoryNames: string[]) {
  const existingNames = new Set(categoryNames.map(normalizedCategoryName));
  const recommended = categoryPackForKind(kind).map((category) => ({
    ...category,
    exists: existingNames.has(normalizedCategoryName(category.name)),
  }));
  return {
    kind: normalizedCategoryPackKind(kind),
    existing: recommended.filter((category) => category.exists),
    missing: recommended.filter((category) => !category.exists),
  };
}

async function getCategoryRecommendationPreview(groupId: number) {
  const [group] = await db
    .select({ kind: groupsTable.kind })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  const categories = await db
    .select({ name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.groupId, groupId));
  return recommendationPreview(group?.kind, categories.map((category) => category.name));
}

router.get("/budget-categories", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const categories = await db
    .select()
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.groupId, groupId), eq(budgetCategoriesTable.isArchived, false)))
    .orderBy(asc(budgetCategoriesTable.priority), asc(budgetCategoriesTable.name));
  res.json(categories);
});

router.get("/budget-categories/recommendations", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json(GetBudgetCategoryRecommendationsResponse.parse(await getCategoryRecommendationPreview(groupId)));
});

router.get("/budget-categories/migration", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !requireGroupManager(req, res)) return;
  const [group] = await db.select({ kind: groupsTable.kind, name: groupsTable.name })
    .from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
  if (!group) { res.status(404).json({ error: "Active budget not found." }); return; }
  const categories = await db.select().from(budgetCategoriesTable)
    .where(eq(budgetCategoriesTable.groupId, groupId))
    .orderBy(asc(budgetCategoriesTable.priority), asc(budgetCategoriesTable.name));
  const recommendedNames = new Set(categoryPackForKind(group.kind).map((item) => normalizedCategoryName(item.name)));
  res.json({
    group: { id: groupId, name: group.name, kind: normalizedCategoryPackKind(group.kind) },
    recommended: categoryPackForKind(group.kind),
    categories: categories.map((category) => ({ ...category, recommended: recommendedNames.has(normalizedCategoryName(category.name)) })),
  });
});

const categoryMigrationSchema = z.object({
  archiveCategoryIds: z.array(z.number().int().positive()).max(100).default([]),
  addRecommended: z.boolean().default(true),
});

router.post("/budget-categories/migration/apply", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !requireGroupManager(req, res)) return;
  const parsed = categoryMigrationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid category migration request." }); return; }
  await db.transaction(async (tx) => {
    const [group] = await tx.select({ kind: groupsTable.kind }).from(groupsTable)
      .where(eq(groupsTable.id, groupId)).limit(1);
    if (!group) return;
    if (parsed.data.archiveCategoryIds.length > 0) {
      await tx.update(budgetCategoriesTable).set({ isArchived: true }).where(and(
        eq(budgetCategoriesTable.groupId, groupId),
        inArray(budgetCategoriesTable.id, parsed.data.archiveCategoryIds),
      ));
    }
    if (parsed.data.addRecommended) {
      const current = await tx.select({ name: budgetCategoriesTable.name }).from(budgetCategoriesTable)
        .where(eq(budgetCategoriesTable.groupId, groupId));
      const names = new Set(current.map((item) => normalizedCategoryName(item.name)));
      const missing = categoryPackRows(groupId, group.kind).filter((item) => !names.has(normalizedCategoryName(item.name)));
      if (missing.length > 0) await tx.insert(budgetCategoriesTable).values(missing).onConflictDoNothing();
    }
  });
  res.json({ ok: true, migration: await getCategoryRecommendationPreview(groupId) });
});

router.post("/budget-categories/recommendations/apply", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const parsed = ApplyBudgetCategoryRecommendationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recommendation request." });
    return;
  }

  await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ kind: groupsTable.kind })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .limit(1);
    if (!group) return;
    const categories = await tx
      .select({ name: budgetCategoriesTable.name })
      .from(budgetCategoriesTable)
      .where(eq(budgetCategoriesTable.groupId, groupId));
    const existingNames = new Set(categories.map((category) => normalizedCategoryName(category.name)));
    const missingRows = categoryPackRows(groupId, group.kind)
      .filter((category) => !existingNames.has(normalizedCategoryName(category.name)));
    if (missingRows.length > 0) {
      await tx.insert(budgetCategoriesTable).values(missingRows).onConflictDoNothing();
    }
  });

  res.json(ApplyBudgetCategoryRecommendationsResponse.parse(await getCategoryRecommendationPreview(groupId)));
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
  if (isReservedBudgetCategoryName(parsed.data.name)) {
    res.status(400).json({ error: `"${UNCATEGORIZED_CATEGORY}" is reserved for uncategorized expenses.` });
    return;
  }
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
  // Do not rewrite historical sentinel-named budget rows, but never allow a
  // new/renamed category to collide with the expense storage sentinel.
  if (parsed.data.name !== undefined && isReservedBudgetCategoryName(parsed.data.name)) {
    res.status(400).json({ error: `"${UNCATEGORIZED_CATEGORY}" is reserved for uncategorized expenses.` });
    return;
  }
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
        // Allocation rows are the category-reporting source for split
        // expenses. Update them in the same rename transaction; primary
        // parent categories above stay equal to their position-zero portion.
        await tx.update(expenseCategoryAllocationsTable)
          .set({ category: updated.name })
          .where(and(
            eq(expenseCategoryAllocationsTable.groupId, groupId),
            eq(expenseCategoryAllocationsTable.category, existing.name),
          ));
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
