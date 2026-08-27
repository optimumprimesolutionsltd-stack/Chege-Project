import type { Request, Response } from "express";
import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";

// Version this preference so existing seven-day cookies from before My Budget
// became the web default cannot keep reopening a shared workspace.
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_v2";
export const LEGACY_ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export function setActiveWorkspaceCookie(res: Response, groupId: number): void {
  // The cookie only remembers a preference. Every protected request verifies
  // membership again before using it as the active workspace. It deliberately
  // lasts for this browser session only, so opening Jamvi in a later web
  // session starts from the user's private My Budget workspace.
  res.cookie(ACTIVE_WORKSPACE_COOKIE, String(groupId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export function clearActiveWorkspaceCookie(res: Response): void {
  res.clearCookie(ACTIVE_WORKSPACE_COOKIE, { path: "/" });
}

/**
 * Protected routes must derive ownership from middleware, never request input.
 * Returning a generic access error avoids revealing whether another group or
 * record exists.
 */
export function getActiveGroupId(req: Request, res: Response): number | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (!req.group) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return req.group.id;
}

export function isGroupManager(req: Request): boolean {
  return req.group?.role === "owner" || req.group?.role === "admin";
}

export function requireGroupManager(req: Request, res: Response): boolean {
  if (!isGroupManager(req)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  return true;
}

export function requireSharedGroupManager(req: Request, res: Response): boolean {
  if (req.group?.isPrivate) {
    res.status(403).json({
      error: "A private budget is only for its owner. Switch to a shared group to manage members.",
    });
    return false;
  }

  return requireGroupManager(req, res);
}

export const SHARED_TRANSACTION_MEMBER_REQUIREMENT =
  "Invite at least one more member before recording shared expenses or contributions.";

/**
 * Private budgets are intentionally usable by one owner. Legacy groups keep
 * their existing financial workflow, while newly created shared groups need a
 * second confirmed membership before they can record shared money activity.
 */
export async function canRecordSharedTransactions(
  groupId: number,
  isPrivate: boolean,
): Promise<boolean> {
  if (isPrivate) return true;

  const [group] = await db
    .select({
      legacyKey: groupsTable.legacyKey,
      membershipCount: count(groupMembershipsTable.userId),
    })
    .from(groupsTable)
    .leftJoin(groupMembershipsTable, eq(groupMembershipsTable.groupId, groupsTable.id))
    .where(eq(groupsTable.id, groupId))
    .groupBy(groupsTable.id, groupsTable.legacyKey)
    .limit(1);

  return Boolean(group?.legacyKey) || Number(group?.membershipCount ?? 0) >= 2;
}

export async function requireSharedTransactionEligibility(
  req: Request,
  res: Response,
): Promise<boolean> {
  if (!req.group) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  // requireMember always supplies this field for real HTTP requests. Keeping
  // older internal route callers compatible avoids treating an incomplete
  // context object as a new one-member shared group.
  if (typeof (req.group as { isPrivate?: boolean }).isPrivate !== "boolean") {
    return true;
  }

  if (await canRecordSharedTransactions(req.group.id, req.group.isPrivate)) {
    return true;
  }

  res.status(409).json({ error: SHARED_TRANSACTION_MEMBER_REQUIREMENT });
  return false;
}

/**
 * A participating member can only record money under their own membership.
 * Managers may keep using the multi-person and Joint-bank attribution flows.
 */
export function requireMemberSelfAttribution(
  req: Request,
  res: Response,
  userIds: Array<string | null | undefined>,
): boolean {
  // Managers may attribute shared-group activity to the joint account or
  // another member. A Personal budget has no joint account: even its owner
  // must record money only in their own name.
  if (!req.group?.isPrivate && isGroupManager(req)) return true;

  if (
    !req.user?.id ||
    userIds.length === 0 ||
    userIds.some((userId) => userId !== req.user!.id)
  ) {
    res.status(403).json({
      error: req.group?.isPrivate
        ? "Personal account activity must be recorded in your own name."
        : "Members can only record money in their own name. Ask an admin to record shared-bank activity.",
    });
    return false;
  }

  return true;
}