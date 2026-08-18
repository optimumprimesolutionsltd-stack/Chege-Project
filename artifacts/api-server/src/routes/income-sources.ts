import { Router } from "express";
import { db } from "@workspace/db";
import { incomeSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// GET /api/income-sources?userId=xxx  — list all, or filtered by userId
router.get("/income-sources", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = req.query.userId as string | undefined;
  const rows = userId
    ? await db.select().from(incomeSourcesTable).where(eq(incomeSourcesTable.userId, userId)).orderBy(incomeSourcesTable.isMain, incomeSourcesTable.id)
    : await db.select().from(incomeSourcesTable).orderBy(incomeSourcesTable.userId, incomeSourcesTable.isMain, incomeSourcesTable.id);

  res.json(rows);
});

// POST /api/income-sources — create a new source
router.post("/income-sources", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({
    userId: z.string().min(1),
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [row] = await db.insert(incomeSourcesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// PUT /api/income-sources/:id — rename a source
router.put("/income-sources/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { z } = await import("zod");
  const schema = z.object({ name: z.string().min(1).max(80), isMain: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [row] = await db.update(incomeSourcesTable).set(parsed.data).where(eq(incomeSourcesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/income-sources/:id
router.delete("/income-sources/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(incomeSourcesTable).where(eq(incomeSourcesTable.id, id));
  res.json({ ok: true });
});

export default router;
