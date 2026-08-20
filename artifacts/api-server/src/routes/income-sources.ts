import { Router } from "express";
import { db } from "@workspace/db";
import { groupMembershipsTable, incomeSourcesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId, isGroupManager, requireMemberSelfAttribution } from "../lib/activeGroup";

const router = Router();

async function isGroupMember(userId: string, groupId: number): Promise<boolean> {
  const [member] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

// GET /api/income-sources?userId=xxx  — list all, or filtered by userId
router.get("/income-sources", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const userId = req.query.userId as string | undefined;
  if (userId && !(await isGroupMember(userId, groupId))) {
    res.status(400).json({ error: "User is not a member of this shared group." });
    return;
  }
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
    expectedMonthlyAmount: z.number().int().min(0).optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (!requireMemberSelfAttribution(req, res, [parsed.data.userId])) return;
  if (!(await isGroupMember(parsed.data.userId, groupId))) {
    res.status(400).json({ error: "User is not a member of this shared group." });
    return;
  }

  const [row] = await db.insert(incomeSourcesTable).values({ ...parsed.data, groupId }).returning();
  res.status(201).json(row);
});

// PUT /api/income-sources/:id — rename a source
router.put("/income-sources/:id", async (req, res) => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const schema = z.object({
    name: z.string().min(1).max(80),
    isMain: z.boolean().optional(),
    expectedMonthlyAmount: z.number().int().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [existing] = await db.select({ userId: incomeSourcesTable.userId }).from(incomeSourcesTable)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId))).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!isGroupManager(req) && existing.userId !== req.user!.id) {
    res.status(403).json({ error: "Members can manage only their own income sources." });
    return;
  }
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
  if (!isGroupManager(req)) {
    const [existing] = await db.select({ userId: incomeSourcesTable.userId }).from(incomeSourcesTable)
      .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.userId !== req.user!.id) {
      res.status(403).json({ error: "Members can manage only their own income sources." });
      return;
    }
  }
  await db.delete(incomeSourcesTable)
    .where(and(eq(incomeSourcesTable.id, id), eq(incomeSourcesTable.groupId, groupId)));
  res.json({ ok: true });
});

export default router;
