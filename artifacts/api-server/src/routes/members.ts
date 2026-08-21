import { Router } from "express";
import { db } from "@workspace/db";
import { groupMembershipsTable, groupsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";

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
      role: m.role,
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
  if (!requireGroupManager(req, res)) return;

  const schema = z.object({
    userId: z.string().min(1),
    role: z.enum(["admin", "member"]).default("member"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "userId is required" }); return; }

  const { userId, role } = parsed.data;

  const outcome = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .for("update");
    if (!group) return "missing-group" as const;

    const [existing] = await tx
      .select({ userId: groupMembershipsTable.userId })
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, userId)))
      .limit(1);
    if (existing) return "existing" as const;

    await tx.insert(groupMembershipsTable).values({
      groupId,
      userId,
      role,
      addedByUserId: req.user!.id,
    });
    return "added" as const;
  });
  if (outcome === "existing") { res.status(400).json({ error: "Already a member" }); return; }
  if (outcome === "missing-group") { res.status(404).json({ error: "Group not found" }); return; }

  const members = await getGroupMembersWithNames(groupId);
  const [member] = members.filter((x) => x.userId === userId);

  res.status(201).json(member);
});

router.patch("/members/:userId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = z.object({ role: z.enum(["admin", "member"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose Admin or Member." }); return; }

  const [existing] = await db
    .select({ role: groupMembershipsTable.role })
    .from(groupMembershipsTable)
    .where(and(
      eq(groupMembershipsTable.groupId, groupId),
      eq(groupMembershipsTable.userId, req.params.userId),
    ))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Member not found" }); return; }
  if (existing.role === "owner") {
    res.status(403).json({ error: "The group owner role cannot be changed." });
    return;
  }

  await db.update(groupMembershipsTable)
    .set({ role: parsed.data.role })
    .where(and(
      eq(groupMembershipsTable.groupId, groupId),
      eq(groupMembershipsTable.userId, req.params.userId),
    ));
  const members = await getGroupMembersWithNames(groupId);
  const [member] = members.filter((x) => x.userId === req.params.userId);
  res.json(member);
});

router.delete("/members/me", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const outcome = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .for("update");
    if (!group) return "missing-group" as const;

    const [membership] = await tx
      .select({ role: groupMembershipsTable.role })
      .from(groupMembershipsTable)
      .where(and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, req.user!.id),
      ))
      .for("update");
    if (!membership) return "missing-member" as const;
    if (membership.role === "owner") return "owner" as const;

    const [deleted] = await tx
      .delete(groupMembershipsTable)
      .where(and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, req.user!.id),
      ))
      .returning();
    return deleted ? "left" as const : "missing-member" as const;
  });

  if (outcome === "missing-group" || outcome === "missing-member") {
    res.status(404).json({ error: "Group membership not found" });
    return;
  }
  if (outcome === "owner") {
    res.status(403).json({
      error: "The group owner cannot leave. Transfer ownership before leaving the group.",
    });
    return;
  }

  res.json({ success: true });
});

router.delete("/members/:userId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const { userId } = req.params;
  if (userId === req.user!.id) {
    res.status(400).json({ error: "Use Leave group to remove yourself from this group." });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .for("update");
    if (!group) return "missing-group" as const;

    const [actor] = await tx
      .select({ role: groupMembershipsTable.role })
      .from(groupMembershipsTable)
      .where(and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, req.user!.id),
      ))
      .for("update");
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      return "forbidden" as const;
    }

    const [target] = await tx
      .select({ role: groupMembershipsTable.role })
      .from(groupMembershipsTable)
      .where(and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, userId),
      ))
      .for("update");
    if (!target) return "missing-member" as const;
    if (target.role === "owner") return "owner" as const;

    const [deleted] = await tx
      .delete(groupMembershipsTable)
      .where(and(
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.userId, userId),
      ))
      .returning();
    return deleted ? "removed" as const : "missing-member" as const;
  });

  if (outcome === "missing-group" || outcome === "missing-member") {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (outcome === "forbidden") {
    res.status(403).json({ error: "Only owners and admins can remove members." });
    return;
  }
  if (outcome === "owner") {
    res.status(403).json({ error: "The group owner cannot be removed." });
    return;
  }

  res.json({ success: true });
});

export default router;
