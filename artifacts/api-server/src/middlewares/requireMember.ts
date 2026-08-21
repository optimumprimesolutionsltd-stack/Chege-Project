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

const LEGACY_GROUP_KEY = "initial-shared-budget";
const LEGACY_GROUP_NAME = "Shared budget";

/**
 * Resolves a signed-in person's private group before protected routes.
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

    if (!legacyMember) {
      await tx
        .insert(membersTable)
        .values({ userId, groupId: group.id, addedByUserId: null })
        .onConflictDoNothing();
    }

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
    const membership = await adoptLegacyGroup(userId);
    if (membership) {
      req.group = {
        id: membership.groupId,
        role: membership.role as "owner" | "admin" | "member",
      };
      next();
      return;
    }

    res.status(403).json({
      error: "You are not a member of this shared group.",
      hint: "Ask a current group member to add you.",
    });
  } catch (error) {
    next(error);
  }
}