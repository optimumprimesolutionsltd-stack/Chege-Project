import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  contributionsTable,
  db,
  expenseIncomeSplitsTable,
  expensesTable,
  groupMembershipsTable,
  groupsTable,
  jointAccountTxTable,
  pool,
  savingsGoalContributionsTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import contributionsRouter from "../contributions.js";
import expensesRouter from "../expenses.js";
import groupRouter from "../group.js";
import savingsGoalsRouter from "../savings-goals.js";

const hasDb = !!process.env.DATABASE_URL;
const ownerId = "shared-transaction-owner";
const secondMemberId = "shared-transaction-second-member";
let activeGroupId: number;
let activeGroupIsPrivate = false;
let newSharedGroupId: number;
let privateGroupId: number;
let legacyGroupId: number;
let goalId: number;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: ownerId };
    req.group = { id: activeGroupId, role: "owner", isPrivate: activeGroupIsPrivate };
    next();
  });
  app.use("/", expensesRouter);
  app.use("/", contributionsRouter);
  app.use("/", groupRouter);
  app.use("/", savingsGoalsRouter);
  return app;
}

describe.skipIf(!hasDb)("shared groups need two members before recording money", () => {
  const app = buildApp();

  beforeAll(async () => {
    await db.insert(usersTable).values([
      { id: ownerId, firstName: "Shared", lastName: "Owner" },
      { id: secondMemberId, firstName: "Second", lastName: "Member" },
    ]).onConflictDoNothing();

    const [newSharedGroup] = await db.insert(groupsTable).values({
      name: `New shared group ${Date.now()}`,
      createdByUserId: ownerId,
    }).returning();
    newSharedGroupId = newSharedGroup.id;
    activeGroupId = newSharedGroupId;
    await db.insert(groupMembershipsTable).values({
      groupId: newSharedGroupId,
      userId: ownerId,
      role: "owner",
    });
    const [goal] = await db.insert(savingsGoalsTable).values({
      groupId: newSharedGroupId,
      name: `Shared group goal ${Date.now()}`,
      targetAmount: 100_000,
      currentAmount: 0,
      createdByUserId: ownerId,
      isCompleted: false,
    }).returning();
    goalId = goal.id;

    const [privateGroup] = await db.insert(groupsTable).values({
      name: `Private budget ${Date.now()}`,
      createdByUserId: ownerId,
      privateOwnerUserId: ownerId,
    }).returning();
    privateGroupId = privateGroup.id;
    await db.insert(groupMembershipsTable).values({
      groupId: privateGroupId,
      userId: ownerId,
      role: "owner",
    });

    const [legacyGroup] = await db.insert(groupsTable).values({
      name: `Legacy shared budget ${Date.now()}`,
      createdByUserId: ownerId,
      legacyKey: `legacy-transaction-rule-${Date.now()}`,
    }).returning();
    legacyGroupId = legacyGroup.id;
    await db.insert(groupMembershipsTable).values({
      groupId: legacyGroupId,
      userId: ownerId,
      role: "owner",
    });
  });

  afterAll(async () => {
    const groupIds = [newSharedGroupId, privateGroupId, legacyGroupId].filter(Boolean);
    if (groupIds.length > 0) {
      await db.delete(savingsGoalContributionsTable)
        .where(eq(savingsGoalContributionsTable.groupId, newSharedGroupId));
      await db.delete(savingsGoalsTable).where(eq(savingsGoalsTable.groupId, newSharedGroupId));
      await db.delete(expenseIncomeSplitsTable)
        .where(eq(expenseIncomeSplitsTable.groupId, newSharedGroupId));
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, newSharedGroupId));
      await db.delete(expensesTable).where(eq(expensesTable.groupId, newSharedGroupId));
      await db.delete(contributionsTable).where(eq(contributionsTable.groupId, newSharedGroupId));
      await db.delete(expensesTable).where(eq(expensesTable.groupId, legacyGroupId));
      await db.delete(contributionsTable).where(eq(contributionsTable.groupId, privateGroupId));
      await db.delete(groupMembershipsTable)
        .where(and(
          eq(groupMembershipsTable.groupId, newSharedGroupId),
          eq(groupMembershipsTable.userId, secondMemberId),
        ));
      await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, newSharedGroupId));
      await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, privateGroupId));
      await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, legacyGroupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, newSharedGroupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, privateGroupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, legacyGroupId));
    }
    await db.delete(usersTable).where(eq(usersTable.id, secondMemberId));
    await db.delete(usersTable).where(eq(usersTable.id, ownerId));
    await pool.end();
  });

  it("blocks every new expense and contribution route before any record is written", async () => {
    const expense = await request(app).post("/expenses").send({
      amount: 500,
      category: "Food",
      description: "Blocked shared expense",
      paidById: ownerId,
      paidFromBank: false,
      isRecurring: false,
      date: "2026-08-21",
    });
    const monthlyContribution = await request(app).post("/contributions").send({
      amount: 500,
      month: 8,
      year: 2026,
    });
    const goalContribution = await request(app)
      .post(`/savings-goals/${goalId}/contribute`)
      .send({ amount: 500, userId: ownerId });
    const cascadeContribution = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 500, goalIds: [goalId] });
    const recurringCopy = await request(app)
      .post("/expenses/apply-recurring")
      .send({ month: 8, year: 2026 });

    for (const response of [
      expense,
      monthlyContribution,
      goalContribution,
      cascadeContribution,
      recurringCopy,
    ]) {
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toMatch(/invite at least one more member/i);
    }

    const [expenseCount] = await db.select({ count: sql<number>`count(*)` })
      .from(expensesTable)
      .where(eq(expensesTable.groupId, newSharedGroupId));
    const [monthlyContributionCount] = await db.select({ count: sql<number>`count(*)` })
      .from(contributionsTable)
      .where(eq(contributionsTable.groupId, newSharedGroupId));
    const [goal] = await db.select({ currentAmount: savingsGoalsTable.currentAmount })
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    const [goalContributionCount] = await db.select({ count: sql<number>`count(*)` })
      .from(savingsGoalContributionsTable)
      .where(eq(savingsGoalContributionsTable.groupId, newSharedGroupId));

    expect(Number(expenseCount.count)).toBe(0);
    expect(Number(monthlyContributionCount.count)).toBe(0);
    expect(goal.currentAmount).toBe(0);
    expect(Number(goalContributionCount.count)).toBe(0);
  });


  it("returns a complete eligibility-aware group shape when reading and renaming", async () => {
    const current = await request(app).get("/group");
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      id: newSharedGroupId,
      isPrivate: false,
      canRecordSharedTransactions: false,
    });

    const renamed = await request(app).patch("/group").send({
      name: `Renamed shared group ${Date.now()}`,
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toMatchObject({
      id: newSharedGroupId,
      isPrivate: false,
      canRecordSharedTransactions: false,
    });
  });

  it("unlocks expenses and contributions as soon as a second member joins", async () => {
    await db.insert(groupMembershipsTable).values({
      groupId: newSharedGroupId,
      userId: secondMemberId,
      role: "member",
    });

    const expense = await request(app).post("/expenses").send({
      amount: 500,
      category: "Food",
      description: "Unlocked shared expense",
      paidById: ownerId,
      paidFromBank: false,
      isRecurring: false,
      date: "2026-08-21",
    });
    const monthlyContribution = await request(app).post("/contributions").send({
      amount: 500,
      month: 8,
      year: 2026,
    });
    const goalContribution = await request(app)
      .post(`/savings-goals/${goalId}/contribute`)
      .send({ amount: 500, userId: ownerId });
    const cascadeContribution = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 500, goalIds: [goalId] });

    expect(expense.status, JSON.stringify(expense.body)).toBe(201);
    expect(monthlyContribution.status, JSON.stringify(monthlyContribution.body)).toBe(201);
    expect(goalContribution.status, JSON.stringify(goalContribution.body)).toBe(200);
    expect(cascadeContribution.status, JSON.stringify(cascadeContribution.body)).toBe(200);
  });

  it("keeps one-person private budgets and legacy shared budgets usable", async () => {
    activeGroupId = privateGroupId;
    activeGroupIsPrivate = true;
    const privateContribution = await request(app).post("/contributions").send({
      amount: 500,
      month: 8,
      year: 2026,
    });
    expect(privateContribution.status, JSON.stringify(privateContribution.body)).toBe(201);

    activeGroupId = legacyGroupId;
    activeGroupIsPrivate = false;
    const legacyExpense = await request(app).post("/expenses").send({
      amount: 500,
      category: "Food",
      description: "Legacy shared expense",
      paidById: ownerId,
      paidFromBank: false,
      isRecurring: false,
      date: "2026-08-21",
    });
    expect(legacyExpense.status, JSON.stringify(legacyExpense.body)).toBe(201);
  });
});