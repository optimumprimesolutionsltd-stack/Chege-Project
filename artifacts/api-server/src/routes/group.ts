import { Router } from "express";
import {
  db,
  bankAccountsTable,
  groupMembershipsTable,
  groupsTable,
} from "@workspace/db";
import {
  CreateSharedGroupBody,
  CreateSharedGroupResponse,
  GetGroupResponse,
  UpdateGroupBody,
  UpdateGroupResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import {
  canRecordSharedTransactions,
  getActiveGroupId,
  requireGroupManager,
  setActiveWorkspaceCookie,
} from "../lib/activeGroup";
import { resolvePhotoUrl } from "../lib/photoStorage";

const router = Router();

function normalizedSharedBudgetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function normalizedSlogan(slogan: string | null | undefined): string | null {
  const value = slogan?.trim().replace(/\s+/g, " ");
  return value || null;
}

function normalizedEmoji(emoji: string | null | undefined): string | null {
  const value = emoji?.trim();
  return value || null;
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
      .values({
        name,
        emoji: normalizedEmoji(parsed.data.emoji),
        nameStyle: parsed.data.nameStyle,
        kind: parsed.data.kind,
        defaultMonthlyTarget: parsed.data.defaultMonthlyTarget ?? null,
        createdByUserId: req.user!.id,
      })
      .returning({
        id: groupsTable.id,
        name: groupsTable.name,
        emoji: groupsTable.emoji,
        nameStyle: groupsTable.nameStyle,
        icon: groupsTable.icon,
        accentColor: groupsTable.accentColor,
        photoPath: groupsTable.photoPath,
        kind: groupsTable.kind,
      });
    if (!created) throw new Error("Could not create group.");

    await tx.insert(groupMembershipsTable).values({
      groupId: created.id,
      userId: req.user!.id,
      role: "owner",
      addedByUserId: req.user!.id,
      // The owner is held to the same figure as everyone else.
      monthlyTarget: parsed.data.defaultMonthlyTarget ?? null,
    });
    await tx.insert(bankAccountsTable).values({
      groupId: created.id,
      name: "Bank account",
      openingBalance: 0,
    });
    return created;
  });

  const workspace = {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    nameStyle: group.nameStyle,
    icon: group.icon,
    accentColor: group.accentColor,
    photoUrl: null,
    slogan: null,
    isPrivate: false,
    kind: group.kind as "personal" | "family" | "chama" | "club" | "team" | "other",
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
      emoji: groupsTable.emoji,
      nameStyle: groupsTable.nameStyle,
      icon: groupsTable.icon,
      accentColor: groupsTable.accentColor,
      photoPath: groupsTable.photoPath,
      slogan: groupsTable.slogan,
      kind: groupsTable.kind,
      isPrivate: groupsTable.privateOwnerUserId,
    })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  const isPrivate = Boolean(group.isPrivate);
  res.json(GetGroupResponse.parse({
    ...group,
    kind: group.kind ?? "family",
    photoUrl: isPrivate ? null : await resolvePhotoUrl(group.photoPath).catch(() => null),
    isPrivate,
    role: req.group!.role,
    canRecordSharedTransactions: await canRecordSharedTransactions(group.id, isPrivate),
  }));
});

router.patch("/group", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const parsed = UpdateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a group name between 2 and 60 characters and choose a provided icon and accent color." });
    return;
  }
  if (
    req.group?.isPrivate
    && parsed.data.photoPath !== undefined
    && parsed.data.photoPath !== null
  ) {
    res.status(400).json({ error: "Photos are only available for Shared budgets." });
    return;
  }
  const name = parsed.data.name.trim();
  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Use a group name between 2 and 60 characters and choose a provided icon and accent color." });
    return;
  }
  if (await hasAccessibleSharedBudgetWithName(req.user!.id, name, groupId)) {
    res.status(409).json({ error: "You already have a Shared budget with that name. Choose a different name." });
    return;
  }

  const [group] = await db.update(groupsTable)
    .set({
      name,
      ...(parsed.data.emoji !== undefined ? { emoji: normalizedEmoji(parsed.data.emoji) } : {}),
      ...(parsed.data.nameStyle ? { nameStyle: parsed.data.nameStyle } : {}),
      ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
      ...(parsed.data.accentColor ? { accentColor: parsed.data.accentColor } : {}),
      ...(parsed.data.photoPath !== undefined ? { photoPath: parsed.data.photoPath } : {}),
      ...(parsed.data.slogan !== undefined ? { slogan: normalizedSlogan(parsed.data.slogan) } : {}),
      ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
    })
    .where(eq(groupsTable.id, groupId))
    .returning({
      id: groupsTable.id,
      name: groupsTable.name,
      emoji: groupsTable.emoji,
      nameStyle: groupsTable.nameStyle,
      icon: groupsTable.icon,
      accentColor: groupsTable.accentColor,
      photoPath: groupsTable.photoPath,
      slogan: groupsTable.slogan,
      kind: groupsTable.kind,
      isPrivate: groupsTable.privateOwnerUserId,
    });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  const isPrivate = Boolean(group.isPrivate);
  res.json(UpdateGroupResponse.parse({
    ...group,
    kind: group.kind ?? "family",
    photoUrl: isPrivate ? null : await resolvePhotoUrl(group.photoPath).catch(() => null),
    isPrivate,
    role: req.group!.role,
    canRecordSharedTransactions: await canRecordSharedTransactions(group.id, isPrivate),
  }));
});

export default router;
