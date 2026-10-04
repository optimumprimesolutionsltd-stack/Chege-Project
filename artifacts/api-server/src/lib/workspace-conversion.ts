/**
 * Turning a Personal budget into a Shared group and back, in place, and
 * removing a Personal budget nobody has used.
 *
 * "In place" is the whole point: a budget is one `groups` row, and whether it
 * is somebody's Personal budget is nothing more than its privateOwnerUserId
 * (plus kind "personal"). Flipping those keeps every expense, category, bank
 * entry and goal exactly where it was, and keeps the group id, so everything
 * a phone keeps per budget (payee rules, nicknames, M-Pesa settings) follows
 * too. Nothing is copied and nothing is lost.
 *
 * The rule the swap protects: a person has at most one Personal budget
 * (privateOwnerUserId is unique), and nothing is ever deleted by surprise. A
 * Personal budget is only erased when it holds no records at all; one with
 * records is kept as a Shared group instead.
 */

import {
  bankAccountsTable,
  contributionsTable,
  db,
  expensesTable,
  GROUP_KIND,
  GROUP_ROLE,
  groupInvitationsTable,
  groupInviteLinksTable,
  groupMembershipsTable,
  groupPayoutsTable,
  groupsTable,
  jointAccountTxTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { eraseGroupData, type DbOrTransaction } from "./account-deletion";
import { accessibleSharedBudgetNames, normalizedSharedBudgetName } from "./shared-group-names";

/** A refusal the route answers with as-is: a status and a plain sentence. */
export class WorkspaceConversionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** What a Shared group may be. Personal is what it is being turned out of. */
export const SHARED_GROUP_KINDS = [
  GROUP_KIND.FAMILY,
  GROUP_KIND.CHAMA,
  GROUP_KIND.CHURCH,
  GROUP_KIND.CLUB,
  GROUP_KIND.TEAM,
  GROUP_KIND.STUDENT_GROUP,
  GROUP_KIND.OTHER,
] as const;
export type SharedGroupKind = (typeof SHARED_GROUP_KINDS)[number];

export function isSharedGroupKind(value: unknown): value is SharedGroupKind {
  return typeof value === "string" && (SHARED_GROUP_KINDS as readonly string[]).includes(value);
}

/** The name a non-empty Personal budget is kept under when a swap replaces it. */
export const KEPT_PERSONAL_BUDGET_NAME = "Old personal budget";

export const NOT_EMPTY_MESSAGE =
  "Your Personal budget has records in it, so it can't be removed. Only an unused Personal budget can be removed.";

/** Counts of everything that makes a budget "used". */
export type BudgetUsage = {
  expenses: number;
  bankEntries: number;
  contributions: number;
  savingsGoals: number;
  payouts: number;
  /** Bank accounts carrying a non-zero opening balance. */
  bankOpeningBalances: number;
};

/**
 * A budget is empty when nothing has been recorded in it. Categories and
 * income sources do not count: every new budget is seeded with them, and
 * they are a plan, not a record of money.
 */
export function isBudgetEmpty(usage: BudgetUsage): boolean {
  return Object.values(usage).every((count) => count === 0);
}

/** What a swap does to the Personal budget the person already has. */
export type ExistingPersonalOutcome = "none" | "erase" | "keep-as-group";

export function existingPersonalOutcome(existing: { empty: boolean } | null): ExistingPersonalOutcome {
  if (!existing) return "none";
  return existing.empty ? "erase" : "keep-as-group";
}

/**
 * The first of "Old personal budget", "Old personal budget 2", … that is not
 * already one of this person's Shared group names.
 */
export function freeGroupName(base: string, takenNormalizedNames: ReadonlySet<string>): string {
  if (!takenNormalizedNames.has(normalizedSharedBudgetName(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!takenNormalizedNames.has(normalizedSharedBudgetName(candidate))) return candidate;
  }
}

export type GroupMember = { userId: string; role: string; name: string };

/**
 * Why this person may not make the group their Personal budget, or null.
 *
 * Only its owner, and only while nobody else is in it - a viewer included,
 * because a Personal budget has no members and they would lose access too.
 */
export function makePersonalRefusal(callerId: string, members: GroupMember[]): WorkspaceConversionError | null {
  const caller = members.find((member) => member.userId === callerId);
  if (!caller) return new WorkspaceConversionError(404, "That group is not available to you.");
  if (caller.role !== GROUP_ROLE.OWNER) {
    return new WorkspaceConversionError(403, "Only the group's owner can make it their Personal budget.");
  }
  const others = members.filter((member) => member.userId !== callerId);
  if (others.length === 0) return null;
  const names = others.map((member) => member.role === GROUP_ROLE.VIEWER ? `${member.name} (viewer)` : member.name);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return new WorkspaceConversionError(
    409,
    `Only a group you are alone in can become your Personal budget. ${list} ${others.length === 1 ? "is" : "are"} also in it - remove ${others.length === 1 ? "them" : "everyone else"} first.`,
  );
}

function displayName(user: { preferredName: string | null; firstName: string | null; lastName: string | null; email: string | null }): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.preferredName?.trim() || full || user.email || "Another member";
}

async function countRows(tx: DbOrTransaction, table: PgTable, groupColumn: AnyPgColumn, groupId: number): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(groupColumn, groupId));
  return Number(row?.count ?? 0);
}

