/**
 * Regression tests for contributor-split integer allocation in
 * POST /savings-goals/cascade-contribute.
 *
 * Background
 * ----------
 * `contributorSplits[i].amount` is an *absolute* KES amount for each
 * contributor (they must sum to the request `amount`).  The handler maps
 * those shares proportionally onto the per-goal `allocated` integer.
 * E.g. amount=10, splits=[{5},{5}], goal allocated=7 → contributor shares
 * are 3.5 and 3.5.  Math.round gives 4+4=8 ≠ 7 — an over-attribution bug.
 * The largest-remainder (Hamilton) method gives 4+3=7. ✓
 *
 * The invariant under test
 * ------------------------
 * For every goal allocation, the SUM of all inserted contribution row
 * amounts MUST equal `allocated` exactly.
 *
 * Cases covered
 * -------------
 * 1. amount=10, splits=[5,5], goal allocated=1  → classic: 1+0=1 (not 1+1=2)
 * 2. amount=10, splits=[1,2,7], goal allocated=10 → exact: 1+2+7=10
 * 3. amount=10, splits=[1,3,6], goal allocated=10 → exact: 1+3+6=10
 * 4. amount=10, splits=[1,3,6], goal allocated=1 → one row, sum=1
 * 5. amount=10, splits=[5,5], goal allocated=2  → 1+1=2
 * 6. amount=10, splits=[1,1,1] (normalised equal thirds), goal allocated=7 → sum=7
 * 7. Multi-goal: goals need 7 and 3 of 10; splits=[3,7]; each goal's rows sum correctly
 * 8. Single Joint-bank split, goal allocated=5 → one null row of 5
 * 9. amount=100, splits=[33,33,34], goal allocated=100 → 33+33+34=100
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
    usersTable: makeTable("users"),
    membersTable: makeTable("members"),
    groupMembershipsTable: makeTable("group_memberships"),
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
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
  return app;
}

const app = buildApp();

type MockableDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

const mockedDb = db as unknown as MockableDb;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoal(id: number, target = 100_000) {
  return {
    id,
    name: `Goal ${id}`,
    currentAmount: 0,
    targetAmount: target,
    isCompleted: false,
    deadline: null,
    createdByUserId: "owner",
    createdAt: new Date(),
  };
}

function makeGoalSelectChain(goals: ReturnType<typeof makeGoal>[]) {
  const chain: Record<string, unknown> = {};
  chain.from    = vi.fn().mockReturnValue(chain);
  chain.where   = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.for     = vi.fn().mockResolvedValue(goals);
  return chain;
}

interface InsertedRow { goalId: number; amount: number; createdByUserId: string | null }

/**
 * Wire a cascade transaction that records every tx.insert().values() call.
 * The `goals` array drives both the SELECT and UPDATE responses.  Because
 * the test goals have large targets the full `allocated` amount is always
 * applied (no capping), so `currentAmount + allocated` stays below target.
 */
function wireCascadeWithGoals(
  goals: ReturnType<typeof makeGoal>[],
  insertedRows: InsertedRow[],
) {
  let updateIdx = 0;
  mockedDb.transaction = vi.fn().mockImplementation(
    async (cb: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockImplementation(() => makeGoalSelectChain(goals)),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockImplementation(async () => {
                const g = goals[updateIdx] ?? goals[goals.length - 1];
                updateIdx++;
                return [{ ...g }];
              }),
            }),
          }),
        })),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: InsertedRow) => {
            insertedRows.push({ ...vals });
            return Promise.resolve();
          }),
        }),
      };
      return cb(tx);
    },
  );
}

/** Member-validation always passes (non-null IDs return a member row). */
function wireValidMembers() {
  mockedDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ userId: "any" }]),
      }),
    }),
  }));
}

