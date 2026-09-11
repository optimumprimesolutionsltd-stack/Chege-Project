/**
 * eraseAccount against a real Postgres. This is the riskiest part of the
 * account-deletion feature — a dozen deletes across tables with restrict
 * foreign keys, in an order that only a real database can actually prove —
 * so it belongs here rather than behind a mock. Run with
 * `pnpm run test:integration` against a scratch DATABASE_URL; CI does not
 * run it (see vitest.config.ts).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  bankAccountsTable,
  budgetCategoriesTable,
  db,
  expensesTable,
  GROUP_ROLE,
  groupMembershipsTable,
  groupsTable,
  incomeSourcesTable,
  pool,
  usersTable,
} from "@workspace/db";
import { eraseAccount } from "../account-deletion";

const hasDb = !!process.env.DATABASE_URL;
const STAMP = Date.now();
const uid = (label: string) => `account-deletion-test-${label}-${STAMP}`;

async function makeUser(id: string) {
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.test`,
    firstName: "Test",
    lastName: "Person",
  });
}

async function makeGroup(name: string, options: { privateOwnerUserId?: string } = {}) {
  const [group] = await db.insert(groupsTable).values({
    name,
    legacyKey: `${name}-${STAMP}`,
    ...options,
  }).returning({ id: groupsTable.id });
  return group.id;
}

async function addMember(groupId: number, userId: string, role: string) {
  await db.insert(groupMembershipsTable).values({ groupId, userId, role });
}

async function membershipRole(groupId: number, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: groupMembershipsTable.role })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

async function groupExists(groupId: number): Promise<boolean> {
  const [row] = await db.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
  return row !== undefined;
}

const createdUserIds: string[] = [];
const createdGroupIds: number[] = [];

describe.skipIf(!hasDb)("eraseAccount (integration)", () => {
  afterAll(async () => {
    // Best-effort: eraseAccount itself should have removed most of this.
    // Anything left over (a group that survived because a test failed
    // partway) is cleaned up directly so a re-run starts from nothing.
    for (const groupId of createdGroupIds) {
      await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, groupId)).catch(() => {});
      await db.delete(groupsTable).where(eq(groupsTable.id, groupId)).catch(() => {});
    }
    for (const userId of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    }
    await pool.end();
  });

  beforeEach(() => {
    createdUserIds.length = 0;
    createdGroupIds.length = 0;
  });

  it("erases a Personal budget entirely and scrubs the account", async () => {
    const userId = uid("personal-owner");
    createdUserIds.push(userId);
    await makeUser(userId);
    const groupId = await makeGroup("Personal budget", { privateOwnerUserId: userId });
    createdGroupIds.push(groupId);
    await addMember(groupId, userId, GROUP_ROLE.OWNER);
    await db.insert(incomeSourcesTable).values({ groupId, userId, name: "Salary" });
    const [category] = await db.insert(budgetCategoriesTable).values({ groupId, name: "Rent", budgetAmount: 20_000 }).returning({ id: budgetCategoriesTable.id });
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "Main" }).returning({ id: bankAccountsTable.id });
    await db.insert(expensesTable).values({
      groupId,
      amount: 500,
      category: "Rent",
      description: "Erasure fixture",
      paidById: userId,
      accountId: account.id,
      date: "2026-09-01",
    });

    await eraseAccount(userId);

    expect(await groupExists(groupId)).toBe(false);
    expect(
      await db.select().from(expensesTable).where(eq(expensesTable.groupId, groupId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(budgetCategoriesTable).where(eq(budgetCategoriesTable.id, category.id)),
    ).toHaveLength(0);

    const [scrubbed] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    expect(scrubbed).toBeDefined();
    expect(scrubbed.email).toBeNull();
    expect(scrubbed.firstName).toBeNull();
    expect(scrubbed.deletedAt).not.toBeNull();
  });

  it("just leaves a Shared group when the departing member is not its owner", async () => {
    const owner = uid("owner-stays");
    const member = uid("member-leaves");
    createdUserIds.push(owner, member);
    await makeUser(owner);
    await makeUser(member);
    const groupId = await makeGroup("Chama with a leaver");
    createdGroupIds.push(groupId);
    await addMember(groupId, owner, GROUP_ROLE.OWNER);
    await addMember(groupId, member, GROUP_ROLE.MEMBER);

    await eraseAccount(member);

    expect(await groupExists(groupId)).toBe(true);
    expect(await membershipRole(groupId, owner)).toBe(GROUP_ROLE.OWNER);
    expect(await membershipRole(groupId, member)).toBeNull();
  });

  it("promotes the most senior remaining member when the owner is deleted", async () => {
    const owner = uid("owner-leaves");
    const admin = uid("admin-promoted");
    const viewer = uid("viewer-stays");
    createdUserIds.push(owner, admin, viewer);
    await makeUser(owner);
    await makeUser(admin);
    await makeUser(viewer);
    const groupId = await makeGroup("Chama with a successor");
    createdGroupIds.push(groupId);
    await addMember(groupId, owner, GROUP_ROLE.OWNER);
    await addMember(groupId, viewer, GROUP_ROLE.VIEWER);
    await addMember(groupId, admin, GROUP_ROLE.ADMIN);

    await eraseAccount(owner);

    expect(await groupExists(groupId)).toBe(true);
    expect(await membershipRole(groupId, admin)).toBe(GROUP_ROLE.OWNER);
    expect(await membershipRole(groupId, viewer)).toBe(GROUP_ROLE.VIEWER);
    expect(await membershipRole(groupId, owner)).toBeNull();
  });

  it("erases a Shared group entirely when its owner was the only member left", async () => {
    const owner = uid("sole-owner");
    createdUserIds.push(owner);
    await makeUser(owner);
    const groupId = await makeGroup("Abandoned chama");
    createdGroupIds.push(groupId);
    await addMember(groupId, owner, GROUP_ROLE.OWNER);

    await eraseAccount(owner);

    expect(await groupExists(groupId)).toBe(false);
  });
});
