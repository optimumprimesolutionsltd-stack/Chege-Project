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

import crypto from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "./logger";
import { EmailNotConfiguredError, sendEmail } from "./email";
import {
  accountDeletionCodesTable,
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
  // The name is a holdover from when this table only ever held subscription
  // reminders. Its schema (user, kind, sentFor, sentAt, unique on the first
  // three) is generic - "send this kind of notice about this date at most
  // once" - and reusing it here avoids a migration for what is the same
  // problem: telling somebody about a deadline exactly once.
  subscriptionRemindersTable,
  usersTable,
} from "@workspace/db";

export type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ACCOUNT_DELETION_GRACE_DAYS = 14;
/** How long before erasure the one reminder goes out. Late enough that
 *  "in a couple of days" is still true when it lands, early enough to
 *  actually act on. */
const ACCOUNT_DELETION_REMINDER_DAYS_BEFORE = 2;
const ACCOUNT_DELETION_REMINDER_KIND = "account_deletion_reminder";
const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

function fromAddress(): string {
  return process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>";
}

function formatDeletionDate(date: Date): string {
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * What each account-deletion email says. Written the same way as the
 * subscription reminders: what is still true (nothing erased yet, how to
 * cancel) before what happens if nothing is done.
 */
function composeDeletionEmail(
  kind: "requested" | "reminder",
  firstName: string,
  scheduledFor: Date,
): { subject: string; html: string } {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const when = formatDeletionDate(scheduledFor);
  const whatHappens =
    `<p>On ${when}, if you have not signed back in:</p>`
    + `<ul><li>Your Personal budget and everything recorded in it is erased.</li>`
    + `<li>You leave every Shared group you belong to — where you own one, ownership passes to the `
    + `longest-standing member left.</li>`
    + `<li>Your name, email address and photo are removed. Records of payments you have made are kept `
    + `as billing history.</li></ul>`;
  const howToCancel =
    `<p>Signing back in any time before then cancels this automatically — your budgets and groups `
    + `will be exactly as you left them.</p>`;

  if (kind === "requested") {
    return {
      subject: "Your Jamvi account is scheduled for deletion",
      html: `<p>${greeting}</p><p>We have received your request to delete your Jamvi account. `
        + `Nothing has been erased yet.</p>${howToCancel}${whatHappens}`,
    };
  }

  return {
    subject: `Your Jamvi account will be deleted on ${when}`,
    html: `<p>${greeting}</p><p>A reminder: your Jamvi account is scheduled for deletion on ${when} — `
      + `about ${ACCOUNT_DELETION_REMINDER_DAYS_BEFORE} days from now.</p>${howToCancel}${whatHappens}`,
  };
}

/** Best-effort send: a mail failure must never be the reason an account
 *  deletion could not be requested, or block the run that erases due
 *  accounts. Mirrors subscription-reminders.ts's own handling. */
async function trySendDeletionEmail(
  to: string,
  firstName: string,
  kind: "requested" | "reminder",
  scheduledFor: Date,
): Promise<void> {
  const { subject, html } = composeDeletionEmail(kind, firstName, scheduledFor);
  try {
    await sendEmail({ from: fromAddress(), to: [to], subject, html });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      logger.warn("Account-deletion email was not sent: no mailer is configured");
      return;
    }
    logger.error({ err: error, kind }, "Could not send an account-deletion email");
  }
}

export function scheduledDeletionDate(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
}

/**
 * Starts the grace period. Calling this again while one is already running
 * restarts the clock from now, which only matters if a client retries -
 * and is also why the confirmation email only ever fires on the first call:
 * a retry restarting the clock must not also restart the inbox.
 */
export async function requestAccountDeletion(
  userId: string,
  now: Date = new Date(),
): Promise<Date> {
  const scheduledFor = scheduledDeletionDate(now);

  const [existing] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName, deletionRequestedAt: usersTable.deletionRequestedAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  await db
    .update(usersTable)
    .set({ deletionRequestedAt: now })
    .where(eq(usersTable.id, userId));

  if (existing?.email && !existing.deletionRequestedAt) {
    await trySendDeletionEmail(existing.email, existing.firstName ?? "", "requested", scheduledFor);
  }

  return scheduledFor;
}

