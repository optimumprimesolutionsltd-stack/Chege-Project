import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable, expensesTable, expenseCategoryAllocationsTable, groupsTable, jointAccountTxTable } from "@workspace/db";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ApplyBudgetCategoryRecommendationsBody,
  ApplyBudgetCategoryRecommendationsResponse,
  GetBudgetCategoryRecommendationsResponse,
} from "@workspace/api-zod";
import { getActiveGroupId, requireGroupManager, requireTransactionEligibility } from "../lib/activeGroup";
import { categoryPackChildren, categoryPackForKind, categoryPackRows, normalizedCategoryPackKind, priorityTiersForKind, subcategorySuggestions } from "../lib/categoryPacks";

import { canonicalExpenseCategoryName } from "../lib/categoryNames";

const router = Router();
const UNCATEGORIZED_CATEGORY = "Uncategorized";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const priorityTierSchema = z.object({
  priority: z.number().int().min(1).max(5),
  label: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(180),
});
const editablePriorityTiersSchema = z.object({
  tiers: z.array(priorityTierSchema).length(5).refine(
    (tiers) => new Set(tiers.map((tier) => tier.priority)).size === 5,
    "Each priority tier must appear exactly once.",
  ),
});

function resolvedPriorityTiers(
  kind: string | null | undefined,
  saved: unknown,
) {
  const parsed = z.array(priorityTierSchema).length(5).safeParse(saved);
  return parsed.success ? parsed.data : priorityTiersForKind(kind);
}

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

router.get("/budget-priority-tiers", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const [group] = await db
    .select({ kind: groupsTable.kind, priorityTiers: groupsTable.priorityTiers })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  if (!group) { res.status(404).json({ error: "Active budget not found." }); return; }
  res.json({ tiers: resolvedPriorityTiers(group.kind, group.priorityTiers) });
});

router.put("/budget-priority-tiers", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !requireGroupManager(req, res)) return;
  const parsed = editablePriorityTiersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide five named priority tiers in the order they should appear." });
    return;
  }

  const orderedTiers = parsed.data.tiers.map((tier, index) => ({
    priority: index + 1,
    label: tier.label,
    description: tier.description,
  }));

  await db.transaction(async (tx) => {
    // Stage the five current priority values out of range, then put each tier's
    // categories into its new position. This keeps a reordered tier and all of
    // its ledger categories together.
    await tx.update(budgetCategoriesTable)
      .set({ priority: sql`${budgetCategoriesTable.priority} + 100` })
      .where(and(
        eq(budgetCategoriesTable.groupId, groupId),
        inArray(budgetCategoriesTable.priority, [1, 2, 3, 4, 5]),
      ));
    for (const [index, tier] of parsed.data.tiers.entries()) {
      await tx.update(budgetCategoriesTable)
        .set({ priority: index + 1 })
        .where(and(
          eq(budgetCategoriesTable.groupId, groupId),
          eq(budgetCategoriesTable.priority, tier.priority + 100),
        ));
    }
    await tx.update(groupsTable)
      .set({ priorityTiers: orderedTiers })
      .where(eq(groupsTable.id, groupId));
  });

  res.json({ tiers: orderedTiers });
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
  if (!await requireTransactionEligibility(req, res)) return;
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
  if (!await requireTransactionEligibility(req, res)) return;
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

    // The suggested mini-ledgers, added under whichever parents now exist.
    // Read back rather than trusting the insert above: a parent the person
    // already had keeps its own id, and its ledgers still belong under it.
    const suggestedChildren = categoryPackChildren(group.kind);
    if (suggestedChildren.size > 0) {
      const parentNames = [...suggestedChildren.keys()];
      const parents = await tx
        .select({ id: budgetCategoriesTable.id, name: budgetCategoriesTable.name })
        .from(budgetCategoriesTable)
        .where(and(
          eq(budgetCategoriesTable.groupId, groupId),
          inArray(budgetCategoriesTable.name, parentNames),
        ));

      const childRows = parents.flatMap((parent) =>
        (suggestedChildren.get(parent.name) ?? [])
          .filter((child) => !existingNames.has(normalizedCategoryName(child)))
          .map((child) => ({
            groupId,
            parentId: parent.id,
            name: child,
            // No amount. Guessing somebody's electricity bill would be worse
            // than leaving it blank, and a ledger tracks spending either way.
            budgetAmount: 0,
            priority: 3,
            color: "#6B7280",
            isRecurring: true,
            activeMonth: null,
            activeYear: null,
          })),
      );

      if (childRows.length > 0) {
        await tx.insert(budgetCategoriesTable).values(childRows).onConflictDoNothing();
        // Each of those parents is now budgeted through its children.
        for (const parentId of new Set(childRows.map((child) => child.parentId))) {
          await clearParentBudgetAmount(tx, groupId, parentId);
        }
      }
    }
  });

  res.json(ApplyBudgetCategoryRecommendationsResponse.parse(await getCategoryRecommendationPreview(groupId)));
});