export async function budgetUsage(tx: DbOrTransaction, groupId: number): Promise<BudgetUsage> {
  const [expenses, bankEntries, contributions, savingsGoals, payouts] = [
    await countRows(tx, expensesTable, expensesTable.groupId, groupId),
    await countRows(tx, jointAccountTxTable, jointAccountTxTable.groupId, groupId),
    await countRows(tx, contributionsTable, contributionsTable.groupId, groupId),
    await countRows(tx, savingsGoalsTable, savingsGoalsTable.groupId, groupId),
    await countRows(tx, groupPayoutsTable, groupPayoutsTable.groupId, groupId),
  ];
  const [balances] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.groupId, groupId), ne(bankAccountsTable.openingBalance, 0)));
  return {
    expenses,
    bankEntries,
    contributions,
    savingsGoals,
    payouts,
    bankOpeningBalances: Number(balances?.count ?? 0),
  };
}

/** The person's Personal budget, locked for the rest of the transaction. */
async function lockedPersonalBudget(tx: DbOrTransaction, userId: string): Promise<{ id: number } | undefined> {
  const [row] = await tx
    .select({ id: groupsTable.id })
    .from(groupsTable)
    .where(eq(groupsTable.privateOwnerUserId, userId))
    .for("update")
    .limit(1);
  return row;
}

export type PersonalBudgetStatus = { exists: boolean; empty: boolean; id: number | null };

export async function personalBudgetStatus(userId: string): Promise<PersonalBudgetStatus> {
  const [row] = await db
    .select({ id: groupsTable.id })
    .from(groupsTable)
    .where(eq(groupsTable.privateOwnerUserId, userId))
    .limit(1);
  if (!row) return { exists: false, empty: false, id: null };
  return { exists: true, empty: isBudgetEmpty(await budgetUsage(db, row.id)), id: row.id };
}

/** Removes the person's Personal budget, only if nothing was ever recorded in it. */
export async function removeEmptyPersonalBudget(userId: string): Promise<{ removedId: number }> {
  return db.transaction(async (tx) => {
    const personal = await lockedPersonalBudget(tx, userId);
    if (!personal) throw new WorkspaceConversionError(404, "You don't have a Personal budget to remove.");
    if (!isBudgetEmpty(await budgetUsage(tx, personal.id))) {
      throw new WorkspaceConversionError(409, NOT_EMPTY_MESSAGE);
    }
    await eraseGroupData(tx, personal.id);
    return { removedId: personal.id };
  });
}

/**
 * Personal budget -> Shared group, keeping everything in it. Afterwards the
 * person has no Personal budget until they make one.
 *
 * The subscription rule for starting a group is the route's to check before
 * calling this; the name rule is checked here, inside the transaction.
 */
