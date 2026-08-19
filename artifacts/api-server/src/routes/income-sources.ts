import { Router } from "express";
import { db } from "@workspace/db";
import { incomeSourcesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId } from "../lib/activeGroup";

const router = Router();

// GET /api/income-sources?userId=xxx  — list all, or filtered by userId
router.get("/income-sources", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const userId = req.query.userId as string | undefined;
  const rows = userId
    ? await db.select().from(incomeSourcesTable)
        .where(and(eq(incomeSourcesTable.groupId, groupId), eq(incomeSourcesTable.userId, userId)))
        .orderBy(incomeSourcesTable.isMain, incomeSourcesTable.id)
    : await db.select().from(incomeSourcesTable)
        .where(eq(incomeSourcesTable.groupId, groupId))
        .orderBy(incomeSourcesTable.userId, incomeSourcesTable.isMain, incomeSourcesTable.id);

  res.json(rows);
});

// POST /api/income-sources — create a new source
router.post("/income-sources", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const schema = z.object({
    userId: z.string().min(1),
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [row] = await db.insert(incomeSourcesTable).values({ ...parsed.data, groupId }).returning();
  res.status(201).json(row);
});

// PUT /api/income-sources/:id — rename a source
router.put("/income-sources/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const schema = z.object({ name: z.string().min(1).max(80), isMain: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [row] = await db.update(incomeSourcesTable).set(parsed.data)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/income-sources/:id
router.delete("/income-sources/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(incomeSourcesTable)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)));
  res.json({ ok: true });
});

export default router;
