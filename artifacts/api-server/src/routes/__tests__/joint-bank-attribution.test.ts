/**
 * Task #187 — Joint bank attribution tests
 *
 * Verifies:
 *   1. Deposits/disbursements with omitted madeById → stored as null (Joint bank),
 *      never fall back to req.user.
 *   2. Deposits/disbursements with explicit null madeById → stored as null.
 *   3. Deposits/disbursements with a valid named member ID → stored as that ID.
 *   4. Deposits/disbursements with an unrecognised member ID → 400 error.
 *   5. Single savings contribution with omitted userId → stored as null.
 *   6. Single savings contribution with explicit null userId → stored as null.
 *   7. Single savings contribution with a valid named member ID → stored as that ID.
 *   8. Single savings contribution with an unrecognised ID → 400 error.
 *   9. Cascade contribute with no contributorSplits → records null (Joint bank).
 *  10. Cascade contribute with contributorSplits → validates IDs and records splits.
 *  11. Cascade contribute with splits that don't sum to amount → 400 error.
 *  12. Contribution history: null createdByUserId → contributorName = "Joint bank".
 *  13. Contribution history: named createdByUserId → contributorName = member name.
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
    jointAccountTxTable: makeTable("joint_account_transactions"),
    jointAccountDepositSplitsTable: makeTable("joint_account_deposit_splits"),
    budgetCategoriesTable: makeTable("budget_categories"),
    savingsGoalsTable: makeTable("savings_goals"),
    savingsGoalContributionsTable: makeTable("savings_goal_contributions"),
    usersTable: makeTable("users"),
    membersTable: makeTable("members"),
    groupMembershipsTable: makeTable("group_memberships"),
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
      query: {
        usersTable: { findFirst: vi.fn() },
      },
    },
    eq: vi.fn((col, val) => ({ _eq: { col, val } })),
    sql: vi.fn(),
    desc: vi.fn((col) => ({ _desc: col })),
    and: vi.fn(),
  };
});

import { db } from "@workspace/db";
import jointAccountRouter from "../joint-account.js";
import savingsGoalsRouter from "../savings-goals.js";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
type MockableDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  query: { usersTable: { findFirst: ReturnType<typeof vi.fn> } };
};

const mockedDb = db as unknown as MockableDb;

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------
const AUTHED_USER_ID = "user-authed-123";

function buildJointApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: AUTHED_USER_ID };
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", jointAccountRouter);
  return app;
}

function buildSavingsApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: AUTHED_USER_ID };
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", savingsGoalsRouter);
  return app;
}

const jointApp = buildJointApp();
const savingsApp = buildSavingsApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a select mock that returns rows via .limit(1) or .orderBy().DESC  */
function makeSelectChainWith(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.for = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  chain.catch = (reject: (r: unknown) => unknown) =>
    Promise.resolve(rows).catch(reject as never);
  chain.finally = (cb: () => void) => Promise.resolve(rows).finally(cb);
  return chain;
}

/** Build a mock insert that captures inserted values and returns them. */
function makeInsertMock(capturedValues?: { current: unknown }) {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((vals: unknown) => {
      if (capturedValues) capturedValues.current = vals;
      return {
        returning: vi.fn().mockResolvedValue([vals]),
      };
    }),
  });
}

// A valid member that exists in the household
const VALID_MEMBER_ID = "member-valid-abc";
// An ID that is NOT in the household
const UNKNOWN_MEMBER_ID = "member-ghost-xyz";

/** Wire up db.select to return a member row for VALID_MEMBER_ID, empty for others. */
function wireValidMemberSelect() {
  mockedDb.select.mockImplementation(() =>
    makeSelectChainWith([{ userId: VALID_MEMBER_ID }]),
  );
}

