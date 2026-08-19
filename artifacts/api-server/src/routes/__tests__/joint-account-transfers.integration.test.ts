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
  jointAccountTxTable,
  savingsGoalContributionsTable,
  savingsGoalsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import jointAccountRouter from "../joint-account.js";

const hasDb = !!process.env.DATABASE_URL;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "transfer-integration-user" };
    next();
  });
  app.use("/", jointAccountRouter);
  return app;
}

describe.skipIf(!hasDb)("linked bank and savings transfers (integration)", () => {
  const app = buildApp();
  let goalId: number;

  beforeAll(async () => {
    const [goal] = await db
      .insert(savingsGoalsTable)
      .values({
        name: `Transfer Integration Goal ${Date.now()}`,
        targetAmount: 10_000,
        currentAmount: 1_000,
        createdByUserId: "transfer-integration-user",
        isCompleted: false,
      })
      .returning();
    goalId = goal.id;
  });

  afterAll(async () => {
    if (goalId) {
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.savingsGoalId, goalId));
      await db.delete(savingsGoalContributionsTable).where(eq(savingsGoalContributionsTable.goalId, goalId));
      await db.delete(savingsGoalsTable).where(eq(savingsGoalsTable.id, goalId));
    }
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
});