export async function makePersonalBudgetShared(
  userId: string,
  input: { name: string; kind: SharedGroupKind },
): Promise<{ id: number; name: string; kind: SharedGroupKind }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) {
    throw new WorkspaceConversionError(400, "Use a group name between 2 and 60 characters.");
  }
  if (!isSharedGroupKind(input.kind)) {
    throw new WorkspaceConversionError(400, "Choose what kind of group this is.");
  }
  return db.transaction(async (tx) => {
    const personal = await lockedPersonalBudget(tx, userId);
    if (!personal) throw new WorkspaceConversionError(404, "You don't have a Personal budget to turn into a group.");
    const taken = await accessibleSharedBudgetNames(userId, personal.id, tx);
    if (taken.has(normalizedSharedBudgetName(name))) {
      throw new WorkspaceConversionError(409, "You already have a Shared group with that name. Choose a different name.");
    }
    // enabledSections are left exactly as they were: the budget keeps the
    // tabs it had, and the person can change them like any group's.
    await tx
      .update(groupsTable)
      .set({ privateOwnerUserId: null, name, kind: input.kind })
      .where(eq(groupsTable.id, personal.id));
    return { id: personal.id, name, kind: input.kind };
  });
}

export type MakePersonalResult = {
  id: number;
  /** What happened to the Personal budget the person had before, if any. */
  previousPersonal:
    | { id: number; outcome: "erased" }
    | { id: number; outcome: "kept-as-group"; name: string }
    | null;
};

/**
 * Shared group -> the caller's Personal budget: the swap. One transaction, and
 * afterwards the caller has exactly one Personal budget, this one.
 */
export async function makeGroupPersonal(userId: string, groupId: number): Promise<MakePersonalResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: groupsTable.id, privateOwnerUserId: groupsTable.privateOwnerUserId })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .for("update")
      .limit(1);
    if (!target) throw new WorkspaceConversionError(404, "That group is not available to you.");
    if (target.privateOwnerUserId === userId) {
      throw new WorkspaceConversionError(409, "This is already your Personal budget.");
    }
    if (target.privateOwnerUserId) throw new WorkspaceConversionError(404, "That group is not available to you.");

    const members = await tx
      .select({
        userId: groupMembershipsTable.userId,
        role: groupMembershipsTable.role,
        preferredName: usersTable.preferredName,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(groupMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
      .where(eq(groupMembershipsTable.groupId, groupId));
    const refusal = makePersonalRefusal(
      userId,
      members.map((member) => ({ userId: member.userId, role: member.role, name: displayName(member) })),
    );
    if (refusal) throw refusal;

    let previousPersonal: MakePersonalResult["previousPersonal"] = null;
    const existing = await lockedPersonalBudget(tx, userId);
    if (existing) {
      const outcome = existingPersonalOutcome({ empty: isBudgetEmpty(await budgetUsage(tx, existing.id)) });
      if (outcome === "erase") {
        await eraseGroupData(tx, existing.id);
        previousPersonal = { id: existing.id, outcome: "erased" };
      } else {
        // Kept, as a Shared group the person still owns: nothing recorded is
        // ever deleted by surprise. Its privateOwnerUserId is cleared here,
        // before the target takes it, because the column is unique.
        const name = freeGroupName(KEPT_PERSONAL_BUDGET_NAME, await accessibleSharedBudgetNames(userId, existing.id, tx));
        await tx
          .update(groupsTable)
          .set({ privateOwnerUserId: null, name, kind: GROUP_KIND.OTHER })
          .where(eq(groupsTable.id, existing.id));
        previousPersonal = { id: existing.id, outcome: "kept-as-group", name };
      }
    }

    await tx
      .update(groupsTable)
      .set({ privateOwnerUserId: userId, kind: GROUP_KIND.PERSONAL })
      .where(eq(groupsTable.id, groupId));
    // A Personal budget has nobody to invite. Pending invitations, join links
    // and the read-only view link (a viewer-role invite link) all go, so none
    // can let anybody into it later.
    await tx
      .delete(groupInvitationsTable)
      .where(and(eq(groupInvitationsTable.groupId, groupId), isNull(groupInvitationsTable.acceptedAt)));
    await tx.delete(groupInviteLinksTable).where(eq(groupInviteLinksTable.groupId, groupId));

    return { id: groupId, previousPersonal };
  });
}
