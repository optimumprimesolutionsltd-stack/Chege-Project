/**
 * Converting budgets between Personal and Shared against a real Postgres.
 * The unique privateOwnerUserId column and the restrict foreign keys are what
 * make the order of these updates matter, and only a real database proves it.
 * Run with `pnpm run test:integration` against a scratch DATABASE_URL.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  bankAccountsTable,
  budgetCategoriesTable,
  db,
  expensesTable,
  groupInvitationsTable,
  groupInviteLinksTable,
  groupMembershipsTable,
  groupsTable,
  pool,
  usersTable,
} from "@workspace/db";
import {
  makeGroupPersonal,
  makePersonalBudgetShared,
  personalBudgetStatus,
  removeEmptyPersonalBudget,
  WorkspaceConversionError,
} from "../workspace-conversion";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
let counter = 0;
const uid = (label: string) => `workspace-conversion-${label}-${STAMP}-${counter++}`;
const createdUsers: string[] = [];

async function makeUser(label: string, firstName = "Test") {
  const id = uid(label);
  await db.insert(usersTable).values({ id, email: `${id}@example.test`, firstName });
  createdUsers.push(id);
  return id;
}

async function makeGroup(ownerId: string, options: { personal?: boolean; name?: string } = {}) {
  const [group] = await db.insert(groupsTable).values({
    name: options.name ?? (options.personal ? "Personal budget" : `Group ${counter++}`),
    kind: options.personal ? "personal" : "family",
    privateOwnerUserId: options.personal ? ownerId : null,
    createdByUserId: ownerId,
  }).returning({ id: groupsTable.id });
  await db.insert(groupMembershipsTable).values({ groupId: group.id, userId: ownerId, role: "owner" });
  await db.insert(bankAccountsTable).values({ groupId: group.id, name: "Bank account", openingBalance: 0 });
  await db.insert(budgetCategoriesTable).values({ groupId: group.id, name: "Food", budgetAmount: 0 });
  return group.id;
}

async function addExpense(groupId: number) {
  await db.insert(expensesTable).values({ groupId, amount: 100, category: "Food", description: "Lunch", date: "2026-10-01" });
}

async function personalBudgetsOf(userId: string) {
  return db.select({ id: groupsTable.id, kind: groupsTable.kind })
    .from(groupsTable).where(eq(groupsTable.privateOwnerUserId, userId));
}

async function group(id: number) {
  const [row] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  return row;
}

async function refusal(promise: Promise<unknown>): Promise<WorkspaceConversionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WorkspaceConversionError) return error;
    throw error;
  }
  throw new Error("Expected a refusal");
}

describe.skipIf(!hasDb)("workspace conversion (integration)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    const groups = await db.select({ id: groupsTable.id }).from(groupsTable)
      .where(inArray(groupsTable.createdByUserId, createdUsers));
    for (const { id } of groups) {
      await db.delete(expensesTable).where(eq(expensesTable.groupId, id));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, id));
      await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, id));
      await db.delete(groupsTable).where(eq(groupsTable.id, id));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, createdUsers));
    await pool.end();
  });

  describe("removing a Personal budget", () => {
    it("removes it, categories and all, when nothing is recorded", async () => {
      const me = await makeUser("remove-empty");
      const personal = await makeGroup(me, { personal: true });
      expect(await personalBudgetStatus(me)).toEqual({ exists: true, empty: true, id: personal });

      await removeEmptyPersonalBudget(me);

      expect(await group(personal)).toBeUndefined();
      expect(await personalBudgetStatus(me)).toEqual({ exists: false, empty: false, id: null });
    });

    it("refuses with 409 once anything is recorded, and keeps it", async () => {
      const me = await makeUser("remove-used");
      const personal = await makeGroup(me, { personal: true });
      await addExpense(personal);

      const error = await refusal(removeEmptyPersonalBudget(me));
      expect(error.status).toBe(409);
      expect(await group(personal)).toBeDefined();
      expect((await personalBudgetStatus(me)).empty).toBe(false);
    });

    it("counts a bank opening balance as use", async () => {
      const me = await makeUser("remove-balance");
      const personal = await makeGroup(me, { personal: true });
      await db.update(bankAccountsTable).set({ openingBalance: 2500 }).where(eq(bankAccountsTable.groupId, personal));

      expect((await refusal(removeEmptyPersonalBudget(me))).status).toBe(409);
    });
  });

  describe("Personal budget -> Shared group", () => {
    it("converts in place, keeping every record and the enabled sections", async () => {
      const me = await makeUser("make-shared");
      const personal = await makeGroup(me, { personal: true });
      await db.update(groupsTable).set({ enabledSections: ["expenses"] }).where(eq(groupsTable.id, personal));
      await addExpense(personal);

      await makePersonalBudgetShared(me, { name: "lydiah and chege", kind: "family" });

      const row = await group(personal);
      expect(row.privateOwnerUserId).toBeNull();
      expect(row.kind).toBe("family");
      expect(row.name).toBe("lydiah and chege");
      expect(row.enabledSections).toEqual(["expenses"]);
      expect(await db.select().from(expensesTable).where(eq(expensesTable.groupId, personal))).toHaveLength(1);
      expect(await personalBudgetsOf(me)).toHaveLength(0);
    });

    it("refuses a name one of their groups already has", async () => {
      const me = await makeUser("make-shared-dup");
      await makeGroup(me, { name: "Home" });
      await makeGroup(me, { personal: true });

      const error = await refusal(makePersonalBudgetShared(me, { name: "  home ", kind: "family" }));
      expect(error.status).toBe(409);
      expect(await personalBudgetsOf(me)).toHaveLength(1);
    });
  });

  describe("Shared group -> Personal budget (the swap)", () => {
    it("with no Personal budget: the group simply becomes it", async () => {
      const me = await makeUser("swap-none");
      const target = await makeGroup(me);

      const result = await makeGroupPersonal(me, target);

      expect(result.previousPersonal).toBeNull();
      expect(await personalBudgetsOf(me)).toEqual([{ id: target, kind: "personal" }]);
    });

    it("with an unused Personal budget: removes it", async () => {
      const me = await makeUser("swap-empty");
      const old = await makeGroup(me, { personal: true });
      const target = await makeGroup(me, { name: "lydiah and chege" });
      await addExpense(target);

      const result = await makeGroupPersonal(me, target);

      expect(result.previousPersonal).toEqual({ id: old, outcome: "erased" });
      expect(await group(old)).toBeUndefined();
      expect(await personalBudgetsOf(me)).toEqual([{ id: target, kind: "personal" }]);
      expect((await group(target)).name).toBe("lydiah and chege");
      expect(await db.select().from(expensesTable).where(eq(expensesTable.groupId, target))).toHaveLength(1);
    });

    it("with a used Personal budget: keeps it as the group 'Old personal budget'", async () => {
      const me = await makeUser("swap-used");
      const old = await makeGroup(me, { personal: true });
      await addExpense(old);
      await makeGroup(me, { name: "Old personal budget" });
      const target = await makeGroup(me);

      const result = await makeGroupPersonal(me, target);

      expect(result.previousPersonal).toEqual({ id: old, outcome: "kept-as-group", name: "Old personal budget 2" });
      const kept = await group(old);
      expect(kept.privateOwnerUserId).toBeNull();
      expect(kept.kind).not.toBe("personal");
      expect(await db.select().from(expensesTable).where(eq(expensesTable.groupId, old))).toHaveLength(1);
      expect(await personalBudgetsOf(me)).toEqual([{ id: target, kind: "personal" }]);
    });

    it("removes pending invitations, join links and the view link", async () => {
      const me = await makeUser("swap-invites");
      const target = await makeGroup(me);
      const later = new Date(Date.now() + 86_400_000);
      await db.insert(groupInvitationsTable).values({ groupId: target, email: "lydiah@example.test", tokenHash: uid("inv"), expiresAt: later });
      await db.insert(groupInviteLinksTable).values([
        { groupId: target, tokenHash: uid("link"), role: "member", expiresAt: later },
        { groupId: target, tokenHash: uid("view"), role: "viewer", expiresAt: later },
      ]);

      await makeGroupPersonal(me, target);

      expect(await db.select().from(groupInvitationsTable).where(eq(groupInvitationsTable.groupId, target))).toHaveLength(0);
      expect(await db.select().from(groupInviteLinksTable).where(eq(groupInviteLinksTable.groupId, target))).toHaveLength(0);
    });

    it.each(["member", "viewer"])("is refused while a %s is also in it, changing nothing", async (role) => {
      const me = await makeUser("swap-other");
      const lydiah = await makeUser("swap-lydiah", "Lydiah");
      const old = await makeGroup(me, { personal: true });
      const target = await makeGroup(me);
      await db.insert(groupMembershipsTable).values({ groupId: target, userId: lydiah, role });

      const error = await refusal(makeGroupPersonal(me, target));

      expect(error.status).toBe(409);
      expect(error.message).toContain("Lydiah");
      expect(await personalBudgetsOf(me)).toEqual([{ id: old, kind: "personal" }]);
      expect((await group(target)).privateOwnerUserId).toBeNull();
    });

    it("is refused for somebody who is not the owner", async () => {
      const owner = await makeUser("swap-owner");
      const me = await makeUser("swap-admin");
      const target = await makeGroup(owner);
      await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, target));
      await db.insert(groupMembershipsTable).values({ groupId: target, userId: me, role: "admin" });

      expect((await refusal(makeGroupPersonal(me, target))).status).toBe(403);
      expect(await personalBudgetsOf(me)).toHaveLength(0);
    });

    it("round-trips: Personal -> Shared -> Personal keeps the same budget", async () => {
      const me = await makeUser("round-trip");
      const personal = await makeGroup(me, { personal: true });
      await addExpense(personal);

      await makePersonalBudgetShared(me, { name: "Ours", kind: "family" });
      await makeGroupPersonal(me, personal);

      expect(await personalBudgetsOf(me)).toEqual([{ id: personal, kind: "personal" }]);
      expect(await db.select().from(expensesTable).where(eq(expensesTable.groupId, personal))).toHaveLength(1);
    });
  });
});
