import {
  GetWorkspacesResponse,
  SelectWorkspaceBody,
  SelectWorkspaceResponse,
} from "@workspace/api-zod";
import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { setActiveWorkspaceCookie } from "../lib/activeGroup";
import { logger } from "../lib/logger";
import { resolvePhotoUrl } from "../lib/photoStorage";
import { ensurePersonalWorkspace } from "../lib/personalWorkspace";

const router = Router();

// `icon`, `accent_color`, `name_style`, `kind` and `role` are free-text
// columns, so the database can hold a value the response schema does not
// list — an older default, or one written by a newer client. A single such
// row must not make `GetWorkspacesResponse.parse` throw and hide *every*
// workspace, so each field is snapped to a known value first.
const VALID_ICONS = new Set(["users", "home", "heart", "briefcase", "award", "star"]);
const VALID_ACCENTS = new Set([
  "#011C4E", "#003383", "#087F8C", "#08B7B0", "#209E45", "#C98C00",
  "#0F766E", "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
]);
const VALID_NAME_STYLES = new Set(["plain", "italic", "bold", "serif"]);
const VALID_KINDS = new Set([
  "personal", "family", "chama", "church", "club", "team", "student_group", "other",
]);
const VALID_ROLES = new Set(["owner", "admin", "member", "viewer"]);

function oneOf(set: Set<string>, value: unknown, fallback: string): string {
  return typeof value === "string" && set.has(value) ? value : fallback;
}

type WorkspaceRow = {
  id: number;
  name: string;
  emoji: string | null;
  nameStyle: string;
  icon: string;
  accentColor: string;
  slogan: string | null;
  kind: string | null;
  privateOwnerUserId: string | null;
  role: string;
};

/**
 * Every enum-ish field snapped to a value the response schema accepts, plus
 * emoji/slogan length-clamped. Pure — the async photo lookup is layered on by
 * the caller.
 */
export function toWorkspaceListItem(row: WorkspaceRow, photoUrl: string | null) {
  const isPrivate = Boolean(row.privateOwnerUserId);
  return {
    id: row.id,
    name: row.name,
    emoji: typeof row.emoji === "string" && row.emoji.length <= 16 ? row.emoji : null,
    nameStyle: oneOf(VALID_NAME_STYLES, row.nameStyle, "plain") as "plain" | "italic" | "bold" | "serif",
    icon: oneOf(VALID_ICONS, row.icon, "users") as "users" | "home" | "heart" | "briefcase" | "award" | "star",
    accentColor: oneOf(VALID_ACCENTS, row.accentColor, "#0F766E") as
      | "#011C4E" | "#003383" | "#087F8C" | "#08B7B0" | "#209E45" | "#C98C00"
      | "#0F766E" | "#2563EB" | "#7C3AED" | "#DB2777" | "#D97706" | "#059669",
    photoUrl: isPrivate ? null : photoUrl,
    slogan: typeof row.slogan === "string" && row.slogan.length <= 120 ? row.slogan : null,
    isPrivate,
    kind: oneOf(VALID_KINDS, row.kind, "family") as
      | "personal" | "family" | "chama" | "church" | "club" | "team" | "student_group" | "other",
    role: oneOf(VALID_ROLES, row.role, "member") as "owner" | "admin" | "member" | "viewer",
  };
}

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
    const photoUrl = Boolean(row.privateOwnerUserId)
      ? null
      : await resolvePhotoUrl(row.photoPath).catch(() => null);
    return toWorkspaceListItem(row, photoUrl);
  }));
}

router.get("/workspaces", async (req, res): Promise<void> => {
  const workspaces = await availableWorkspaces(req.user!.id);
  const parsed = GetWorkspacesResponse.safeParse(workspaces);
  if (!parsed.success) {
    // Last resort: never let a schema mismatch hide someone's whole list.
    logger.error({ err: parsed.error, userId: req.user!.id }, "Workspaces response failed schema validation");
    res.json(workspaces);
    return;
  }
  res.json(parsed.data);
});

/**
 * Create the person's own budget, because they asked for it.
 *
 * Idempotent by construction: ensurePersonalWorkspace is the same function the
 * middleware used to call on every request, and the unique privateOwnerUserId
 * constraint means asking twice returns the one that exists rather than making
 * a second. So somebody who taps the button twice, or who already has one from
 * before this change, is answered rather than refused.
 */
router.post("/workspaces/personal", async (req, res): Promise<void> => {
  const workspaceId = await ensurePersonalWorkspace(req.user!.id);
  // Opened straight away: somebody who just asked for their own budget means
  // to use it, and making them find it afterwards is a step for nothing.
  setActiveWorkspaceCookie(res, workspaceId);
  res.status(201).json({ id: workspaceId });
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