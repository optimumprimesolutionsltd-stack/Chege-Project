import type { Request, Response } from "express";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export function setActiveWorkspaceCookie(res: Response, groupId: number): void {
  // The cookie only remembers a preference. Every protected request verifies
  // membership again before using it as the active workspace.
  res.cookie(ACTIVE_WORKSPACE_COOKIE, String(groupId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
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

/**
 * A participating member can only record money under their own membership.
 * Managers may keep using the multi-person and Joint-bank attribution flows.
 */
export function requireMemberSelfAttribution(
  req: Request,
  res: Response,
  userIds: Array<string | null | undefined>,
): boolean {
  if (isGroupManager(req)) return true;

  if (
    !req.user?.id ||
    userIds.length === 0 ||
    userIds.some((userId) => userId !== req.user!.id)
  ) {
    res.status(403).json({
      error: "Members can only record money in their own name. Ask an admin to record shared-bank activity.",
    });
    return false;
  }

  return true;
}