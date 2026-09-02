import {
  GetWorkspacesResponse,
  SelectWorkspaceBody,
  SelectWorkspaceResponse,
} from "@workspace/api-zod";
import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { setActiveWorkspaceCookie } from "../lib/activeGroup";
import { resolvePhotoUrl } from "../lib/photoStorage";

const router = Router();

async function availableWorkspaces(userId: string) {
  const rows = await db
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
      privateOwnerUserId: groupsTable.privateOwnerUserId,
      role: groupMembershipsTable.role,
    })
    .from(groupMembershipsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembershipsTable.groupId))
    .where(eq(groupMembershipsTable.userId, userId));

  return Promise.all(rows.map(async (row) => {
    const isPrivate = Boolean(row.privateOwnerUserId);
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      nameStyle: row.nameStyle,
      icon: row.icon,
      accentColor: row.accentColor,
      photoUrl: isPrivate ? null : await resolvePhotoUrl(row.photoPath).catch(() => null),
      slogan: row.slogan,
      isPrivate,
      kind: (row.kind ?? "family") as "personal" | "family" | "chama" | "club" | "team" | "student_group" | "other",
      role: row.role as "owner" | "admin" | "member",
    };
  }));
}

router.get("/workspaces", async (req, res): Promise<void> => {
  const workspaces = await availableWorkspaces(req.user!.id);
  res.json(GetWorkspacesResponse.parse(workspaces));
});

router.post("/workspaces/select", async (req, res): Promise<void> => {
  const parsed = SelectWorkspaceBody.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(parsed.data?.groupId) || parsed.data.groupId <= 0) {
    res.status(400).json({ error: "Choose a valid budget workspace." });
    return;
  }

  const workspaces = await availableWorkspaces(req.user!.id);
  const workspace = workspaces.find((item) => item.id === parsed.data.groupId);
  if (!workspace) {
    res.status(403).json({ error: "That budget workspace is not available to you." });
    return;
  }

  setActiveWorkspaceCookie(res, workspace.id);
  res.json(SelectWorkspaceResponse.parse(workspace));
});

export default router;