async function getSubcategorySuggestions(groupId: number) {
  const [group] = await db
    .select({ kind: groupsTable.kind })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  const categories = await db
    .select({
      id: budgetCategoriesTable.id,
      name: budgetCategoriesTable.name,
      parentId: budgetCategoriesTable.parentId,
    })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.groupId, groupId), eq(budgetCategoriesTable.isArchived, false)));
  return subcategorySuggestions(group?.kind, categories, UNCATEGORIZED_CATEGORY);
}

// Reviewed in Settings: which top-level categories in a household budget could
// be tucked under a parent. Read-only; nothing moves until /apply is called.
router.get("/budget-categories/subcategory-suggestions", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json(await getSubcategorySuggestions(groupId));
});

const SubcategoryMovesBody = z.object({
  moves: z.array(z.object({
    categoryId: z.number().int().positive(),
    parentId: z.number().int().positive().optional(),
    parentName: z.string().trim().min(1).max(80).optional(),
  }).refine((move) => (move.parentId == null) !== (move.parentName == null), {
    message: "Each move needs exactly one of parentId or parentName.",
  })).min(1).max(200),
});

router.post("/budget-categories/subcategory-suggestions/apply", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;

  const parsed = SubcategoryMovesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const [group] = await db
    .select({ kind: groupsTable.kind })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  const packByName = new Map(
    categoryPackForKind(group?.kind).map((item) => [item.name.trim().toLocaleLowerCase("en-US"), item]),
  );

  try {
    await db.transaction(async (tx) => {
      for (const move of parsed.data.moves) {
        const [category] = await tx.select()
          .from(budgetCategoriesTable)
          .where(and(eq(budgetCategoriesTable.id, move.categoryId), eq(budgetCategoriesTable.groupId, groupId)))
          .limit(1);
        if (!category) throw new HttpError(404, `Category ${move.categoryId} not found.`);
        if (category.parentId != null) throw new HttpError(400, `"${category.name}" is already a sub-category.`);
        if (isReservedBudgetCategoryName(category.name)) {
          throw new HttpError(400, `"${UNCATEGORIZED_CATEGORY}" cannot be nested.`);
        }
        const [ownChild] = await tx.select({ id: budgetCategoriesTable.id })
          .from(budgetCategoriesTable)
          .where(and(eq(budgetCategoriesTable.parentId, move.categoryId), eq(budgetCategoriesTable.groupId, groupId)))
          .limit(1);
        if (ownChild) throw new HttpError(400, `"${category.name}" has its own sub-categories, so it cannot become one.`);

        let parentId = move.parentId ?? null;
        if (parentId == null && move.parentName) {
          const [existingParent] = await tx.select({ id: budgetCategoriesTable.id })
            .from(budgetCategoriesTable)
            .where(and(
              eq(budgetCategoriesTable.name, move.parentName),
              eq(budgetCategoriesTable.groupId, groupId),
            ))
            .limit(1);
          if (existingParent) {
            parentId = existingParent.id;
          } else {
            const packItem = packByName.get(move.parentName.trim().toLocaleLowerCase("en-US"));
            const [createdParent] = await tx.insert(budgetCategoriesTable).values({
              groupId,
              name: move.parentName,
              budgetAmount: 0,
              priority: packItem?.priority ?? 3,
              color: packItem?.color ?? "#6B7280",
              isRecurring: true,
              activeMonth: null,
              activeYear: null,
            }).onConflictDoNothing().returning({ id: budgetCategoriesTable.id });
            parentId = createdParent?.id ?? null;
            if (parentId == null) {
              const [raced] = await tx.select({ id: budgetCategoriesTable.id })
                .from(budgetCategoriesTable)
                .where(and(eq(budgetCategoriesTable.name, move.parentName), eq(budgetCategoriesTable.groupId, groupId)))
                .limit(1);
              parentId = raced?.id ?? null;
            }
          }
        }
        if (parentId == null) throw new HttpError(400, "Could not resolve a parent for the move.");
        if (parentId === move.categoryId) throw new HttpError(400, "A category cannot be inside itself.");

        const [parent] = await tx.select({ id: budgetCategoriesTable.id, parentId: budgetCategoriesTable.parentId })
          .from(budgetCategoriesTable)
          .where(and(eq(budgetCategoriesTable.id, parentId), eq(budgetCategoriesTable.groupId, groupId)))
          .limit(1);
        if (!parent) throw new HttpError(400, "The chosen parent is not in this budget.");
        if (parent.parentId != null) throw new HttpError(400, "Sub-categories only go one level deep.");

        await tx.update(budgetCategoriesTable)
          .set({ parentId })
          .where(and(eq(budgetCategoriesTable.id, move.categoryId), eq(budgetCategoriesTable.groupId, groupId)));
        await clearParentBudgetAmount(tx, groupId, parentId);
      }
    });
  } catch (error) {
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }

  res.json(await getSubcategorySuggestions(groupId));
});

