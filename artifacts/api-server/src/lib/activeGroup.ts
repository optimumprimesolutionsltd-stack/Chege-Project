import type { Request, Response } from "express";
import { memberMayUseSharedBudgets } from "./subscription-catalog";
import { readOnlyMessage } from "./membership-limits";

// Version this browser-session selection independently from the retired
// persistent workspace cookie.
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_v2";
export const LEGACY_ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export function setActiveWorkspaceCookie(res: Response, groupId: number): void {
  // The cookie only remembers a preference. Every protected request verifies
  // membership again before using it as the active workspace. It deliberately
  // lasts for this browser session only. A later sign-in deliberately begins
  // with no selection, which also works for people who only have shared
  // workspaces.
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
    res.status(403).json({ error: "Select a budget workspace first." });
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

/**
 * A workspace owner can start recording immediately. A shared budget does not
 * become a different kind of ledger while it has only one member.
 */
export async function canRecordSharedTransactions(
  _groupId: number,
  _isPrivate: boolean,
): Promise<boolean> {
  return true;
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

  // A lapsed member goes read-only in a Shared budget rather than being
  // removed from it. They keep seeing everything and stop being able to record
  // anything, which is a status the group can see and act on. Removing them
  // would take a chama's record of who contributed what with it.
  if (!req.group.isPrivate && req.user?.id) {
    if (!(await memberMayUseSharedBudgets(req.user.id))) {
      res.status(402).json({ error: readOnlyMessage() });
      return false;
    }
  }

  return canRecordSharedTransactions(req.group.id, req.group.isPrivate);
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