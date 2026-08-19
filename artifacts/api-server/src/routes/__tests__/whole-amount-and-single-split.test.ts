/**
 * Integrity tests for issue #187 current round:
 *
 * 1. Whole-KES enforcement — decimal amounts are rejected (400) on the joint
 *    deposit/disbursement routes, the single-goal contribute route, and the
 *    cascade-contribute route (both total amount and per-split amounts). DB
 *    columns are integer; accepting decimals would silently truncate money.
 *
 * 2. Single-goal contributorSplits — POST /savings-goals/:id/contribute now
 *    accepts an optional contributorSplits array recorded atomically in one
 *    transaction:
 *      - each split becomes its own contribution row
 *      - the inserted rows sum exactly to the applied (possibly capped) amount
 *      - split sums that don't equal `amount` are rejected (400)
 *      - unknown member IDs are rejected (400)
 *      - combining userId + contributorSplits is rejected as ambiguous (400)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock @workspace/db (shared shape for savings-goals + joint-account routers)
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const makeTable = (name: string) =>
    new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

  return {
    savingsGoalsTable: makeTable("savings_goals"),
    savingsGoalContributionsTable: makeTable("savings_goal_contributions"),
    jointAccountTxTable: makeTable("joint_account_tx"),
    usersTable: makeTable("users"),
    membersTable: makeTable("members"),
    groupMembershipsTable: makeTable("group_memberships"),
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
      query: {
        usersTable: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    },
    eq: vi.fn((col, val) => ({ _eq: { col, val } })),
    sql: vi.fn(),
    desc: vi.fn((col) => ({ _desc: col })),
    and: vi.fn(),
  };
});

import { db } from "@workspace/db";
import savingsGoalsRouter from "../savings-goals.js";
import jointAccountRouter from "../joint-account.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "authed-user" };
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", savingsGoalsRouter);
  app.use("/", jointAccountRouter);
  return app;
}

const app = buildApp();

type MockableDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};
const mockedDb = db as unknown as MockableDb;

interface InsertedRow {
  goalId: number;
  amount: number;
  createdByUserId: string | null;
  note?: string | null;
}

function makeGoal(id: number, opts: { target?: number; current?: number } = {}) {
  return {
    id,
    name: `Goal ${id}`,
    currentAmount: opts.current ?? 0,
    targetAmount: opts.target ?? 100_000,
    isCompleted: false,
    deadline: null,
    createdByUserId: "owner",
    createdAt: new Date(),
  };
}

/** Member-validation lookup always succeeds (non-null IDs resolve to a member). */
function wireValidMembers() {
  mockedDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ userId: "any" }]),
      }),
    }),
  }));
}

/** Member-validation lookup always fails (unknown member). */
function wireUnknownMembers() {
  mockedDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  }));
}

/**
 * Wire the single-goal contribute transaction (SELECT ... FOR UPDATE, UPDATE
 * ... RETURNING, then one or more INSERTs), capturing inserted rows. The goal's
 * cap drives the applied amount just like production.
 */
function wireSingleContribute(goal: ReturnType<typeof makeGoal>, inserted: InsertedRow[]) {
  mockedDb.transaction = vi.fn().mockImplementation(
    async (cb: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([goal]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ ...goal }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: InsertedRow) => {
            inserted.push({ ...vals });
            return Promise.resolve();
          }),
        }),
      };
      return cb(tx);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. Whole-KES enforcement
// ===========================================================================
describe("whole-KES enforcement — decimal amounts rejected", () => {
  it("joint deposit with decimal amount → 400", async () => {
    const res = await request(app)
      .post("/joint-account/deposit")
      .send({ amount: 100.5, description: "x", date: "2024-01-01" });
    expect(res.status).toBe(400);
    // Transaction/insert must never run for an invalid payload.
    expect(mockedDb.transaction).not.toHaveBeenCalled();
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it("joint disbursement with decimal amount → 400", async () => {
    const res = await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 0.99, description: "x", date: "2024-01-01" });
    expect(res.status).toBe(400);
  });

  it("single-goal contribute with decimal amount → 400", async () => {
    wireValidMembers();
    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({ amount: 50.25 });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("cascade-contribute with decimal total → 400", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 10.5 });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("cascade-contribute with decimal split amount → 400", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "a", amount: 4.5 },
          { userId: "b", amount: 5.5 },
        ],
      });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("single-goal contribute with decimal split amount → 400", async () => {
    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "a", amount: 4.5 },
          { userId: "b", amount: 5.5 },
        ],
      });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Single-goal contributorSplits
