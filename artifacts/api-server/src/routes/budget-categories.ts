import { Router } from "express";
import { db } from "@workspace/db";
import { budgetCategoriesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
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

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  budgetAmount: z.number().int().min(0),
  priority: z.number().int().min(1).max(10).optional().default(1),
  color: z.string().optional().default("#6B7280"),
});

router.post("/budget-categories", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const [row] = await db.insert(budgetCategoriesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.put("/budget-categories/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const [row] = await db.update(budgetCategoriesTable).set(parsed.data).where(eq(budgetCategoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(row);
});

router.delete("/budget-categories/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ok: true });
});

export default router;
