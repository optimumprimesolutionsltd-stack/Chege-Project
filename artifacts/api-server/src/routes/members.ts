import { Router } from "express";
import { db } from "@workspace/db";
import { groupMembershipsTable, membersTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { MAX_MEMBERS } from "../middlewares/requireMember";
import { getActiveGroupId } from "../lib/activeGroup";

const router = Router();

async function getGroupMembersWithNames(groupId: number) {
  const rows = await db
    .select({
      userId: groupMembershipsTable.userId,
      role: groupMembershipsTable.role,
      addedAt: groupMembershipsTable.addedAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(groupMembershipsTable)
    .leftJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
    .where(eq(groupMembershipsTable.groupId, groupId));

  return rows.map((m) => {
    const name =
      [m.firstName, m.lastName].filter(Boolean).join(" ") ||
      m.email?.split("@")[0] ||
      null;
    return {
      userId: m.userId,
      userName: name,
      addedAt: m.addedAt instanceof Date ? m.addedAt.toISOString() : m.addedAt,
    };
  });
}

router.get("/members", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json(await getGroupMembersWithNames(groupId));
});

router.post("/members", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const schema = z.object({ userId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "userId is required" }); return; }

  const { userId } = parsed.data;

  // Check if already a group member
  const [existing] = await db
    .select({ userId: groupMembershipsTable.userId })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, userId)))
    .limit(1);
  if (existing) { res.status(400).json({ error: "Already a member" }); return; }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.groupId, groupId));
  if (Number(countRow.count) >= MAX_MEMBERS) {
    res.status(400).json({ error: "This household already has the maximum number of members" });
    return;
  }

  // Insert into both groupMembershipsTable and legacy membersTable for compatibility
  await db.insert(groupMembershipsTable).values({
    groupId,
    userId,
    role: "member",
    addedByUserId: req.user!.id,
  });

  // Keep membersTable in sync for legacy routes
  const [legacyExisting] = await db
    .select({ userId: membersTable.userId })
    .from(membersTable)
    .where(eq(membersTable.userId, userId))
    .limit(1);
  if (!legacyExisting) {
    await db.insert(membersTable).values({ userId, groupId, addedByUserId: req.user!.id });
  }

  const members = await getGroupMembersWithNames(groupId);
  const [member] = members.filter((x) => x.userId === userId);

  res.status(201).json(member);
});

router.delete("/members/:userId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const { userId } = req.params;

  // Prevent removing yourself if you're the only member
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.groupId, groupId));
  if (Number(countRow.count) <= 1 && userId === req.user!.id) {
    res.status(400).json({ error: "Cannot remove the last member" });
    return;
  }

  const [deleted] = await db
    .delete(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, userId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Member not found" }); return; }

  // Keep membersTable in sync
  await db.delete(membersTable).where(
    and(eq(membersTable.userId, userId), eq(membersTable.groupId, groupId))
  );

  res.json({ success: true });
});

export default router;