/**
 * Emails everyone whose account will be erased in
 * ACCOUNT_DELETION_REMINDER_DAYS_BEFORE days, once - the one nudge between
 * the confirmation sent at request time and the erasure itself. Somebody who
 * requested deletion is signed out immediately, so unlike a lapsed
 * subscription they cannot simply open the app and see a banner; this email
 * is the only thing that would remind them in time.
 */
export async function sendAccountDeletionReminders(
  now: Date = new Date(),
): Promise<{ examined: number; sent: number }> {
  const pending = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      deletionRequestedAt: usersTable.deletionRequestedAt,
    })
    .from(usersTable)
    .where(and(isNotNull(usersTable.deletionRequestedAt), isNull(usersTable.deletedAt)));

  let sent = 0;
  for (const row of pending) {
    if (!row.email || !row.deletionRequestedAt) continue;
    const scheduledFor = scheduledDeletionDate(row.deletionRequestedAt);
    if (scheduledFor <= now) continue; // Already due - runAccountDeletions handles it, not a reminder.
    if (daysBetween(now, scheduledFor) > ACCOUNT_DELETION_REMINDER_DAYS_BEFORE) continue;

    const claimed = await db
      .insert(subscriptionRemindersTable)
      .values({ userId: row.id, kind: ACCOUNT_DELETION_REMINDER_KIND, sentFor: scheduledFor })
      .onConflictDoNothing()
      .returning({ id: subscriptionRemindersTable.id });
    if (claimed.length === 0) continue;

    await trySendDeletionEmail(row.email, row.firstName ?? "", "reminder", scheduledFor);
    sent += 1;
  }

  return { examined: pending.length, sent };
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

/**
 * A one-time code confirming intent to delete an account, so someone's
 * session being left open on a shared device cannot end in a scheduled
 * deletion from a single tap. requestAccountDeletion itself is only ever
 * reached through confirmAccountDeletionCode below - never directly from a
 * route - once a code has actually been verified.
 */
const DELETION_CODE_LENGTH = 6;
const DELETION_CODE_TTL_MS = 10 * 60 * 1000;

export class IncorrectDeletionCodeError extends Error {
  constructor() {
    super("That code is incorrect or has expired.");
  }
}

function hashDeletionCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateDeletionCode(): string {
  // crypto.randomInt is uniform, unlike Math.random - worth it even for a
  // 6-digit code, since this is the one thing standing before deletion.
  return String(crypto.randomInt(0, 10 ** DELETION_CODE_LENGTH)).padStart(DELETION_CODE_LENGTH, "0");
}

/**
 * Emails a fresh code and stores its hash, expiring in ten minutes. Does not
 * touch deletionRequestedAt - nothing about the account changes until the
 * code is actually confirmed.
 *
 * Unlike the deletion emails above, a failure here is not best-effort: this
 * email is the entire mechanism, not a courtesy notice, so if it cannot be
 * sent the caller needs to know and say so rather than silently leaving the
 * member with no way to ever confirm.
 */
export async function requestAccountDeletionCode(userId: string, now: Date = new Date()): Promise<void> {
  const [user] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.email) {
    throw new Error("This account has no email on file to send a code to.");
  }

  const code = generateDeletionCode();
  await db.insert(accountDeletionCodesTable).values({
    userId,
    codeHash: hashDeletionCode(code),
    expiresAt: new Date(now.getTime() + DELETION_CODE_TTL_MS),
  });

  const greeting = user.firstName ? `Hi ${user.firstName},` : "Hi,";
  try {
    await sendEmail({
      from: fromAddress(),
      to: [user.email],
      subject: "Your Jamvi account-deletion code",
      html: `<p>${greeting}</p><p>Use this code to confirm you want to delete your Jamvi account:</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>`
        + `<p>It expires in 10 minutes. If you did not ask to delete your account, ignore this message — `
        + `nothing happens without the code.</p>`,
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      logger.error("Could not send an account-deletion code: no mailer is configured");
    } else {
      logger.error({ err: error }, "Could not send an account-deletion code");
    }
    throw new Error("Could not send a confirmation code. Try again shortly.");
  }
}

