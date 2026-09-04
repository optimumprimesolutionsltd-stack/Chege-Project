import type { NextFunction, Request, Response } from "express";
import {
  budgetCategoriesTable,
  contributionsTable,
  db,
  digestSendsTable,
  expenseIncomeSplitsTable,
  expensesTable,
  groupMembershipsTable,
  groupsTable,
  incomeSourcesTable,
  jointAccountDepositSplitsTable,
  jointAccountTxTable,
  membersTable,
  savingsGoalContributionsTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  ACTIVE_WORKSPACE_COOKIE,
  clearActiveWorkspaceCookie,
  LEGACY_ACTIVE_WORKSPACE_COOKIE,
} from "../lib/activeGroup";
import { ensurePersonalWorkspace } from "../lib/personalWorkspace";

const LEGACY_GROUP_KEY = "initial-shared-budget";
const LEGACY_GROUP_NAME = "Shared budget";

/**
 * Sessions are normally created immediately after the auth callback persists a
 * user. Re-checking the record here makes protected routes robust if a session
 * arrives during a callback race or after a user row was removed externally.
 * The insert is intentionally minimal: profile details remain owned by the
 * auth upsert path.
 */
async function ensureAuthenticatedUser(userId: string): Promise<void> {
  // Use a minimal SQL insert rather than Drizzle's table insert here. This
  // recovery path must remain usable while additive user columns are being
  // migrated in production.
  await db
    .execute(sql`INSERT INTO users (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`);
}

/**
 * Adopts the historic implicit ledger before protected routes.
 *
 * The app historically had one implicit shared ledger. On the first protected
 * request after the additive schema change, that ledger is adopted into one
 * named group in a transaction. This is data-only and idempotent: it never
 * alters schema at runtime, never deletes records, and only fills null group
 * ownership columns.
 */
async function adoptLegacyGroup(userId: string) {
  return db.transaction(async (tx) => {
    // Serialise the once-only adoption path. This prevents two first requests
    // from creating competing memberships while the old ledger has no group.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(4815162342)`);

    const [existingMembership] = await tx
      .select({
        groupId: groupMembershipsTable.groupId,
        role: groupMembershipsTable.role,
      })
      .from(groupMembershipsTable)
      .where(eq(groupMembershipsTable.userId, userId))
      .limit(1);
    if (existingMembership) return existingMembership;

    const [legacyMember] = await tx
      .select({ userId: membersTable.userId })
      .from(membersTable)
      .where(eq(membersTable.userId, userId))
      .limit(1);

    // Adoption is only for an actual pre-workspace ledger member. In an empty
    // database, a newly authenticated user intentionally has no workspace
    // until they create one or accept an invitation.
    if (!legacyMember) return undefined;

    const [groupCount] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(groupsTable);

    // Adoption is a one-time migration. Once any group exists, membership is
    // the only source of authorization. In particular, an old legacy member
    // who was removed must never be re-created from the legacy members table.
    if (Number(groupCount.count) > 0) return undefined;

    await tx
      .insert(groupsTable)
      .values({
        name: LEGACY_GROUP_NAME,
        legacyKey: LEGACY_GROUP_KEY,
        createdByUserId: userId,
      })
      .onConflictDoNothing();

    const [group] = await tx
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.legacyKey, LEGACY_GROUP_KEY))
      .limit(1);
    if (!group) throw new Error("Unable to establish the shared budget group.");

    await Promise.all([
      tx.update(membersTable).set({ groupId: group.id }).where(isNull(membersTable.groupId)),
      tx.update(incomeSourcesTable).set({ groupId: group.id }).where(isNull(incomeSourcesTable.groupId)),
      tx.update(budgetCategoriesTable).set({ groupId: group.id }).where(isNull(budgetCategoriesTable.groupId)),
      tx.update(expensesTable).set({ groupId: group.id }).where(isNull(expensesTable.groupId)),
      tx.update(expenseIncomeSplitsTable).set({ groupId: group.id }).where(isNull(expenseIncomeSplitsTable.groupId)),
      tx.update(contributionsTable).set({ groupId: group.id }).where(isNull(contributionsTable.groupId)),
      tx.update(jointAccountTxTable).set({ groupId: group.id }).where(isNull(jointAccountTxTable.groupId)),
      tx.update(jointAccountDepositSplitsTable).set({ groupId: group.id }).where(isNull(jointAccountDepositSplitsTable.groupId)),
      tx.update(digestSendsTable).set({ groupId: group.id }).where(isNull(digestSendsTable.groupId)),
      tx.update(savingsGoalsTable).set({ groupId: group.id }).where(isNull(savingsGoalsTable.groupId)),
      tx.update(savingsGoalContributionsTable).set({ groupId: group.id }).where(isNull(savingsGoalContributionsTable.groupId)),
    ]);

    const legacyMembers = await tx
      .select({
        userId: membersTable.userId,
        addedByUserId: membersTable.addedByUserId,
        addedAt: membersTable.addedAt,
        monthlyTarget: membersTable.monthlyTarget,
      })
      .from(membersTable)
      .innerJoin(usersTable, eq(usersTable.id, membersTable.userId))
      .where(eq(membersTable.groupId, group.id))
      .orderBy(asc(membersTable.addedAt));

    if (legacyMembers.length === 0) {
      throw new Error("The shared budget group has no valid members.");
    }

    await tx
      .insert(groupMembershipsTable)
      .values(
        legacyMembers.map((member, index) => ({
          groupId: group.id,
          userId: member.userId,
          // The current two-person experience allowed both people to manage
          // access. Preserve that capability while making the owner/admin
          // distinction explicit for future invitations.
          role: index === 0 ? "owner" : "admin",
          addedByUserId: member.addedByUserId,
          addedAt: member.addedAt,
          monthlyTarget: member.monthlyTarget,
        })),
      )
      .onConflictDoNothing();

    const [membership] = await tx
      .select({
        groupId: groupMembershipsTable.groupId,
        role: groupMembershipsTable.role,
      })
      .from(groupMembershipsTable)
      .where(
        and(
          eq(groupMembershipsTable.groupId, group.id),
          eq(groupMembershipsTable.userId, userId),
        ),
      )
      .limit(1);
    return membership;
  });
}

