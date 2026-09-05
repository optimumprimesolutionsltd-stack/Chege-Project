import type { NextFunction, Request, Response } from "express";

/**
 * A viewer sees everything and records nothing.
 *
 * Enforced here, once, rather than route by route. Every financial route sits
 * behind this middleware, so a write path added tomorrow is refused for
 * viewers without anybody remembering to guard it. The alternative - a check
 * inside each handler - is a list that is one omission away from letting a
 * viewer record money in somebody else's chama, and the omission would not
 * look like a bug in review.
 *
 * Scoped to the active workspace, which is what makes it safe to be this
 * broad: the role comes from the membership of the workspace being acted on,
 * so somebody who views a chama still owns their own Personal budget and
 * writes to it freely the moment they switch.
 */

/**
 * Requests a viewer may still make, despite changing something.
 *
 * Each is either about the person rather than the budget, or is how a viewer
 * gets anywhere at all. Matched on the path prefix after /api.
 */
const ALLOWED_FOR_VIEWERS = [
  // Switching workspace. Without this a viewer cannot leave the budget they
  // are viewing, including back to their own.
  "/workspaces/select",
  // Paying for their own subscription. Billing belongs to the person, not to
  // the budget they happen to be looking at.
  "/payments",
  // Their own profile photo.
  "/photo-storage",
  // Asking a question. It reads and answers; it changes no records.
  "/ai/ask",
];

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isViewer(req: Request): boolean {
  return req.group?.role === "viewer";
}

export function requireWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (READ_ONLY_METHODS.has(req.method) || !isViewer(req)) {
    next();
    return;
  }

  if (ALLOWED_FOR_VIEWERS.some((allowed) => req.path === allowed || req.path.startsWith(`${allowed}/`))) {
    next();
    return;
  }

  // 403 rather than 402: this is not about money. Telling a viewer to
  // subscribe would be wrong twice over - viewing is free, and paying would
  // not give them write access to somebody else's budget either.
  res.status(403).json({
    error: "You have view-only access to this budget. Ask an admin if you need to record anything.",
  });
}
