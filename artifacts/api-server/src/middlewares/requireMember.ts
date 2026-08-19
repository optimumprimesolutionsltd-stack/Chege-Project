import type { NextFunction, Request, Response } from "express";
import { db, membersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const MAX_MEMBERS = 2;

/**
 * Allows active household members through protected routes.
 *
 * Only an empty household auto-enrolls its first signed-in member. Every
 * subsequent member must be added explicitly by an active household member,
 * so removing someone cannot be undone by their next sign-in.
 */
export async function requireMember(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    next();
    return;
  }

  const userId = req.user.id;
  const existing = await db.query.membersTable.findFirst({
    where: eq(membersTable.userId, userId),
  });

  if (existing) {
    next();
    return;
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(membersTable);

  if (Number(countRow.count) === 0) {
    await db
      .insert(membersTable)
      .values({ userId, addedByUserId: null })
      .onConflictDoNothing();
    next();
    return;
  }

  res.status(403).json({
    error: "You are not a member of this household.",
    yourUserId: userId,
    hint: "Ask an existing household member to add you.",
  });
}