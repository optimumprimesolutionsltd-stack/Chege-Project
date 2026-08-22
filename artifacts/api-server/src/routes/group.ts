import { Router } from "express";
import {
  db,
  groupMembershipsTable,
  groupsTable,
} from "@workspace/db";
import {
  CreateSharedGroupBody,
  CreateSharedGroupResponse,
  GetGroupResponse,
  UpdateGroupResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  canRecordSharedTransactions,
  getActiveGroupId,
  requireGroupManager,
  setActiveWorkspaceCookie,
} from "../lib/activeGroup";

const router = Router();

function normalizedSharedBudgetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function hasAccessibleSharedBudgetWithName(
  userId: string,
  name: string,
  excludedGroupId?: number,
): Promise<boolean> {
  const workspaces = await db
    .select({
      id: groupsTable.id,
      name: groupsTable.name,
      privateOwnerUserId: groupsTable.privateOwnerUserId,
    })
    .from(groupMembershipsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembershipsTable.groupId))
    .where(eq(groupMembershipsTable.userId, userId));

  const normalizedName = normalizedSharedBudgetName(name);
  return workspaces.some((workspace) =>
    workspace.id !== excludedGroupId
    && !workspace.privateOwnerUserId
    && normalizedSharedBudgetName(workspace.name) === normalizedName,
  );
}

router.post("/groups", async (req, res): Promise<void> => {
  const parsed = CreateSharedGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a group name between 2 and 60 characters." });
    return;
  }

  const name = parsed.data.name.trim();
  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Use a group name between 2 and 60 characters." });
    return;
  }
  if (await hasAccessibleSharedBudgetWithName(req.user!.id, name)) {
    res.status(409).json({ error: "You already have a Shared budget with that name. Choose a different name." });
    return;
  }

  const group = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(groupsTable)
      .values({ name, createdByUserId: req.user!.id })
      .returning({ id: groupsTable.id, name: groupsTable.name });
    if (!created) throw new Error("Could not create group.");

    await tx.insert(groupMembershipsTable).values({
      groupId: created.id,
      userId: req.user!.id,
      role: "owner",
      addedByUserId: req.user!.id,
    });
    return created;
  });

  const workspace = {
    id: group.id,
    name: group.name,
    isPrivate: false,
    role: "owner" as const,
  };
  setActiveWorkspaceCookie(res, group.id);
  res.status(201).json(CreateSharedGroupResponse.parse(workspace));
});

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
  const isPrivate = Boolean(group.isPrivate);
  res.json(GetGroupResponse.parse({
    ...group,
    isPrivate,
    role: req.group!.role,
    canRecordSharedTransactions: await canRecordSharedTransactions(group.id, isPrivate),
  }));
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
  if (await hasAccessibleSharedBudgetWithName(req.user!.id, parsed.data.name, groupId)) {
    res.status(409).json({ error: "You already have a Shared budget with that name. Choose a different name." });
    return;
  }

  const [group] = await db.update(groupsTable)
    .set({ name: parsed.data.name })
    .where(eq(groupsTable.id, groupId))
    .returning({
      id: groupsTable.id,
      name: groupsTable.name,
      isPrivate: groupsTable.privateOwnerUserId,
    });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  const isPrivate = Boolean(group.isPrivate);
  res.json(UpdateGroupResponse.parse({
    ...group,
    isPrivate,
    role: req.group!.role,
    canRecordSharedTransactions: await canRecordSharedTransactions(group.id, isPrivate),
  }));
});

export default router;