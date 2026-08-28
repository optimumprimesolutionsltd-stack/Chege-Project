/**
 * Real-Postgres coverage for linked joint-bank <-> savings-goal transfers.
 * The suite skips when DATABASE_URL is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  db,
  pool,
  groupMembershipsTable,
  incomeSourcesTable,
  jointAccountDepositSplitsTable,
  groupsTable,
  jointAccountTxTable,
  savingsGoalContributionsTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import jointAccountRouter from "../joint-account.js";

const hasDb = !!process.env.DATABASE_URL;
const TEST_USER_ID = "transfer-integration-user";
const TEST_MEMBER_ID = "transfer-integration-member";
let testGroupId: number;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: TEST_USER_ID };
    req.group = { id: testGroupId, role: req.header("x-test-role") === "member" ? "member" : "owner" };
    next();
  });
  app.use("/", jointAccountRouter);
  return app;
}

describe.skipIf(!hasDb)("linked bank and savings transfers (integration)", () => {
  const app = buildApp();
  let goalId: number;
  let secondGoalId: number;
  let ownerIncomeSourceId: number;

  beforeAll(async () => {
    await db.insert(usersTable).values({
      id: TEST_USER_ID,
      firstName: "Transfer",
      lastName: "Tester",
    }).onConflictDoNothing();
    await db.insert(usersTable).values({
      id: TEST_MEMBER_ID,
      firstName: "Member",
      lastName: "Tester",
    }).onConflictDoNothing();
    const [group] = await db.insert(groupsTable).values({
      name: `Transfer test group ${Date.now()}`,
      legacyKey: `transfer-test-${Date.now()}`,
      createdByUserId: TEST_USER_ID,
    }).returning();
    testGroupId = group.id;
    await db.insert(groupMembershipsTable).values({
      groupId: testGroupId,
      userId: TEST_USER_ID,
      role: "owner",
    });
    await db.insert(groupMembershipsTable).values({
      groupId: testGroupId,
      userId: TEST_MEMBER_ID,
      role: "member",
    });
    const [goal, secondGoal] = await db
      .insert(savingsGoalsTable)
      .values([
        {
          groupId: testGroupId,
          name: `Transfer Integration Goal ${Date.now()}`,
          targetAmount: 10_000,
          currentAmount: 1_000,
          createdByUserId: TEST_USER_ID,
          isCompleted: false,
        },
        {
          groupId: testGroupId,
          name: `Second Transfer Goal ${Date.now()}`,
          targetAmount: 10_000,
          currentAmount: 500,
          createdByUserId: TEST_USER_ID,
          isCompleted: false,
        },
      ])
      .returning();
    goalId = goal.id;
    secondGoalId = secondGoal.id;
    const [incomeSource] = await db.insert(incomeSourcesTable).values({
      groupId: testGroupId,
      userId: TEST_USER_ID,
      name: `Transfer test income ${Date.now()}`,
      expectedMonthlyAmount: 1_000,
    }).returning();
    ownerIncomeSourceId = incomeSource.id;
  });

  afterAll(async () => {
    if (testGroupId) {
      await db.delete(jointAccountDepositSplitsTable).where(eq(jointAccountDepositSplitsTable.groupId, testGroupId));
      await db.delete(savingsGoalContributionsTable).where(eq(savingsGoalContributionsTable.groupId, testGroupId));
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, testGroupId));
      await db.delete(incomeSourcesTable).where(eq(incomeSourcesTable.groupId, testGroupId));
      await db.delete(savingsGoalsTable).where(eq(savingsGoalsTable.groupId, testGroupId));
    }
    await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, testGroupId));
    await db.delete(groupsTable).where(eq(groupsTable.id, testGroupId));
    await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
    await db.delete(usersTable).where(eq(usersTable.id, TEST_MEMBER_ID));
    await pool.end();
  });

  it("creates both directions and reverses each transfer without changing ordinary spending", async () => {
    const toSavings = await request(app)
      .post("/joint-account/transfers/to-savings")
      .send({ amount: 500, goalId, narration: "Set aside", date: "2026-08-19" });
    expect(toSavings.status).toBe(201);
    expect(toSavings.body.expenseCategory).toBeNull();

    const fromSavings = await request(app)
      .post("/joint-account/transfers/from-savings")
      .send({ amount: 200, goalId, narration: "Cover groceries", date: "2026-08-19" });
    expect(fromSavings.status).toBe(201);
    expect(fromSavings.body.incomeSourceId).toBeNull();

    let [goal] = await db
      .select({ currentAmount: savingsGoalsTable.currentAmount })
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    expect(goal.currentAmount).toBe(1_300);

    expect((await request(app).delete(`/joint-account/${fromSavings.body.id}`)).status).toBe(200);
    expect((await request(app).delete(`/joint-account/${toSavings.body.id}`)).status).toBe(200);

    [goal] = await db
      .select({ currentAmount: savingsGoalsTable.currentAmount })
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    expect(goal.currentAmount).toBe(1_000);
  });

  it("serializes concurrent deletion so the goal is reversed exactly once", async () => {
    const created = await request(app)
      .post("/joint-account/transfers/to-savings")
      .send({ amount: 300, goalId, narration: "Concurrent reversal", date: "2026-08-19" });
    expect(created.status).toBe(201);

    const responses = await Promise.all([
      request(app).delete(`/joint-account/${created.body.id}`),
      request(app).delete(`/joint-account/${created.body.id}`),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 404]);

    const [goal] = await db
      .select({ currentAmount: savingsGoalsTable.currentAmount })
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    expect(goal.currentAmount).toBe(1_000);

    const contributions = await db
      .select()
      .from(savingsGoalContributionsTable)
      .where(eq(savingsGoalContributionsTable.bankTransactionId, created.body.id));
    expect(contributions).toHaveLength(0);
  });

  it("atomically moves an edited transfer between goals and can reverse its direction", async () => {
    const created = await request(app)
      .post("/joint-account/transfers/to-savings")
      .send({ amount: 300, goalId, narration: "Original", date: "2026-08-20" });
    expect(created.status).toBe(201);

    const edited = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 200,
        date: "2026-08-21",
        madeById: null,
        transferDirection: "from_savings",
        goalId: secondGoalId,
        narration: "Reassigned",
      });
    expect(edited.status).toBe(200);
    expect(edited.body.transferDirection).toBe("from_savings");
    expect(edited.body.savingsGoalId).toBe(secondGoalId);
    expect(edited.body.type).toBe("deposit");

    const goals = await db.select().from(savingsGoalsTable);
    expect(goals.find((goal) => goal.id === goalId)?.currentAmount).toBe(1_000);
    expect(goals.find((goal) => goal.id === secondGoalId)?.currentAmount).toBe(300);

    const [linked] = await db
      .select()
      .from(savingsGoalContributionsTable)
      .where(eq(savingsGoalContributionsTable.bankTransactionId, created.body.id));
    expect(linked.goalId).toBe(secondGoalId);
    expect(linked.amount).toBe(-200);
    expect(linked.note).toContain("Reassigned");
  });

  it("rejects member transfer edits and leaves both balances unchanged after an invalid edit", async () => {
    const created = await request(app)
      .post("/joint-account/transfers/to-savings")
      .send({ amount: 100, goalId, narration: "Protected", date: "2026-08-22" });
    expect(created.status).toBe(201);

    const before = await db.select().from(savingsGoalsTable);
    const denied = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .set("x-test-role", "member")
      .send({
        amount: 50,
        date: "2026-08-22",
        transferDirection: "to_savings",
        goalId,
        narration: "Not allowed",
      });
    expect(denied.status).toBe(403);

    const invalid = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 50_000,
        date: "2026-08-22",
        transferDirection: "to_savings",
        goalId: secondGoalId,
        narration: "Too much",
      });
    expect(invalid.status).toBe(400);
    const after = await db.select().from(savingsGoalsTable);
    expect(after.map((goal) => [goal.id, goal.currentAmount])).toEqual(
      before.map((goal) => [goal.id, goal.currentAmount]),
    );
  });

  it("replaces a split deposit atomically and supports changing it back to one depositor", async () => {
    const created = await request(app)
      .post("/joint-account/deposit")
      .send({
        amount: 300,
        description: "Split",
        date: "2026-08-23",
        contributorSplits: [
          { userId: TEST_USER_ID, amount: 100, incomeSourceId: ownerIncomeSourceId },
          { userId: TEST_MEMBER_ID, amount: 200 },
        ],
      });
    expect(created.status).toBe(201);

    const edited = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 400,
        description: "Corrected split",
        date: "2026-08-24",
        contributorSplits: [
          { userId: TEST_USER_ID, amount: 250, incomeSourceId: ownerIncomeSourceId },
          { userId: TEST_MEMBER_ID, amount: 150 },
        ],
      });
    expect(edited.status).toBe(200);
    expect(edited.body.contributorSplits.map((split: { amount: number }) => split.amount).sort()).toEqual([150, 250]);
    expect(
      edited.body.contributorSplits.find((split: { userId: string }) => split.userId === TEST_USER_ID).incomeSourceId,
    ).toBe(ownerIncomeSourceId);

    const omittedSplits = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 500,
        description: "Unsafe total-only correction",
        date: "2026-08-24",
      });
    expect(omittedSplits.status).toBe(400);
    const [unchangedTx] = await db
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, created.body.id));
    const unchangedSplits = await db
      .select()
      .from(jointAccountDepositSplitsTable)
      .where(eq(jointAccountDepositSplitsTable.transactionId, created.body.id));
    expect(unchangedTx.amount).toBe(400);
    expect(unchangedSplits.reduce((sum, split) => sum + split.amount, 0)).toBe(400);

    const single = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 400,
        description: "Now one depositor",
        date: "2026-08-24",
        madeById: TEST_USER_ID,
        contributorSplits: [],
      });
    expect(single.status).toBe(200);
    expect(single.body.madeById).toBe(TEST_USER_ID);
    expect(single.body.contributorSplits).toEqual([]);
  });

  it("does not change a transfer when its linked savings history is missing", async () => {
    const created = await request(app)
      .post("/joint-account/transfers/to-savings")
      .send({ amount: 175, goalId, narration: "Needs linked history", date: "2026-08-25" });
    expect(created.status).toBe(201);

    await db
      .delete(savingsGoalContributionsTable)
      .where(eq(savingsGoalContributionsTable.bankTransactionId, created.body.id));
    const [beforeGoal] = await db
      .select()
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    const [beforeTx] = await db
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, created.body.id));

    const response = await request(app)
      .put(`/joint-account/${created.body.id}`)
      .send({
        amount: 250,
        date: "2026-08-26",
        transferDirection: "to_savings",
        goalId,
        narration: "Must not be applied",
      });
    expect(response.status).toBe(409);

    const [afterGoal] = await db
      .select()
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, goalId));
    const [afterTx] = await db
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, created.body.id));
    expect(afterGoal.currentAmount).toBe(beforeGoal.currentAmount);
    expect(afterTx.amount).toBe(beforeTx.amount);
    expect(afterTx.description).toBe(beforeTx.description);
  });

  it("returns not found instead of editing a transaction from another workspace", async () => {
    const [otherGroup] = await db.insert(groupsTable).values({
      name: `Other transfer group ${Date.now()}`,
      legacyKey: `other-transfer-test-${Date.now()}`,
      createdByUserId: TEST_USER_ID,
    }).returning();
    const [foreignTx] = await db.insert(jointAccountTxTable).values({
      groupId: otherGroup.id,
      type: "deposit",
      amount: 90,
      description: "Other workspace",
      date: "2026-08-27",
      madeById: TEST_USER_ID,
    }).returning();

    const response = await request(app)
      .put(`/joint-account/${foreignTx.id}`)
      .send({
        amount: 100,
        description: "Should stay isolated",
        date: "2026-08-27",
        madeById: TEST_USER_ID,
      });
    expect(response.status).toBe(404);

    const [unchanged] = await db
      .select()
      .from(jointAccountTxTable)
      .where(eq(jointAccountTxTable.id, foreignTx.id));
    expect(unchanged.amount).toBe(90);
    expect(unchanged.description).toBe("Other workspace");

    await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.id, foreignTx.id));
    await db.delete(groupsTable).where(eq(groupsTable.id, otherGroup.id));
  });
});