const categoryFields = z.object({
  name: z.string().trim().min(1).max(80),
  budgetAmount: z.number().int().min(0),
  priority: z.number().int().min(1).max(10).optional().default(1),
  color: z.string().optional().default("#6B7280"),
  isRecurring: z.boolean().optional().default(true),
  activeMonth: z.number().int().min(1).max(12).nullable().optional(),
  activeYear: z.number().int().min(2000).max(2200).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  // Present (non-null) marks this category as a tracked debt. Basis points
  // (1/100 of a percent) so the rate is an exact integer.
  debtBalance: z.number().int().min(0).nullable().optional(),
  debtInterestRateBps: z.number().int().min(0).max(10000).nullable().optional(),
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


/**
 * Whether a category may sit under this parent.
 *
 * Ledgers go one level deep on purpose. Wi-Fi under Utilities is a mini-ledger
 * somebody will actually keep; a third level is a filing system, and it turns
 * every total in the app into a recursive question.
 *
 * Returns an explanation rather than a boolean so the caller can say which of
 * the several ways this can be wrong actually happened.
 */
/**
 * Clear the budget amount on a category that has just gained a subcategory.
 *
 * A parent is budgeted through its subcategories — its figure is theirs added
 * up — so the number on the parent stops counting the moment one is nested
 * under it. Leaving it in the column is a trap: nothing displays it, so nobody
 * can correct it, and anything reading the table directly finds a figure that
 * looks authoritative and is not.
 *
 * Clearing it changes no number anybody sees; it only makes the storage agree
 * with what is already reported.
 */
/**
 * A subcategory takes its parent's tier.
 *
 * Asking for one was a question with no useful answer: tiers rank what gets
 * funded first, and a subcategory is part of whatever its parent is, so a
 * "Tier 5" Groceries inside a "Tier 1" Food only ever produced a contradiction
 * to explain away. Set from the parent on create and again on a move, so it
 * cannot drift.
 */
async function parentPriority(
  runner: Pick<typeof db, "select">,
  groupId: number,
  parentId: number,
): Promise<number | null> {
  const [parent] = await runner
    .select({ priority: budgetCategoriesTable.priority })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.id, parentId), eq(budgetCategoriesTable.groupId, groupId)))
    .limit(1);
  return parent?.priority ?? null;
}

async function clearParentBudgetAmount(
  runner: Pick<typeof db, "update">,
  groupId: number,
  parentId: number,
): Promise<void> {
  await runner.update(budgetCategoriesTable)
    .set({ budgetAmount: 0 })
    .where(and(eq(budgetCategoriesTable.id, parentId), eq(budgetCategoriesTable.groupId, groupId)));
}

async function parentRejection(
  groupId: number,
  parentId: number,
  selfId: number | null,
): Promise<string | null> {
  if (selfId !== null && parentId === selfId) {
    return "A category cannot be inside itself.";
  }

  const [parent] = await db
    .select({ id: budgetCategoriesTable.id, parentId: budgetCategoriesTable.parentId })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.id, parentId), eq(budgetCategoriesTable.groupId, groupId)))
    .limit(1);
  if (!parent) return "That category does not exist in this budget.";
  if (parent.parentId !== null) {
    return "Sub-categories only go one level deep. Pick a top-level category instead.";
  }

  if (selfId !== null) {
    const [child] = await db
      .select({ id: budgetCategoriesTable.id })
      .from(budgetCategoriesTable)
      .where(and(eq(budgetCategoriesTable.parentId, selfId), eq(budgetCategoriesTable.groupId, groupId)))
      .limit(1);
    if (child) {
      return "This category already has sub-categories of its own, so it cannot become one.";
    }
  }

  return null;
}

