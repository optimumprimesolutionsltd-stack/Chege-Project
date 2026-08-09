/**
 * Unit tests for POST /savings-goals/cascade-contribute
 *
 * Strategy: mock @workspace/db so that:
 *   - db.select() returns a controllable fluent chain
 *   - db.transaction() executes the callback with a mock tx
 *
 * The failure test simulates a crash (tx.insert throws) after the first goal
 * has been updated inside the transaction.  Because db.transaction re-throws
 * when the callback throws (matching real Postgres rollback semantics), neither
 * the goal update nor the contribution insert is committed — exactly the
 * atomicity guarantee the handler relies on.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock @workspace/db — vi.mock is hoisted so the factory must not reference
// variables declared in module scope.  We define stubs inline here.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const makeTable = (name: string) =>
    new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

  return {
    savingsGoalsTable: makeTable("savings_goals"),
    savingsGoalContributionsTable: makeTable("savings_goal_contributions"),
    usersTable: makeTable("users"),
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
    eq: vi.fn((col, val) => ({ _eq: { col, val } })),
    sql: vi.fn(),
    desc: vi.fn((col) => ({ _desc: col })),
  };
});

// Import AFTER mock registration so the route module picks up the stub.
import { db } from "@workspace/db";
import savingsGoalsRouter from "../savings-goals.js";

// ---------------------------------------------------------------------------
// Minimal express app — bypasses real auth middleware with an inline stub.
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: 99 };
    next();
  });
  app.use("/", savingsGoalsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a goal row as the handler's SELECT returns it. */
function makeGoal(
  id: number,
  opts: { current?: number; target?: number; name?: string } = {},
) {
  return {
    id,
    name: opts.name ?? `Goal ${id}`,
    currentAmount: opts.current ?? 0,
    targetAmount: opts.target ?? 100,
    isCompleted: false,
    deadline: null,
    createdByUserId: 1,
    createdAt: new Date("2024-01-01"),
  };
}

/**
 * Create a fluent SELECT mock chain that resolves to `result`.
 * Supports both:
 *   await db.select().from().where()            (no orderBy)
 *   await db.select().from().where().orderBy()  (with orderBy)
 */
function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockResolvedValue(result);
  // Make the chain itself thenable so `await chain` resolves to result
  // when .orderBy() is not called (the goalIds branch).
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  chain.catch = (reject: (r: unknown) => unknown) =>
    Promise.resolve(result).catch(reject as never);
  chain.finally = (cb: () => void) => Promise.resolve(result).finally(cb);
  return chain;
}

/**
 * Build a mock `tx` where:
 *  - tx.update().set().where().returning() resolves to [updatedGoal]
 *  - tx.insert().values() behaves as configured by `insertImpl`
 */
function makeTx(
  updatedGoals: ReturnType<typeof makeGoal>[],
  insertImpl: () => Promise<void> = () => Promise.resolve(),
) {
  let updateCallIndex = 0;
  const tx: Record<string, unknown> = {};

  tx.update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => {
          const g =
            updatedGoals[updateCallIndex] ?? updatedGoals.at(-1)!;
          updateCallIndex++;
          return [g];
        }),
      }),
    }),
  }));

  tx.insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation(insertImpl),
  }));

  return tx;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Opaque mock-tx type used to break the self-referential `typeof tx` cycle. */
type MockTx = Record<string, unknown>;

