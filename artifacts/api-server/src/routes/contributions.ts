import { Router } from "express";
import { db } from "@workspace/db";
import { contributionsTable, usersTable, membersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateContributionBody,
  GetContributionsQueryParams,
} from "@workspace/api-zod";

const router = Router();

/** Returns a human-readable name from a user record, using email prefix as fallback */
function displayName(u: { firstName?: string | null; email?: string | null } | null | undefined): string {
  if (u?.firstName) return u.firstName;
  const prefix = u?.email?.split("@")[0] ?? "";
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Unknown";
}

router.get("/contributions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = GetContributionsQueryParams.safeParse(req.query);
  const { month, year } = parsed.success ? parsed.data : {};

  const conditions = [];
  if (month !== undefined) conditions.push(eq(contributionsTable.month, Math.round(month)));
  if (year !== undefined) conditions.push(eq(contributionsTable.year, Math.round(year)));

  const contributions = await db
    .select({
      id: contributionsTable.id,
      userId: contributionsTable.userId,
      userFirstName: usersTable.firstName,
      userEmail: usersTable.email,
      amount: contributionsTable.amount,
      month: contributionsTable.month,
      year: contributionsTable.year,
      note: contributionsTable.note,
      createdAt: contributionsTable.createdAt,
    })
    .from(contributionsTable)
    .leftJoin(usersTable, eq(contributionsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(contributionsTable.year, contributionsTable.month, contributionsTable.createdAt);

  res.json(
    contributions.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: displayName({ firstName: c.userFirstName, email: c.userEmail }),
      amount: c.amount,
      month: c.month,
      year: c.year,
      note: c.note,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  );
});

router.post("/contributions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateContributionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, month, year, note, forUserId } = parsed.data;

  // If forUserId is provided, verify that user is a household member
  let targetUserId = req.user.id;
  if (forUserId && forUserId !== req.user.id) {
    const targetUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, forUserId),
    });
    if (!targetUser) {
      res.status(400).json({ error: "User not found" });
      return;
    }
    targetUserId = forUserId;
  }

  const [contribution] = await db
    .insert(contributionsTable)
    .values({
      userId: targetUserId,
      amount,
      month: Math.round(month),
      year: Math.round(year),
      note: note ?? null,
    })
    .returning();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, targetUserId),
  });

  res.status(201).json({
    ...contribution,
    userName: displayName(user),
    createdAt: contribution.createdAt instanceof Date ? contribution.createdAt.toISOString() : contribution.createdAt,
  });
});

router.delete("/contributions/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Only registered household members may delete contributions
  const caller = await db.query.membersTable.findFirst({
    where: eq(membersTable.userId, req.user.id),
  });
  if (!caller) {
    res.status(403).json({ error: "Forbidden: not a household member" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(contributionsTable)
    .where(eq(contributionsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Contribution not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
