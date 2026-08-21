import { Router } from "express";
import { db, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";

const router = Router();

router.get("/group", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const [group] = await db
    .select({
      id: groupsTable.id,
      name: groupsTable.name,
      isPrivate: groupsTable.privateOwnerUserId,
    })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  res.json({ ...group, isPrivate: Boolean(group.isPrivate) });
});

router.patch("/group", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = z.object({ name: z.string().trim().min(2).max(60) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a group name between 2 and 60 characters." });
    return;
  }

  const [group] = await db.update(groupsTable)
    .set({ name: parsed.data.name })
    .where(eq(groupsTable.id, groupId))
    .returning({ id: groupsTable.id, name: groupsTable.name });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(group);
});

export default router;