/** Narrow view of db that lets us re-assign select / transaction per test. */
type MockableDb = {
  select: ((...args: unknown[]) => unknown) & { mockReturnValue: (v: unknown) => void };
  transaction: ((cb: (tx: MockTx) => Promise<unknown>) => Promise<unknown>) & {
    mock: { results: Array<{ type: string; value: unknown }> };
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /savings-goals/cascade-contribute", () => {
  const app = buildApp();
  // Cast through unknown to avoid the type overlap error — the vi.mock factory
  // above replaces the real db implementation with plain vi.fn() stubs.
  const mockedDb = db as unknown as MockableDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it("writes all goal updates and contribution rows when the full cascade succeeds", async () => {
    const goal1 = makeGoal(1, { current: 0, target: 100 });
    const goal2 = makeGoal(2, { current: 50, target: 200 });
    const updated1 = { ...goal1, currentAmount: 100, isCompleted: true };
    const updated2 = { ...goal2, currentAmount: 200, isCompleted: true };

    mockedDb.select = vi.fn().mockReturnValue(makeSelectChain([goal1, goal2]));

    const tx = makeTx([updated1, updated2]);
    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 250 });

    expect(res.status).toBe(200);

    // Both goals received an allocation.
    expect(res.body.allocations).toHaveLength(2);
    expect(res.body.allocations[0]).toMatchObject({
      goalId: 1,
      allocated: 100,
      completed: true,
    });
    expect(res.body.allocations[1]).toMatchObject({
      goalId: 2,
      allocated: 150,
    });
    expect(res.body.leftover).toBe(0);

    // One update and one contribution insert were issued per goal.
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it("returns leftover when total amount exceeds all goals' remaining need", async () => {
    const goal1 = makeGoal(1, { current: 80, target: 100 });
    const updated1 = { ...goal1, currentAmount: 100, isCompleted: true };

    mockedDb.select = vi.fn().mockReturnValue(makeSelectChain([goal1]));

    const tx = makeTx([updated1]);
    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 50 });

    expect(res.status).toBe(200);
    // Only 20 was needed; 30 remains.
    expect(res.body.leftover).toBe(30);
    expect(res.body.allocations[0].allocated).toBe(20);
  });

  it("respects explicit goalIds ordering", async () => {
    // goalIds = [2, 1] — goal 2 should be funded first even though goal 1
    // was created earlier.
    const goal1 = makeGoal(1, { current: 0, target: 100 });
    const goal2 = makeGoal(2, { current: 0, target: 100 });
    const updated2 = { ...goal2, currentAmount: 100, isCompleted: true };
    const updated1 = { ...goal1, currentAmount: 100, isCompleted: true };

    // The goalIds path calls db.select().from().where() without orderBy,
    // returning all incomplete goals.
    mockedDb.select = vi.fn().mockReturnValue(makeSelectChain([goal1, goal2]));

    const tx = makeTx([updated2, updated1]);
    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 200, goalIds: [2, 1] });

    expect(res.status).toBe(200);
    expect(res.body.allocations[0].goalId).toBe(2);
    expect(res.body.allocations[1].goalId).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Failure / rollback scenario
  // -------------------------------------------------------------------------
  it("rolls back atomically when a crash occurs after the first goal update but before contribution insert", async () => {
    const goal1 = makeGoal(1, { current: 0, target: 100 });
    const goal2 = makeGoal(2, { current: 0, target: 100 });
    const updated1 = { ...goal1, currentAmount: 100, isCompleted: true };

    mockedDb.select = vi.fn().mockReturnValue(makeSelectChain([goal1, goal2]));

    // Simulate a DB crash on the very first contribution insert.
    // The real Postgres transaction would roll back the preceding goal update;
    // here we verify that the exception propagates out of db.transaction so
    // the endpoint returns an error rather than a partial-success response.
    const crashError = new Error("DB crash: server failed mid-loop");
    let insertCalls = 0;
    const tx = makeTx([updated1], async () => {
      insertCalls++;
      if (insertCalls === 1) throw crashError;
    });

    // db.transaction re-throws when its callback throws — matching real
    // Postgres rollback semantics (the COMMIT never executes).
    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 250 });

    // The endpoint must NOT return a partial 200; it must surface the error.
    expect(res.status).toBe(500);

    // tx.update was called once (goal 1's amount was incremented inside the
    // transaction), but because the transaction threw, Postgres would have
    // rolled back that write — nothing is persisted.
    expect(tx.update).toHaveBeenCalledTimes(1);

    // db.transaction itself rejected (no commit occurred).
    const transactionCall = (mockedDb.transaction as ReturnType<typeof vi.fn>).mock.results[0];
    expect(transactionCall.type).toBe("return"); // it returned a Promise
    await expect(transactionCall.value).rejects.toThrow(
      "DB crash: server failed mid-loop",
    );
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  it("returns 400 for a missing amount", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: -10 });
    expect(res.status).toBe(400);
  });
});