/** Wire up db.select to return empty (member not found). */
function wireUnknownMemberSelect() {
  mockedDb.select.mockImplementation(() => makeSelectChainWith([]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.transaction.mockImplementation(async (callback: (transaction: { insert: (...args: unknown[]) => unknown }) => unknown) =>
    callback({ insert: (...args: unknown[]) => (mockedDb.insert as unknown as (...args: unknown[]) => unknown)(...args) }),
  );
  // Ordinary bank routes also verify the selected reporting category.
  mockedDb.select.mockImplementation(() => makeSelectChainWith([{ id: 1 }]));
  // Default: enrich query finds no user (madeByName = null)
  mockedDb.query.usersTable.findFirst.mockResolvedValue(undefined);
});

// ===========================================================================
// JOINT ACCOUNT — DEPOSITS
// ===========================================================================

describe("POST /joint-account/deposit — madeById attribution", () => {
  it("stores null (Joint bank) when madeById is omitted — does NOT fall back to req.user", async () => {
    const captured: { current: unknown } = { current: undefined };

    // First select call = member validation (only reached if madeById is non-null → skipped here)
    // But insert is called
    mockedDb.select.mockImplementation(() => makeSelectChainWith([])); // shouldn't be called
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/deposit")
      .send({ amount: 1000, description: "Salary", date: "2024-06-01" });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBeNull();
    // Must NOT be the authed user's ID
    expect((captured.current as { madeById: unknown }).madeById).not.toBe(AUTHED_USER_ID);
  });

  it("stores null (Joint bank) when madeById is explicitly null", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/deposit")
      .send({ amount: 500, description: "Transfer", date: "2024-06-01", madeById: null });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBeNull();
  });

  it("stores the named member ID when madeById is a valid household member", async () => {
    const captured: { current: unknown } = { current: undefined };
    wireValidMemberSelect();
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/deposit")
      .send({ amount: 500, description: "Chege salary", date: "2024-06-01", madeById: VALID_MEMBER_ID });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBe(VALID_MEMBER_ID);
  });

  it("returns 400 when madeById is an unrecognised member ID", async () => {
    wireUnknownMemberSelect();

    const res = await request(jointApp)
      .post("/joint-account/deposit")
      .send({ amount: 500, description: "Mystery", date: "2024-06-01", madeById: UNKNOWN_MEMBER_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a recognised household member/i);
  });
});

// ===========================================================================
// JOINT ACCOUNT — DISBURSEMENTS
// ===========================================================================

describe("POST /joint-account/disbursement — madeById attribution", () => {
  it("stores null (Joint bank) when madeById is omitted — does NOT fall back to req.user", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/disbursement")
      .send({ amount: 200, description: "Groceries", expenseCategory: "Food", date: "2024-06-01" });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBeNull();
    expect((captured.current as { madeById: unknown }).madeById).not.toBe(AUTHED_USER_ID);
  });

  it("stores null (Joint bank) when madeById is explicitly null", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/disbursement")
      .send({ amount: 200, description: "Groceries", expenseCategory: "Food", date: "2024-06-01", madeById: null });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBeNull();
  });

  it("stores the named member ID for a valid household member", async () => {
    const captured: { current: unknown } = { current: undefined };
    wireValidMemberSelect();
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(jointApp)
      .post("/joint-account/disbursement")
      .send({ amount: 200, description: "Lydiah rent", expenseCategory: "Food", date: "2024-06-01", madeById: VALID_MEMBER_ID });

    expect(res.status).toBe(201);
    expect((captured.current as { madeById: unknown }).madeById).toBe(VALID_MEMBER_ID);
  });

  it("returns 400 for an unrecognised member ID", async () => {
    wireUnknownMemberSelect();

    const res = await request(jointApp)
      .post("/joint-account/disbursement")
      .send({ amount: 200, description: "Ghost", expenseCategory: "Food", date: "2024-06-01", madeById: UNKNOWN_MEMBER_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a recognised household member/i);
  });
});

// ===========================================================================
// SAVINGS GOALS — SINGLE CONTRIBUTE
// ===========================================================================

