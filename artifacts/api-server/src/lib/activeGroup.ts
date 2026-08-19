import type { Request, Response } from "express";

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

export function requireGroupManager(req: Request, res: Response): boolean {
  if (!req.group || req.group.role === "member") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  return true;
}