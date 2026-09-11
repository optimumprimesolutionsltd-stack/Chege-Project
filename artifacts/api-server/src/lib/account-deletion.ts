/**
 * Deleting a Jamvi account.
 *
 * A grace period, not an instant erasure: requesting deletion ends the
 * session right away, but the actual erasure waits ACCOUNT_DELETION_GRACE_DAYS.
 * Signing back in before then cancels the request — the same mistake that
 * ends a session by accident should not also end an account.
 *
 * Once the grace period runs out, `eraseAccount` deletes what belongs only to
 * this person — their Personal budget, and any Shared group where they were
 * the only one left — and removes their membership from every other group,
 * exactly as "Leave group" already does. It never leaves a Shared group
 * ownerless: if the departing owner is not the last member, the next most
 * senior person is promoted first.
 *
 * The account row itself is never dropped, only scrubbed. Payments and
 * subscription history reference this id, and deleting an account does not
 * erase the record that it was billed — the row loses every field that
 * identifies the person and stays only as that anchor.
 */

import { and, eq, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  bankAccountsTable,
  budgetCategoriesTable,
  contributionsTable,
  db,
  digestSendsTable,
  expensesTable,
  GROUP_ROLE,
  groupContributorsTable,
  groupMembershipsTable,
  groupPayoutsTable,
  groupsTable,
  incomeSourcesTable,
  jointAccountTxTable,
  membersTable,
  onboardingPreferencesTable,
  passwordResetTokensTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";

export type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ACCOUNT_DELETION_GRACE_DAYS = 14;
const DAY_MS = 86_400_000;

export function scheduledDeletionDate(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
}

/** Starts the grace period. Calling this again while one is already running
 *  restarts the clock from now, which only matters if a client retries. */
export async function requestAccountDeletion(
  userId: string,
  now: Date = new Date(),
): Promise<Date> {
  await db
    .update(usersTable)
    .set({ deletionRequestedAt: now })
    .where(eq(usersTable.id, userId));
  return scheduledDeletionDate(now);
}

/**
 * Cancels a pending deletion, called from every sign-in path right where a
 * fresh trial is granted. A no-op — one cheap UPDATE matching nothing — for
 * the overwhelming majority of sign-ins that never asked to delete anything,
 * so it is safe to call unconditionally rather than checking first.
 */
export async function cancelPendingAccountDeletion(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ deletionRequestedAt: null })
    .where(and(eq(usersTable.id, userId), isNull(usersTable.deletedAt)));
}

/** Every account whose grace period has run out and has not been erased yet. */
export async function accountsDueForErasure(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      isNotNull(usersTable.deletionRequestedAt),
      isNull(usersTable.deletedAt),
      lte(usersTable.deletionRequestedAt, cutoff),
    ));
  return rows.map((row) => row.id);
}

/**
 * Deletes everything that belongs to one group: a Personal budget being
 * closed, a Shared group whose last member is leaving, or an owner deleting
 * a Shared group outright (see routes/group.ts's DELETE /group — the same
 * function, because "erase this group's data" means the same thing either
 * way). Order matters — most of these tables restrict deleting a group that
 * still has rows in them, so children go first. Ending on the group row
 * itself, which cascades memberships, invitations, invite links and legacy
 * per-group subscriptions.
 */
export async function eraseGroupData(tx: DbOrTransaction, groupId: number): Promise<void> {
  // Cascades expense_category_allocations, expense_income_splits, and any
  // joint_account_transactions row created for a split-funded expense.
  await tx.delete(expensesTable).where(eq(expensesTable.groupId, groupId));
  // Cascades joint_account_deposit_splits; nulls any group_payouts.transactionId
  // that pointed at one of these.
  await tx.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
  await tx.delete(groupPayoutsTable).where(eq(groupPayoutsTable.groupId, groupId));
  await tx.delete(contributionsTable).where(eq(contributionsTable.groupId, groupId));
  await tx.delete(groupContributorsTable).where(eq(groupContributorsTable.groupId, groupId));
  // Cascades savings_goal_contributions.
  await tx.delete(savingsGoalsTable).where(eq(savingsGoalsTable.groupId, groupId));
  await tx.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
  await tx.delete(incomeSourcesTable).where(eq(incomeSourcesTable.groupId, groupId));
  // A category can name another as its parent; clearing that first means the
  // one delete below never trips the self-referencing restrict.
  await tx.update(budgetCategoriesTable).set({ parentId: null }).where(eq(budgetCategoriesTable.groupId, groupId));
  await tx.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, groupId));
  await tx.delete(membersTable).where(eq(membersTable.groupId, groupId));
  await tx.delete(digestSendsTable).where(eq(digestSendsTable.groupId, groupId));
  await tx.delete(groupsTable).where(eq(groupsTable.id, groupId));
}