describe("POST /savings-goals/:id/contribute — userId attribution", () => {
  function wireSavingsTransactionForContribute(
    capturedInsert: { current: unknown },
    goalExists = true,
  ) {
    const goalRow = {
      id: 1,
      name: "Holiday",
      currentAmount: 0,
      targetAmount: 1000,
      isCompleted: false,
      deadline: null,
      createdByUserId: "owner",
      createdAt: new Date(),
    };

    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue(goalExists ? [goalRow] : []),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ ...goalRow, currentAmount: 100 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: unknown) => {
            capturedInsert.current = vals;
            return Promise.resolve();
          }),
        }),
      };
      return cb(tx);
    });
  }

  it("records null (Joint bank) when userId is omitted — does NOT fall back to req.user", async () => {
    const captured: { current: unknown } = { current: undefined };
    // member validation select won't be called (userId is null/omitted)
    mockedDb.select.mockImplementation(() => makeSelectChainWith([]));
    wireSavingsTransactionForContribute(captured);

    const res = await request(savingsApp)
      .post("/savings-goals/1/contribute")
      .send({ amount: 100 });

    expect(res.status).toBe(200);
    expect((captured.current as { createdByUserId: unknown }).createdByUserId).toBeNull();
    expect((captured.current as { createdByUserId: unknown }).createdByUserId).not.toBe(AUTHED_USER_ID);
  });

  it("records null (Joint bank) when userId is explicitly null", async () => {
    const captured: { current: unknown } = { current: undefined };
    wireSavingsTransactionForContribute(captured);

    const res = await request(savingsApp)
      .post("/savings-goals/1/contribute")
      .send({ amount: 100, userId: null });

    expect(res.status).toBe(200);
    expect((captured.current as { createdByUserId: unknown }).createdByUserId).toBeNull();
  });

  it("records the named member ID for a valid household member", async () => {
    const captured: { current: unknown } = { current: undefined };
    wireValidMemberSelect();
    wireSavingsTransactionForContribute(captured);

    const res = await request(savingsApp)
      .post("/savings-goals/1/contribute")
      .send({ amount: 100, userId: VALID_MEMBER_ID });

    expect(res.status).toBe(200);
    expect((captured.current as { createdByUserId: unknown }).createdByUserId).toBe(VALID_MEMBER_ID);
  });

  it("returns 400 for an unrecognised member ID", async () => {
    wireUnknownMemberSelect();

    const res = await request(savingsApp)
      .post("/savings-goals/1/contribute")
      .send({ amount: 100, userId: UNKNOWN_MEMBER_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a recognised household member/i);
  });
});

// ===========================================================================
// SAVINGS GOALS — CASCADE CONTRIBUTE
// ===========================================================================

describe("POST /savings-goals/cascade-contribute — attribution", () => {
  const goal1 = {
    id: 1,
    name: "Car",
    currentAmount: 0,
    targetAmount: 500,
    isCompleted: false,
    deadline: null,
    createdByUserId: "owner",
    createdAt: new Date(),
  };

  function wireCascadeTransaction(capturedInserts: { values: unknown }[]) {
    mockedDb.transaction = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockImplementation(() => {
          const chain: Record<string, unknown> = {};
          chain.from = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockReturnValue(chain);
          chain.orderBy = vi.fn().mockReturnValue(chain);
          chain.for = vi.fn().mockResolvedValue([goal1]);
          return chain;
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ ...goal1, currentAmount: 500, isCompleted: true }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: unknown) => {
            capturedInserts.push({ values: vals });
            return Promise.resolve();
          }),
        }),
      };
      return cb(tx);
    });
  }

  it("records null (Joint bank) for all goals when no contributorSplits provided", async () => {
    const inserts: { values: unknown }[] = [];
    wireCascadeTransaction(inserts);
    mockedDb.select.mockImplementation(() => makeSelectChainWith([]));

    const res = await request(savingsApp)
      .post("/savings-goals/cascade-contribute")
      .send({ amount: 500 });

    expect(res.status).toBe(200);
    expect(inserts.length).toBeGreaterThan(0);
    for (const row of inserts) {
      expect((row.values as { createdByUserId: unknown }).createdByUserId).toBeNull();
    }
  });

  it("returns 400 when contributorSplits do not sum to amount", async () => {
    mockedDb.select.mockImplementation(() => makeSelectChainWith([{ userId: VALID_MEMBER_ID }]));

    const res = await request(savingsApp)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 500,
        contributorSplits: [
          { userId: VALID_MEMBER_ID, amount: 200 }, // only 200, not 500
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sum/i);
  });

  it("returns 400 when a named contributorSplit userId is unrecognised", async () => {
    wireUnknownMemberSelect();

    const res = await request(savingsApp)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 500,
        contributorSplits: [
          { userId: UNKNOWN_MEMBER_ID, amount: 500 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a recognised household member/i);
  });

  it("records named member splits when contributorSplits are provided and valid", async () => {
    const inserts: { values: unknown }[] = [];
    // First two selects = member validation; the rest = cascade goals
    let selectCallCount = 0;
    mockedDb.select.mockImplementation(() => {
      selectCallCount++;
      // First call is member validation for VALID_MEMBER_ID
      if (selectCallCount === 1) return makeSelectChainWith([{ userId: VALID_MEMBER_ID }]);
      return makeSelectChainWith([goal1]);
    });
    wireCascadeTransaction(inserts);

    const res = await request(savingsApp)
      .post("/savings-goals/cascade-contribute")
      .send({
        amount: 500,
        contributorSplits: [
          { userId: VALID_MEMBER_ID, amount: 500 },
        ],
      });

    expect(res.status).toBe(200);
    expect(inserts.length).toBeGreaterThan(0);
    const hasNamedMember = inserts.some(
      (r) => (r.values as { createdByUserId: unknown }).createdByUserId === VALID_MEMBER_ID,
    );
    expect(hasNamedMember).toBe(true);
  });
});