/**
 * Verifies a code and, only if it checks out, actually starts the grace
 * period. Single-use: consumed the moment it is spent, so a code cannot
 * confirm a second deletion later, and scoped to this member's own rows, so
 * verifying is never a search across every code ever issued.
 */
export async function confirmAccountDeletionCode(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<Date> {
  const [pending] = await db
    .select({ id: accountDeletionCodesTable.id, codeHash: accountDeletionCodesTable.codeHash })
    .from(accountDeletionCodesTable)
    .where(and(
      eq(accountDeletionCodesTable.userId, userId),
      isNull(accountDeletionCodesTable.usedAt),
      gt(accountDeletionCodesTable.expiresAt, now),
    ))
    .orderBy(desc(accountDeletionCodesTable.createdAt))
    .limit(1);

  if (!pending || pending.codeHash !== hashDeletionCode(code)) {
    throw new IncorrectDeletionCodeError();
  }

  await db
    .update(accountDeletionCodesTable)
    .set({ usedAt: now })
    .where(eq(accountDeletionCodesTable.id, pending.id));

  return requestAccountDeletion(userId, now);
}

/**
 * The same emailed-code approval for deleting a whole group as for deleting
 * an account. Deleting a group erases it for every member at once and, unlike
 * an account, has no grace period, so a session left open on a shared device
 * must not be able to do it from a tap.
 *
 * Codes share the account-deletion table, so the hash is scoped to the group:
 * a code issued for one purpose can never confirm the other, or a different
 * group.
 */
function hashGroupDeletionCode(groupId: number, code: string): string {
  return crypto.createHash("sha256").update(`group:${groupId}:${code}`).digest("hex");
}

export async function requestGroupDeletionCode(
  userId: string,
  groupId: number,
  groupName: string,
  now: Date = new Date(),
): Promise<void> {
  const [user] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.email) {
    throw new Error("This account has no email on file to send a code to.");
  }

  const code = generateDeletionCode();
  await db.insert(accountDeletionCodesTable).values({
    userId,
    codeHash: hashGroupDeletionCode(groupId, code),
    expiresAt: new Date(now.getTime() + DELETION_CODE_TTL_MS),
  });

  const greeting = user.firstName ? `Hi ${user.firstName},` : "Hi,";
  const safeName = groupName.replace(/[<>&"]/g, "");
  try {
    await sendEmail({
      from: fromAddress(),
      to: [user.email],
      subject: "Your Jamvi group-deletion code",
      html: `<p>${greeting}</p><p>Use this code to confirm you want to delete the group "${safeName}" for every member:</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>`
        + `<p>It expires in 10 minutes. Deleting a group cannot be undone. If you did not ask to delete it, ignore this `
        + `message — nothing happens without the code.</p>`,
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      logger.error("Could not send a group-deletion code: no mailer is configured");
    } else {
      logger.error({ err: error }, "Could not send a group-deletion code");
    }
    throw new Error("Could not send a confirmation code. Try again shortly.");
  }
}

/** Spends a group-deletion code. Single-use, and only for this group. */
export async function confirmGroupDeletionCode(
  userId: string,
  groupId: number,
  code: string,
  now: Date = new Date(),
): Promise<void> {
  const [pending] = await db
    .select({ id: accountDeletionCodesTable.id, codeHash: accountDeletionCodesTable.codeHash })
    .from(accountDeletionCodesTable)
    .where(and(
      eq(accountDeletionCodesTable.userId, userId),
      isNull(accountDeletionCodesTable.usedAt),
      gt(accountDeletionCodesTable.expiresAt, now),
    ))
    .orderBy(desc(accountDeletionCodesTable.createdAt))
    .limit(1);

  if (!pending || pending.codeHash !== hashGroupDeletionCode(groupId, code)) {
    throw new IncorrectDeletionCodeError();
  }

  await db
    .update(accountDeletionCodesTable)
    .set({ usedAt: now })
    .where(eq(accountDeletionCodesTable.id, pending.id));
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
