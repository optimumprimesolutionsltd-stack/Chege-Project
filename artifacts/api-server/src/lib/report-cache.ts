import type { NextFunction, Request, Response } from "express";

/**
 * Reports remembered until something in their budget changes.
 *
 * Render's logs (9 Oct 2026) showed Reports at 1-4 s a request, five at once,
 * nearly all answering 304: nothing had changed, but the database - a tenth of
 * a CPU - worked every figure out again to find that out. So a /dashboard
 * answer is kept per budget, person and address, and thrown away the moment
 * anything in that budget is saved:
 * - every non-GET request through the API counts as a change to its budget,
 *   when it starts (a read during a save never keeps a half-saved answer) and
 *   when it finishes. A background import save calls the same routes, so its
 *   entries clear it too (lib/import-save-jobs loopbackCall);
 * - a request with no budget clears everyone's, to be safe;
 * - nothing is kept longer than a minute, for anything that changes figures
 *   without a request (the date turning, a startup fix).
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

type Kept = { at: number; version: number; body: unknown };

const versions = new Map<number, number>();
const kept = new Map<string, Kept>();

const versionOf = (groupId: number) => versions.get(groupId) ?? 0;

/** Something in this budget changed: its remembered reports no longer count. */
export function reportsChanged(groupId: number | null | undefined): void {
  if (groupId == null) {
    kept.clear();
    return;
  }
  versions.set(groupId, versionOf(groupId) + 1);
}

/** For tests. */
export function forgetAllReports(): void {
  kept.clear();
  versions.clear();
}

const remembered = (path: string) => path.startsWith("/dashboard/") && !path.endsWith(".pdf");

export function reportCache(req: Request, res: Response, next: NextFunction): void {
  const groupId = req.group?.id ?? null;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    reportsChanged(groupId);
    res.on("finish", () => reportsChanged(groupId));
    next();
    return;
  }
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (req.method !== "GET" || groupId === null || !userId || !remembered(req.path)) {
    next();
    return;
  }
  const key = `${groupId}|${userId}|${req.group!.role}|${req.originalUrl}`;
  const version = versionOf(groupId);
  const hit = kept.get(key);
  if (hit && hit.version === version && Date.now() - hit.at < TTL_MS) {
    res.setHeader("X-Report-Cache", "hit");
    res.json(hit.body);
    return;
  }
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only a whole, good answer, and only if nothing was saved while it was worked out.
    if (res.statusCode === 200 && versionOf(groupId) === version) {
      kept.delete(key);
      kept.set(key, { at: Date.now(), version, body });
      while (kept.size > MAX_ENTRIES) kept.delete(kept.keys().next().value as string);
    }
    return send(body);
  };
  next();
}
