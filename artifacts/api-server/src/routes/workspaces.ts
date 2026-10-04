import {
  GetWorkspacesResponse,
  SelectWorkspaceBody,
  SelectWorkspaceResponse,
  type WorkspaceAccentColor,
  type WorkspaceIcon,
} from "@workspace/api-zod";
import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type Response } from "express";
import { clearActiveWorkspaceCookie, setActiveWorkspaceCookie } from "../lib/activeGroup";
import { refuseStartingGroup } from "../lib/group-start";
import { logger } from "../lib/logger";
import { resolvePhotoUrl } from "../lib/photoStorage";
import { ensurePersonalWorkspace } from "../lib/personalWorkspace";
import {
  isSharedGroupKind,
  makeGroupPersonal,
  makePersonalBudgetShared,
  personalBudgetStatus,
  removeEmptyPersonalBudget,
  WorkspaceConversionError,
} from "../lib/workspace-conversion";

const router = Router();

// `icon`, `accent_color`, `name_style`, `kind` and `role` are free-text
// columns, so the database can hold a value the response schema does not
// list — an older default, or one written by a newer client. A single such
// row must not make `GetWorkspacesResponse.parse` throw and hide *every*
// workspace, so each field is snapped to a known value first.
const VALID_ICONS = new Set([
  "users", "home", "heart", "briefcase", "award", "star",
  "user", "shopping-bag", "truck", "book-open", "coffee", "gift", "shield", "map-pin", "trending-up", "tool",
]);
const VALID_ACCENTS = new Set([
  "#011C4E", "#003383", "#087F8C", "#08B7B0", "#209E45", "#C98C00",
  "#0F766E", "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
  "#DC2626", "#4F46E5", "#65A30D", "#C026D3", "#0284C7", "#475569",
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
    icon: oneOf(VALID_ICONS, row.icon, "users") as WorkspaceIcon,
    accentColor: oneOf(VALID_ACCENTS, row.accentColor, "#0F766E") as WorkspaceAccentColor,
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

/**
 * Whether the person has a Personal budget and whether anything was ever
 * recorded in it, so the apps can offer "Remove my unused Personal budget"
 * and word the swap confirmation honestly.
 */
router.get("/workspaces/personal/status", async (req, res): Promise<void> => {
  const status = await personalBudgetStatus(req.user!.id);
  res.json({ exists: status.exists, empty: status.empty, id: status.id });
});

/** Answers a refusal from lib/workspace-conversion with its own sentence. */
function sendConversionError(res: Response, error: unknown): boolean {
  if (!(error instanceof WorkspaceConversionError)) return false;
  res.status(error.status).json({ error: error.message });
  return true;
}

/**
 * Removes the person's Personal budget, only while it is unused (see
 * lib/workspace-conversion.ts). A new one is made only when they ask, through
 * POST /workspaces/personal. DELETE /group still refuses a Personal budget:
 * that path erases records, this one never has any to erase.
 */
router.delete("/workspaces/personal", async (req, res): Promise<void> => {
  try {
    const { removedId } = await removeEmptyPersonalBudget(req.user!.id);
    if (req.group?.id === removedId) clearActiveWorkspaceCookie(res);
    res.json({ removed: true, id: removedId });
  } catch (error) {
    if (!sendConversionError(res, error)) throw error;
  }
});

/** Personal budget -> Shared group, in place. Same rules as starting a group. */
router.post("/workspaces/personal/make-shared", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const kind: unknown = req.body?.kind;
  if (!isSharedGroupKind(kind)) {
    res.status(400).json({ error: "Choose what kind of group this is." });
    return;
  }
  // Only while the person's own trial or subscription is active, exactly as
  // POST /groups (lib/group-start).
  const refusal = await refuseStartingGroup(req.user!.id);
  if (refusal) {
    res.status(402).json({ error: refusal });
    return;
  }
  try {
    const group = await makePersonalBudgetShared(req.user!.id, { name, kind });
    setActiveWorkspaceCookie(res, group.id);
    res.json(group);
  } catch (error) {
    if (!sendConversionError(res, error)) throw error;
  }
});

/**
 * Shared group -> the caller's Personal budget (the swap). Owner only, and
 * only while nobody else - not even a viewer - is in it.
 */
router.post("/workspaces/:id/make-personal", async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    res.status(400).json({ error: "Choose a valid group." });
    return;
  }
  try {
    const result = await makeGroupPersonal(req.user!.id, groupId);
    setActiveWorkspaceCookie(res, result.id);
    res.json(result);
  } catch (error) {
    if (!sendConversionError(res, error)) throw error;
  }
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