async function getWorkspaceMembership(userId: string, groupId: number) {
  const [membership] = await db
    .select({
      groupId: groupMembershipsTable.groupId,
      role: groupMembershipsTable.role,
      isPrivate: groupsTable.privateOwnerUserId,
    })
    .from(groupMembershipsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembershipsTable.groupId))
    .where(
      and(
        eq(groupMembershipsTable.userId, userId),
        eq(groupMembershipsTable.groupId, groupId),
      ),
    )
    .limit(1);
  return membership;
}

export async function requireMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const userId = req.user.id;
    await ensureAuthenticatedUser(userId);
    // Preserve the one-time legacy adoption order: adopting after creating a
    // Personal membership would make an established legacy ledger unreachable.
    await adoptLegacyGroup(userId);
    // Workspace discovery and every Shared-budget mutation pass through this
    // middleware, so no signed-in person can create a group-only account.
    await ensurePersonalWorkspace(userId);
    const headerWorkspaceId = typeof req.get === "function"
      ? req.get("x-jamvi-workspace")
      : undefined;
    const cookieWorkspaceId = req.cookies?.[ACTIVE_WORKSPACE_COOKIE];
    if (typeof req.cookies?.[LEGACY_ACTIVE_WORKSPACE_COOKIE] === "string") {
      res.clearCookie(LEGACY_ACTIVE_WORKSPACE_COOKIE, { path: "/" });
    }
    const rawRequestedWorkspaceId = headerWorkspaceId ?? cookieWorkspaceId;
    const requestedWorkspaceId = typeof rawRequestedWorkspaceId === "string"
      ? Number(rawRequestedWorkspaceId)
      : NaN;
    const selectedMembership = Number.isSafeInteger(requestedWorkspaceId) && requestedWorkspaceId > 0
      ? await getWorkspaceMembership(userId, requestedWorkspaceId)
      : undefined;

    if (selectedMembership) {
      req.group = {
        id: selectedMembership.groupId,
        role: selectedMembership.role as "owner" | "admin" | "member",
        isPrivate: Boolean(selectedMembership.isPrivate),
      };
    } else {
      if (!headerWorkspaceId && typeof cookieWorkspaceId === "string") {
        clearActiveWorkspaceCookie(res);
      }
      // Never point an unselected or stale request at a different workspace.
      // Discovery and creation routes can still run; financial routes require
      // getActiveGroupId and reject the request until one is selected.
      delete req.group;
    }

    next();
  } catch (error) {
    next(error);
  }
}