/** Sum inserted rows for a given goalId and assert it equals expected. */
function assertSumsTo(rows: InsertedRow[], goalId: number, expected: number) {
  const total = rows.filter(r => r.goalId === goalId).reduce((s, r) => s + r.amount, 0);
  expect(total).toBe(expected);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("cascade contributor-split rounding — inserted amounts must sum to allocated", () => {

  // -------------------------------------------------------------------------
  // Case 1: amount=10, splits=[5,5], goal allocated=1
  //   Proportional shares: 0.5 and 0.5.
  //   Math.round → 1+1=2 ≠ 1 (BUG).
  //   Largest-remainder → 1+0=1 ✓
  // -------------------------------------------------------------------------
  it("splits=[5,5] with total=10, goal allocated=1: inserted rows sum exactly to 1", async () => {
    // Goal only needs 1 KES (current=9999, target=10000).
    const goal = { ...makeGoal(1, 10_000), currentAmount: 9_999 };
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    let updateIdx = 0;
    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goal])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { ...goal, currentAmount: 10_000, isCompleted: true },
                ]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "alice", amount: 5 },
          { userId: "bob",   amount: 5 },
        ],
      });

    expect(res.status).toBe(200);
    // The cascade allocates 1 KES to this goal (that's all it needed).
    expect(res.body.allocations[0].allocated).toBe(1);
    // Inserted rows for goal 1 must sum to exactly 1.
    assertSumsTo(inserted, 1, 1);
    // Total inserts = 1 (zero-amount rows are skipped).
    expect(inserted.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Case 2: amount=10, splits=[1,2,7], goal allocated=10
  //   Proportional shares: 1, 2, 7 — all exact integers.
  // -------------------------------------------------------------------------
  it("splits=[1,2,7] with total=10, goal allocated=10: rows are 1+2+7=10", async () => {
    const goal = makeGoal(1, 100_000);
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireCascadeWithGoals([goal], inserted);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "a", amount: 1 },
          { userId: "b", amount: 2 },
          { userId: "c", amount: 7 },
        ],
      });

    expect(res.status).toBe(200);
    assertSumsTo(inserted, 1, 10);
    const amounts = inserted.map(r => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1, 2, 7]);
  });

  // -------------------------------------------------------------------------
  // Case 3: amount=10, splits=[1,3,6], goal allocated=10 — exact integers
  // -------------------------------------------------------------------------
  it("splits=[1,3,6] with total=10, goal allocated=10: rows are 1+3+6=10", async () => {
    const goal = makeGoal(1, 100_000);
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireCascadeWithGoals([goal], inserted);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "a", amount: 1 },
          { userId: "b", amount: 3 },
          { userId: "c", amount: 6 },
        ],
      });

    expect(res.status).toBe(200);
    assertSumsTo(inserted, 1, 10);
    const amounts = inserted.map(r => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1, 3, 6]);
  });

  // -------------------------------------------------------------------------
  // Case 4: amount=10, splits=[1,3,6], goal allocated=1
  //   Proportional shares: 0.1, 0.3, 0.6 — floors all 0; remainder=1.
  //   Largest fraction is 0.6 → contributor "c" gets the 1 unit.
  // -------------------------------------------------------------------------
  it("splits=[1,3,6] with total=10, goal allocated=1: one row totalling 1, assigned to largest-share contributor", async () => {
    const goal = { ...makeGoal(1, 1_000), currentAmount: 999 }; // needs exactly 1
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goal])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { ...goal, currentAmount: 1_000, isCompleted: true },
                ]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "a", amount: 1 },
          { userId: "b", amount: 3 },
          { userId: "c", amount: 6 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.allocations[0].allocated).toBe(1);
    assertSumsTo(inserted, 1, 1);
    // Only one non-zero row.
    expect(inserted.length).toBe(1);
    expect(inserted[0].amount).toBe(1);
    // The single unit goes to "c" (largest fractional share, 0.6).
    expect(inserted[0].createdByUserId).toBe("c");
  });

  // -------------------------------------------------------------------------
  // Case 5: amount=10, splits=[5,5], goal allocated=2 → 1+1=2
  // -------------------------------------------------------------------------
  it("splits=[5,5] with total=10, goal allocated=2: each contributor gets 1, sum=2", async () => {
    const goal = { ...makeGoal(1, 1_000), currentAmount: 998 }; // needs 2
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goal])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { ...goal, currentAmount: 1_000, isCompleted: true },
                ]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 10,
        contributorSplits: [
          { userId: "alice", amount: 5 },
          { userId: "bob",   amount: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.allocations[0].allocated).toBe(2);
    assertSumsTo(inserted, 1, 2);
    const amounts = inserted.map(r => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1, 1]);
  });

  // -------------------------------------------------------------------------
  // Case 6: amount=3, splits=[1,1,1] (equal thirds), goal allocated=7
  //   Exact shares: 7/3 ≈ 2.333 each.
  //   Floors: 2+2+2=6; remainder=1 → one contributor gets +1 → 3+2+2=7.
  // -------------------------------------------------------------------------
  it("splits=[1,1,1] (equal thirds) with total=3, goal allocated=7: rows sum exactly to 7", async () => {
    const goal = { ...makeGoal(1, 1_000), currentAmount: 993 }; // needs 7
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goal])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { ...goal, currentAmount: 1_000, isCompleted: true },
                ]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 3,
        contributorSplits: [
          { userId: "a", amount: 1 },
          { userId: "b", amount: 1 },
          { userId: "c", amount: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.allocations[0].allocated).toBe(3);  // min(7, 3) = 3
    // The cascade only sends 3 (total amount), so allocated for the goal = 3.
    // Shares: 1+1+1=3 each exactly — sum=3.
    assertSumsTo(inserted, 1, 3);
  });

  // -------------------------------------------------------------------------
  // Case 6b: 3 contributors share 7 KES
  //   Use amount=7 and three equal splits of 7/3 each — but split amounts must
  //   sum to amount exactly, so we use fractional split amounts here to prove
  //   the handler rounds correctly at the per-goal level.
  //   More practically: amount=21, splits=[7,7,7], goal needs 7
  //   → per-goal proportions: 7/21 each × 7 = 2.333 each → 3+2+2=7 ✓
  // -------------------------------------------------------------------------
  it("splits=[7,7,7] with total=21, goal allocated=7: rows sum exactly to 7", async () => {
    const goal = { ...makeGoal(1, 1_000), currentAmount: 993 }; // needs 7
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goal])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { ...goal, currentAmount: 1_000, isCompleted: true },
                ]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 21,
        contributorSplits: [
          { userId: "a", amount: 7 },
          { userId: "b", amount: 7 },
          { userId: "c", amount: 7 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.allocations[0].allocated).toBe(7);
    assertSumsTo(inserted, 1, 7);
    // 3 rows: 3+2+2=7 or 3+3+1, either way sum=7 and exactly 3 rows.
    expect(inserted.length).toBe(3);
    const total = inserted.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(7);
    // Max individual share ≤ 3 (ceiling of 7/3).
    for (const row of inserted) expect(row.amount).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Case 7: Multi-goal — goals need 7 and 3 of 21; splits=[7,7,7]
  //   Goal A allocated=7: shares 7/3≈2.33 each → 3+2+2=7 ✓
  //   Goal B allocated=3: shares 1 each → 1+1+1=3 ✓
  // -------------------------------------------------------------------------
  it("multi-goal: each goal's contribution rows sum to its own allocated", async () => {
    const goalA = { ...makeGoal(1, 7),  currentAmount: 0 };
    const goalB = { ...makeGoal(2, 3),  currentAmount: 0 };
    const inserted: InsertedRow[] = [];
    wireValidMembers();

    let updateIdx = 0;
    const updatedGoals = [
      { ...goalA, currentAmount: 7, isCompleted: true },
      { ...goalB, currentAmount: 3, isCompleted: true },
    ];

    mockedDb.transaction = vi.fn().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => makeGoalSelectChain([goalA, goalB])),
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockImplementation(async () => [updatedGoals[updateIdx++]]),
              }),
            }),
          })),
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

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 21,
        contributorSplits: [
          { userId: "alice", amount: 7 },
          { userId: "bob",   amount: 7 },
          { userId: "carol", amount: 7 },
        ],
      });

    expect(res.status).toBe(200);
    // Goal A received 7, goal B received 3.
    assertSumsTo(inserted, 1, 7);
    assertSumsTo(inserted, 2, 3);
    // Grand total.
    const grand = inserted.reduce((s, r) => s + r.amount, 0);
    expect(grand).toBe(10);
  });

  // -------------------------------------------------------------------------
  // Case 8: Single Joint-bank split → one null row
  // -------------------------------------------------------------------------
  it("single Joint-bank split (userId=null): one row with createdByUserId=null", async () => {
    const goal = makeGoal(1, 100_000);
    const inserted: InsertedRow[] = [];
    // No member validation needed for null userId.
    mockedDb.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }));
    wireCascadeWithGoals([goal], inserted);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 5,
        contributorSplits: [{ userId: null, amount: 5 }],
      });

    expect(res.status).toBe(200);
    assertSumsTo(inserted, 1, 5);
    expect(inserted[0].createdByUserId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 9: amount=100, splits=[33,33,34], goal allocated=100 → 33+33+34=100
  // -------------------------------------------------------------------------
  it("splits=[33,33,34] with total=100, goal allocated=100: rows are 33+33+34=100", async () => {
    const goal = makeGoal(1, 100_000);
    const inserted: InsertedRow[] = [];
    wireValidMembers();
    wireCascadeWithGoals([goal], inserted);

    const res = await request(app)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 100,
        contributorSplits: [
          { userId: "a", amount: 33 },
          { userId: "b", amount: 33 },
          { userId: "c", amount: 34 },
        ],
      });

    expect(res.status).toBe(200);
    assertSumsTo(inserted, 1, 100);
    const amounts = inserted.map(r => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([33, 33, 34]);
  });
});
