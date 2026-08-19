/**
 * Unit tests for DELETE /savings-goals/:id
 *
 * Strategy: mock @workspace/db so that:
 *   - db.transaction() executes the callback with a mock tx
 *   - tx.select() locks the goal then checks for linked bank transfers
 *   - tx.delete().where() removes contribution rows after the guard passes
 *   - tx.delete().where().returning() removes the goal row
 *
 * The rollback test simulates a crash after contributions are deleted but
 * before the goal row is deleted.  Because db.transaction re-throws when the
 * callback throws (matching real Postgres rollback semantics), both deletes
 * are rolled back — no partial state is persisted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock @workspace/db
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const makeTable = (name: string) =>
    new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

  return {
    savingsGoalsTable: makeTable("savings_goals"),
    savingsGoalContributionsTable: makeTable("savings_goal_contributions"),
    jointAccountTxTable: makeTable("joint_account_transactions"),
    usersTable: makeTable("users"),
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
    eq: vi.fn((col, val) => ({ _eq: { col, val } })),
    sql: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({
      _sql: { strings, vals },
    })),
    desc: vi.fn((col) => ({ _desc: col })),
  };
});

import { db } from "@workspace/db";
import savingsGoalsRouter from "../savings-goals.js";

// ---------------------------------------------------------------------------
// Minimal express app
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

function makeGoal(id: number) {
  return {
    id,
    name: `Goal ${id}`,
    currentAmount: 100,
    targetAmount: 500,
    isCompleted: false,
    deadline: null,
    createdByUserId: 1,
    createdAt: new Date("2024-01-01"),
  };
}

/**
 * Build a mock tx for the DELETE handler:
 *
 *   First select locks the goal; second select checks linked bank transfers.
 *   Then tx.delete removes contribution rows and the goal.
 *
 * deleteContribImpl lets individual tests override the contribution-delete step.
 */
function makeDeleteTx(
  goalRow: ReturnType<typeof makeGoal> | null,
  deleteContribImpl: () => Promise<void> = () => Promise.resolve(),
  linkedTransfer = false,
) {
  let callCount = 0;

  const tx: Record<string, unknown> = {};
  let selectCallCount = 0;
  tx.select = vi.fn().mockImplementation(() => {
    selectCallCount += 1;
    const rows = selectCallCount === 1
      ? (goalRow ? [goalRow] : [])
      : (linkedTransfer ? [{ id: 99 }] : []);
    const terminal = {
      where: vi.fn().mockReturnValue({
        for: vi.fn().mockResolvedValue(rows),
        limit: vi.fn().mockResolvedValue(rows),
      }),
    };
    return { from: vi.fn().mockReturnValue(terminal) };
  });

  tx.delete = vi.fn().mockImplementation(() => {
    callCount += 1;
    const current = callCount;

    if (current === 1) {
      // First call: delete contributions — no .returning(), just .where()
      return {
        where: vi.fn().mockImplementation(deleteContribImpl),
      };
    } else {
      // Second call: delete goal — includes .returning()
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(goalRow ? [goalRow] : []),
        }),
      };
    }
  });

  return tx;
}

type MockTx = Record<string, unknown>;
type MockableDb = {
  transaction: ((cb: (tx: MockTx) => Promise<unknown>) => Promise<unknown>) & {
    mock: { results: Array<{ type: string; value: unknown }> };
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DELETE /savings-goals/:id", () => {
  const app = buildApp();
  const mockedDb = db as unknown as MockableDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path — both rows removed
  // -------------------------------------------------------------------------
  it("deletes contribution rows and the goal row together, returning { success: true }", async () => {
    const goal = makeGoal(7);
    const tx = makeDeleteTx(goal);

    mockedDb.transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app).delete("/savings-goals/7");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // tx.delete must have been called twice — once for contributions, once for goal.
    expect(tx.delete).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 404 — goal does not exist
  // -------------------------------------------------------------------------
  it("returns 404 when the goal row does not exist", async () => {
    const tx = makeDeleteTx(null);

    mockedDb.transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app).delete("/savings-goals/999");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Not found" });
  });

  it("refuses to delete a goal while a linked bank transfer exists", async () => {
    const tx = makeDeleteTx(makeGoal(8), undefined, true);
    mockedDb.transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app).delete("/savings-goals/8");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/linked bank transfers/i);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Rollback — crash after contribution delete, before goal delete
  // -------------------------------------------------------------------------
  it("rolls back entirely when a crash occurs after contributions are deleted but before the goal is deleted", async () => {
    const crashError = new Error("DB crash: disk full mid-transaction");

    // Override the contribution-delete step to throw.
    const tx = makeDeleteTx(makeGoal(3), async () => {
      throw crashError;
    });

    // db.transaction re-throws, which means the contribution delete is also
    // rolled back — no partial state is persisted.
    mockedDb.transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx));

    const res = await request(app).delete("/savings-goals/3");

    // Must NOT return 200 with partial data; must surface the error.
    expect(res.status).toBe(500);

    // The transaction callback threw, so the promise returned by db.transaction
    // must have rejected with the same error.
    const transactionCall = (
      mockedDb.transaction as ReturnType<typeof vi.fn>
    ).mock.results[0];
    expect(transactionCall.type).toBe("return");
    await expect(transactionCall.value).rejects.toThrow(
      "DB crash: disk full mid-transaction",
    );
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).delete("/savings-goals/abc");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a zero id", async () => {
    const res = await request(app).delete("/savings-goals/0");
    expect(res.status).toBe(400);
  });
});