// ===========================================================================
describe("POST /savings-goals/:id/contribute — contributorSplits", () => {
  it("records one row per split, summing exactly to amount (no capping)", async () => {
    const goal = makeGoal(1, { target: 100_000, current: 0 });
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireSingleContribute(goal, inserted);

    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 100,
        note: "rent",
        contributorSplits: [
          { userId: "alice", amount: 60 },
          { userId: "bob", amount: 40 },
        ],
      });

    expect(res.status).toBe(200);
    const total = inserted.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(100);
    expect(inserted.length).toBe(2);
    // Note carried to every split row.
    for (const row of inserted) expect(row.note).toBe("rent");
    const byUser = Object.fromEntries(inserted.map((r) => [r.createdByUserId, r.amount]));
    expect(byUser["alice"]).toBe(60);
    expect(byUser["bob"]).toBe(40);
  });

  it("capped applied amount distributes exactly across splits", async () => {
    // Goal needs only 10 KES (current 90 of 100) but request is 100.
    const goal = makeGoal(1, { target: 100, current: 90 });
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireSingleContribute(goal, inserted);

    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 100,
        contributorSplits: [
          { userId: "alice", amount: 50 },
          { userId: "bob", amount: 50 },
        ],
      });

    expect(res.status).toBe(200);
    // Only 10 KES applied → rows sum to 10, not 100.
    const total = inserted.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(10);
    // 50/50 of 10 → 5 + 5.
    const amounts = inserted.map((r) => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([5, 5]);
  });

  it("single Joint-bank split records a null-attributed row", async () => {
    const goal = makeGoal(1, { target: 100_000, current: 0 });
    const inserted: InsertedRow[] = [];
    wireUnknownMembers(); // not consulted for null userId
    wireSingleContribute(goal, inserted);

    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({ amount: 20, contributorSplits: [{ userId: null, amount: 20 }] });

    expect(res.status).toBe(200);
    expect(inserted.length).toBe(1);
    expect(inserted[0].amount).toBe(20);
    expect(inserted[0].createdByUserId).toBeNull();
  });

  it("split sum ≠ amount → 400, no transaction", async () => {
    wireValidMembers();
    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 100,
        contributorSplits: [
          { userId: "alice", amount: 60 },
          { userId: "bob", amount: 30 },
        ],
      });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("unknown member ID in split → 400, no transaction", async () => {
    wireUnknownMembers();
    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 100,
        contributorSplits: [{ userId: "ghost", amount: 100 }],
      });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("userId + contributorSplits together → 400 ambiguous, no transaction", async () => {
    wireValidMembers();
    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({
        amount: 100,
        userId: "alice",
        contributorSplits: [{ userId: "alice", amount: 100 }],
      });
    expect(res.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("backward compatible: named userId still records a single attributed row", async () => {
    const goal = makeGoal(1, { target: 100_000, current: 0 });
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireSingleContribute(goal, inserted);

    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({ amount: 30, userId: "alice" });

    expect(res.status).toBe(200);
    expect(inserted.length).toBe(1);
    expect(inserted[0].amount).toBe(30);
    expect(inserted[0].createdByUserId).toBe("alice");
  });

  it("backward compatible: omitted userId records a Joint-bank (null) row", async () => {
    const goal = makeGoal(1, { target: 100_000, current: 0 });
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireSingleContribute(goal, inserted);

    const res = await request(app)
      .post("/savings-goals/1/contribute")
      .send({ amount: 30 });

    expect(res.status).toBe(200);
    expect(inserted.length).toBe(1);
    expect(inserted[0].createdByUserId).toBeNull();
  });
});
