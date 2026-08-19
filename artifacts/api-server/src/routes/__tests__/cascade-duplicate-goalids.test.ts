/**
 * Regression test: POST /savings-goals/cascade-contribute must reject
 * duplicate goalIds with a 400 before touching the database.
 *
 * Background
 * ----------
 * A request with goalIds: [1, 1] (or any repeated ID) would previously pass
 * validation and enter db.transaction. Inside, the handler fetches rows by ID
 * from a de-duplicated map, so goal 1 would only be selected once — but the
 * caller-supplied array still drives the per-goal update/insert loop, meaning
 * goal 1 would be updated and funded twice, silently overfunding it and
 * inserting duplicate contribution history rows.
 *
 * Invariants under test
 * ---------------------
 * 1. A request with duplicate goalIds returns 400.
 * 2. db.transaction, tx.update, and tx.insert are never invoked.
 * 3. Unique goalIds (no duplicates) and omitted goalIds are unaffected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock @workspace/db — same minimal shape as cascade-contribute.test.ts
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const makeTable = (name: string) =>
    new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

  return {
    savingsGoalsTable: makeTable("savings_goals"),
    savingsGoalContributionsTable: makeTable("savings_goal_contributions"),
    usersTable: makeTable("users"),
    membersTable: makeTable("members"),
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
    },
    eq: vi.fn((col, val) => ({ _eq: { col, val } })),
    sql: vi.fn(),
    desc: vi.fn((col) => ({ _desc: col })),
    and: vi.fn(),
  };
});

import { db } from "@workspace/db";
import savingsGoalsRouter from "../savings-goals.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "authed-user" };
    next();
  });
  app.use("/", savingsGoalsRouter);
  return app;
}

const app = buildApp();

type MockableDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};
const mockedDb = db as unknown as MockableDb;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: wire a successful cascade so we can confirm it works for the
// positive (non-duplicate) cases.
// ---------------------------------------------------------------------------
function wireSuccessfulCascade(goals: { id: number; currentAmount: number; targetAmount: number; name: string; isCompleted: boolean }[]) {
  let updateIdx = 0;
  mockedDb.transaction = vi.fn().mockImplementation(
    async (cb: (tx: any) => Promise<unknown>) => {
      const selectChain: Record<string, unknown> = {};
      selectChain.from    = vi.fn().mockReturnValue(selectChain);
      selectChain.where   = vi.fn().mockReturnValue(selectChain);
      selectChain.orderBy = vi.fn().mockReturnValue(selectChain);
      selectChain.for     = vi.fn().mockResolvedValue(goals);

      const tx = {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockImplementation(async () => {
                const g = goals[updateIdx] ?? goals[goals.length - 1];
                updateIdx++;
                return [{ ...g }];
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return cb(tx);
    },
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe("cascade-contribute: duplicate goalIds are rejected before the transaction", () => {
  it("returns 400 when goalIds contains a repeated ID [1, 1]", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 500, goalIds: [1, 1] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });

  it("returns 400 when goalIds contains three IDs with one repeated [2, 3, 2]", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 300, goalIds: [2, 3, 2] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });

  it("db.transaction is never called for duplicate goalIds", async () => {
    await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 100, goalIds: [5, 5] });

    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("db.insert is never called for duplicate goalIds", async () => {
    await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 100, goalIds: [5, 5] });

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});

describe("cascade-contribute: unique goalIds and omitted goalIds still work", () => {
  it("unique goalIds [1, 2] proceeds normally and returns 200", async () => {
    const goals = [
      { id: 1, name: "A", currentAmount: 0, targetAmount: 1_000, isCompleted: false, deadline: null, createdByUserId: null, createdAt: new Date() },
      { id: 2, name: "B", currentAmount: 0, targetAmount: 1_000, isCompleted: false, deadline: null, createdByUserId: null, createdAt: new Date() },
    ];
    wireSuccessfulCascade(goals);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 200, goalIds: [1, 2] });

    expect(res.status).toBe(200);
    expect(mockedDb.transaction).toHaveBeenCalledOnce();
  });

  it("omitted goalIds proceeds normally and returns 200", async () => {
    const goals = [
      { id: 1, name: "A", currentAmount: 0, targetAmount: 1_000, isCompleted: false, deadline: null, createdByUserId: null, createdAt: new Date() },
    ];
    wireSuccessfulCascade(goals);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 100 });

    expect(res.status).toBe(200);
    expect(mockedDb.transaction).toHaveBeenCalledOnce();
  });

  it("a single goalId [3] (trivially unique) proceeds normally and returns 200", async () => {
    const goals = [
      { id: 3, name: "C", currentAmount: 0, targetAmount: 5_000, isCompleted: false, deadline: null, createdByUserId: null, createdAt: new Date() },
    ];
    wireSuccessfulCascade(goals);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 50, goalIds: [3] });

    expect(res.status).toBe(200);
    expect(mockedDb.transaction).toHaveBeenCalledOnce();
  });
});