// ===========================================================================
// CONTRIBUTION HISTORY — contributorName labels
// ===========================================================================

describe("GET /savings-goals/:id/contributions — contributorName", () => {
  /**
   * Wire db.select for contributions endpoint:
   *   - First call = goal existence check → returns [{ id: 1 }]
   *   - Second call = contributions join → returns provided contribution rows
   *
   * The route aliases usersTable.firstName as "contributorName" in the select,
   * so mock rows must use "contributorName" (the field name Drizzle will return).
   */
  function wireGoalExistsSelect(
    contributions: { id: number; amount: number; createdByUserId: string | null; contributorName: string | null; note?: string | null; createdAt?: Date }[],
  ) {
    let callCount = 0;
    mockedDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Goal existence check: .from().where().limit(1)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 1 }]),
            }),
          }),
        };
      }
      // Contributions join: .from().leftJoin().where().orderBy()
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(
                contributions.map(c => ({ ...c, createdAt: c.createdAt ?? new Date() })),
              ),
            }),
          }),
        }),
      };
    });
  }

  it("returns 'Joint bank' for null createdByUserId", async () => {
    wireGoalExistsSelect([
      { id: 10, amount: 500, createdByUserId: null, contributorName: null },
    ]);

    const res = await request(savingsApp).get("/savings-goals/1/contributions");

    expect(res.status).toBe(200);
    expect(res.body[0].contributorName).toBe("Joint bank");
    expect(res.body[0].createdByUserId).toBeNull();
  });

  it("returns the user's first name for a named createdByUserId", async () => {
    wireGoalExistsSelect([
      { id: 11, amount: 300, createdByUserId: VALID_MEMBER_ID, contributorName: "Lydiah" },
    ]);

    const res = await request(savingsApp).get("/savings-goals/1/contributions");

    expect(res.status).toBe(200);
    expect(res.body[0].contributorName).toBe("Lydiah");
    expect(res.body[0].createdByUserId).toBe(VALID_MEMBER_ID);
  });

  it("never returns 'Unknown' for a null createdByUserId", async () => {
    wireGoalExistsSelect([
      { id: 12, amount: 100, createdByUserId: null, contributorName: null },
      { id: 13, amount: 200, createdByUserId: null, contributorName: null },
    ]);

    const res = await request(savingsApp).get("/savings-goals/1/contributions");

    expect(res.status).toBe(200);
    for (const row of res.body) {
      expect(row.contributorName).not.toBe("Unknown");
      expect(row.contributorName).toBe("Joint bank");
    }
  });
});