/** Role priority for handing off ownership: an admin before a plain member,
 *  a member before a viewer — whoever is most senior keeps the group. A
 *  function, not a module-level constant, so importing this file never
 *  touches groupMembershipsTable before it is actually needed — a test that
 *  mocks @workspace/db with a narrower surface should not have to know that. */
function successorPriority() {
  return sql`CASE ${groupMembershipsTable.role}
    WHEN ${GROUP_ROLE.ADMIN} THEN 0
    WHEN ${GROUP_ROLE.MEMBER} THEN 1
    ELSE 2
  END`;
}

/**
 * Erases one account: its Personal budget, its share of every Shared group,
 * and the identifying fields on the account row itself. Wrapped in one
 * transaction so a failure partway through leaves nothing half-done — the
 * caller runs this per account, so one person's failure does not stop
 * everyone else's due that day.
 */
export async function eraseAccount(userId: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const memberships = await tx
      .select({ groupId: groupMembershipsTable.groupId, role: groupMembershipsTable.role })
      .from(groupMembershipsTable)
      .where(eq(groupMembershipsTable.userId, userId));

    for (const membership of memberships) {
      const [group] = await tx
        .select({ id: groupsTable.id, privateOwnerUserId: groupsTable.privateOwnerUserId })
        .from(groupsTable)
        .where(eq(groupsTable.id, membership.groupId))
        .limit(1);
      if (!group) continue; // Already gone somehow; nothing left to do here.

      if (group.privateOwnerUserId === userId) {
        // Exclusively theirs. Nobody else's history depends on it.
        await eraseGroupData(tx, group.id);
        continue;
      }

      if (membership.role !== GROUP_ROLE.OWNER) {
        await tx
          .delete(groupMembershipsTable)
          .where(and(eq(groupMembershipsTable.groupId, group.id), eq(groupMembershipsTable.userId, userId)));
        continue;
      }

      // Owner of a Shared group: hand it to whoever is most senior, so the
      // group is never left without one. Erase it instead if nobody remains.
      const [successor] = await tx
        .select({ userId: groupMembershipsTable.userId })
        .from(groupMembershipsTable)
        .where(and(eq(groupMembershipsTable.groupId, group.id), ne(groupMembershipsTable.userId, userId)))
        .orderBy(successorPriority())
        .limit(1);

      if (!successor) {
        await eraseGroupData(tx, group.id);
        continue;
      }

      await tx
        .update(groupMembershipsTable)
        .set({ role: GROUP_ROLE.OWNER })
        .where(and(eq(groupMembershipsTable.groupId, group.id), eq(groupMembershipsTable.userId, successor.userId)));
      await tx
        .delete(groupMembershipsTable)
        .where(and(eq(groupMembershipsTable.groupId, group.id), eq(groupMembershipsTable.userId, userId)));
    }

    // Personal, not group-scoped: the onboarding wizard's saved answers and
    // any live password-reset link.
    await tx.delete(onboardingPreferencesTable).where(eq(onboardingPreferencesTable.userId, userId));
    await tx.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, userId));

    // The account itself. Financial rows (payments, subscription history)
    // are deliberately left alone — this scrubs who the person was, not that
    // they were ever billed.
    await tx
      .update(usersTable)
      .set({
        email: null,
        passwordHash: null,
        firstName: null,
        lastName: null,
        preferredName: null,
        profileImageUrl: null,
        customProfilePhotoPath: null,
        deletedAt: now,
      })
      .where(eq(usersTable.id, userId));
  });
}

/**
 * Erases every account whose grace period ran out today. Each account is its
 * own transaction, so one that fails is logged and skipped rather than
 * blocking the rest — the next run picks it back up, since a failed account
 * still has deletedAt null.
 */
export async function runAccountDeletions(
  now: Date = new Date(),
): Promise<{ examined: number; erased: number; failed: number }> {
  const ids = await accountsDueForErasure(now);
  let erased = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await eraseAccount(id, now);
      erased++;
    } catch (error) {
      failed++;
      logger.error({ err: error, userId: id }, "Could not erase account");
    }
  }

  return { examined: ids.length, erased, failed };
}