router.post("/budget-categories", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!await requireTransactionEligibility(req, res)) return;
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  if (isReservedBudgetCategoryName(parsed.data.name)) {
    res.status(400).json({ error: `"${UNCATEGORIZED_CATEGORY}" is reserved for uncategorized expenses.` });
    return;
  }
  // Expenses have always been stored under the canonical name, so a category
  // created as "Rent" could never collect any spending — every expense tagged
  // to it was filed as "Housing". The category has to agree with the expenses.
  const requestedName = parsed.data.name.trim();
  const canonicalName = canonicalExpenseCategoryName(requestedName);
  const wasCanonicalised = canonicalName !== requestedName;
  parsed.data.name = canonicalName;
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: and(
      eq(budgetCategoriesTable.name, parsed.data.name),
      eq(budgetCategoriesTable.groupId, groupId),
    ),
  });
  if (duplicate) {
    // Saying "this name already exists" about a name they did not type reads
    // as a bug. Name both, so the reason is obvious.
    res.status(409).json({
      error: wasCanonicalised
        ? `"${requestedName}" is recorded as "${canonicalName}", which this budget already has.`
        : "A category with this name already exists",
    });
    return;
  }
  if (parsed.data.parentId != null) {
    const rejection = await parentRejection(groupId, parsed.data.parentId, null);
    if (rejection) { res.status(400).json({ error: rejection }); return; }
  }
  try {
    const row = await db.transaction(async (tx) => {
      // A subcategory is part of whatever its parent is, so it ranks with it.
      const inherited = parsed.data.parentId != null
        ? await parentPriority(tx, groupId, parsed.data.parentId)
        : null;
      const [created] = await tx.insert(budgetCategoriesTable).values({
        ...parsed.data,
        ...(inherited != null ? { priority: inherited } : {}),
        groupId,
        activeMonth: parsed.data.isRecurring ? null : parsed.data.activeMonth,
        activeYear: parsed.data.isRecurring ? null : parsed.data.activeYear,
      }).returning();
      // The parent this was nested under is now budgeted through its children.
      if (parsed.data.parentId != null) {
        await clearParentBudgetAmount(tx, groupId, parsed.data.parentId);
      }
      return created;
    });
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
  if (parsed.data.parentId != null) {
    const rejection = await parentRejection(groupId, parsed.data.parentId, id);
    if (rejection) { res.status(400).json({ error: rejection }); return; }
  }
  const merged = categorySchema.safeParse({ ...existing, ...parsed.data });
  if (!merged.success) { res.status(400).json({ error: "Invalid input", details: merged.error.flatten() }); return; }
  // Renaming a category to an alias would reopen the same gap as creating one.
  const requestedName = merged.data.name.trim();
  const canonicalName = canonicalExpenseCategoryName(requestedName);
  const wasCanonicalised = canonicalName !== requestedName;
  merged.data.name = canonicalName;
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: and(
      eq(budgetCategoriesTable.name, merged.data.name),
      eq(budgetCategoriesTable.groupId, groupId),
      ne(budgetCategoriesTable.id, id),
    ),
  });
  if (duplicate) {
    res.status(409).json({
      error: wasCanonicalised
        ? `"${requestedName}" is recorded as "${canonicalName}", which this budget already has.`
        : "A category with this name already exists",
    });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      // Nesting this category under a parent leaves that parent budgeted
      // through its children, so the figure on it stops counting.
      if (parsed.data.parentId != null) {
        await clearParentBudgetAmount(tx, groupId, parsed.data.parentId);
      }
      // Moving a subcategory under a different heading re-ranks it with the
      // new one, so a move cannot leave it sorted under its old parent's tier.
      const movedUnder = merged.data.parentId ?? null;
      const inherited = movedUnder != null ? await parentPriority(tx, groupId, movedUnder) : null;
      const [updated] = await tx.update(budgetCategoriesTable).set({
        ...merged.data,
        ...(inherited != null ? { priority: inherited } : {}),
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
  // Checked before attempting the delete so the answer names the reason. The
  // foreign key would refuse it anyway, but only with a constraint violation.
  const [child] = await db
    .select({ name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.parentId, id), eq(budgetCategoriesTable.groupId, groupId)))
    .limit(1);
  if (child) {
    res.status(409).json({
      error: `Move or remove the sub-categories inside this one first, starting with "${child.name}".`,
    });
    return;
  }
  const [deleted] = await db.delete(budgetCategoriesTable)
    .where(and(eq(budgetCategoriesTable.id, id), eq(budgetCategoriesTable.groupId, groupId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ success: true });
});

export default router;
