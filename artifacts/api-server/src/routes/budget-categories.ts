import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable } from "@workspace/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/budget-categories", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const categories = await db
    .select()
    .from(budgetCategoriesTable)
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
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: eq(budgetCategoriesTable.name, parsed.data.name),
  });
  if (duplicate) { res.status(409).json({ error: "A category with this name already exists" }); return; }
  try {
    const [row] = await db.insert(budgetCategoriesTable).values({
      ...parsed.data,
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
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = categoryFields.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const [existing] = await db.select().from(budgetCategoriesTable).where(eq(budgetCategoriesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Category not found" }); return; }
  const merged = categorySchema.safeParse({ ...existing, ...parsed.data });
  if (!merged.success) { res.status(400).json({ error: "Invalid input", details: merged.error.flatten() }); return; }
  const duplicate = await db.query.budgetCategoriesTable.findFirst({
    where: and(
      eq(budgetCategoriesTable.name, merged.data.name),
      ne(budgetCategoriesTable.id, id),
    ),
  });
  if (duplicate) { res.status(409).json({ error: "A category with this name already exists" }); return; }
  try {
    const [row] = await db.update(budgetCategoriesTable).set({
      ...merged.data,
      activeMonth: merged.data.isRecurring ? null : merged.data.activeMonth,
      activeYear: merged.data.isRecurring ? null : merged.data.activeYear,
    }).where(eq(budgetCategoriesTable.id, id)).returning();
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
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ success: true });
});

export default router;
