import { Router } from "express";
import { db } from "@workspace/db";
import { contributionsTable, usersTable, groupMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateContributionBody,
  GetContributionsQueryParams,
  UpdateContributionBody,
} from "@workspace/api-zod";
import {
  getActiveGroupId,
  requireGroupManager,
  requireMemberSelfAttribution,
  requireSharedTransactionEligibility,
} from "../lib/activeGroup";

const router = Router();

/** Returns a human-readable name from a user record, using email prefix as fallback */
function displayName(u: { firstName?: string | null; email?: string | null } | null | undefined): string {
  if (u?.firstName) return u.firstName;
  const prefix = u?.email?.split("@")[0] ?? "";
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Unknown";
}

function isToday(value: Date | string): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value instanceof Date ? value : new Date(value)) === formatter.format(new Date());
}

router.get("/contributions", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const parsed = GetContributionsQueryParams.safeParse(req.query);
  const { month, year } = parsed.success ? parsed.data : {};

  const conditions: ReturnType<typeof eq>[] = [eq(contributionsTable.groupId, groupId)];
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
    .where(and(...conditions))
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

router.post("/contributions", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireSharedTransactionEligibility(req, res)) return;

  const parsed = CreateContributionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, month, year, note, forUserId } = parsed.data;

  // If forUserId is provided, verify that user is a group member
  let targetUserId = req.user!.id;
  if (forUserId && forUserId !== req.user!.id) {
    const [membership] = await db
      .select({ userId: groupMembershipsTable.userId })
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, forUserId)))
      .limit(1);
    if (!membership) {
      res.status(400).json({ error: "User not found or not a member of this group" });
      return;
    }
    targetUserId = forUserId;
  }
  if (!requireMemberSelfAttribution(req, res, [targetUserId])) return;

  const [contribution] = await db
    .insert(contributionsTable)
    .values({
      groupId,
      userId: targetUserId,
      amount,
      month,
      year,
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

router.patch("/contributions/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!await requireSharedTransactionEligibility(req, res)) return;

  const id = Number(req.params.id);
  const parsed = UpdateContributionBody.safeParse(req.body);
  if (!Number.isFinite(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [existing] = await db
    .select({
      id: contributionsTable.id,
      userId: contributionsTable.userId,
      createdAt: contributionsTable.createdAt,
    })
    .from(contributionsTable)
    .where(and(eq(contributionsTable.id, id), eq(contributionsTable.groupId, groupId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Contribution not found" });
    return;
  }

  const { amount, month, year, note, forUserId } = parsed.data;
  let targetUserId = existing.userId;
  if (forUserId) {
    const [membership] = await db
      .select({ userId: groupMembershipsTable.userId })
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, forUserId)))
      .limit(1);
    if (!membership) {
      res.status(400).json({ error: "User not found or not a member of this group" });
      return;
    }
    targetUserId = forUserId;
  }

  const participatingMember = req.group?.role === "member";
  if (participatingMember && (existing.userId !== req.user!.id || !isToday(existing.createdAt))) {
    res.status(403).json({
      error: "Members can edit only their own contributions recorded today. Ask an admin to correct an older record.",
    });
    return;
  }
  if (!requireMemberSelfAttribution(req, res, [targetUserId])) return;

  const [updated] = await db
    .update(contributionsTable)
    .set({
      userId: targetUserId,
      amount,
      month: Math.round(month),
      year: Math.round(year),
      note: note ?? null,
    })
    .where(and(eq(contributionsTable.id, id), eq(contributionsTable.groupId, groupId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Contribution not found" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, updated.userId),
  });
  res.json({
    ...updated,
    userName: displayName(user),
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
  });
});

router.delete("/contributions/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(contributionsTable)
    .where(and(eq(contributionsTable.id, id), eq(contributionsTable.groupId, groupId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Contribution not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
