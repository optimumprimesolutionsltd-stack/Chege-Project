/**
 * Paying somebody you owe is not new spending when the cost was recorded as
 * the debt was taken on - stock bought on credit and entered then. Demanding a
 * category at payment time counted it twice. So a payment to a party may carry
 * none, and without one it stays out of spending the way a loan out does. Not
 * always, though: when the purchase was never entered, a category still works.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("@workspace/db", () => {
  const makeTable = (name: string) =>
    new Proxy({}, { get: (_, prop) => ({ _table: name, _col: String(prop) }) });

  return {
    jointAccountTxTable: makeTable("joint_account_transactions"),
    bankAccountsTable: makeTable("bank_accounts"),
    groupContributorsTable: makeTable("group_contributors"),
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

// requireTransactionEligibility (used by every route under test here) now
// checks subscription status for a Personal budget too, not only a Shared
// group. These tests are about attribution, not billing, so it is stubbed
// to "current and in good standing" rather than fleshing out the
// subscription tables in the @workspace/db mock above.
vi.mock("../../lib/subscription-catalog", () => ({
  resolveMemberEntitlements: vi.fn(async () => ({ status: "active", fullAccess: true })),
}));

import { db } from "@workspace/db";
import jointAccountRouter from "../joint-account.js";

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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "user-1" };
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", jointAccountRouter);
  return app;
}

const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
  // Every lookup succeeds: the party is in this budget, the category and the
  // account exist.
  mockedDb.select.mockImplementation(() => makeSelectChainWith([{ id: 1 }]));
  mockedDb.query.usersTable.findFirst.mockResolvedValue(undefined);
});

type Inserted = { expenseCategory: string | null; settlesContributorId: number | null; description: string; isLending: boolean };

describe("POST /joint-account/disbursement to somebody you owe", () => {
  it("saves with no category, as a debt payment rather than spending", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 75000, description: "Hermda trders", date: "2026-09-28", settlesContributorId: 5 });

    expect(res.status).toBe(201);
    const row = captured.current as Inserted;
    expect(row.expenseCategory).toBeNull();
    expect(row.settlesContributorId).toBe(5);
    expect(row.isLending).toBe(false);
  });

  it("is called a debt payment when nothing else names it", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 500, date: "2026-09-28", settlesContributorId: 5 });

    expect((captured.current as Inserted).description).toBe("Debt payment");
  });

  it("still takes a category when the purchase was never recorded", async () => {
    const captured: { current: unknown } = { current: undefined };
    mockedDb.insert = makeInsertMock(captured);

    const res = await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 75000, description: "Hermda trders", expenseCategory: "Stock", date: "2026-09-28", settlesContributorId: 5 });

    expect(res.status).toBe(201);
    expect((captured.current as Inserted).expenseCategory).toBeTruthy();
  });

  it("refuses a party from another budget, category or not", async () => {
    mockedDb.select.mockImplementation(() => makeSelectChainWith([]));
    mockedDb.insert = makeInsertMock();

    const res = await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 500, date: "2026-09-28", settlesContributorId: 999 });

    expect(res.status).toBe(400);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});

describe("every other withdrawal still needs a category", () => {
  it("refuses ordinary spending given none", async () => {
    mockedDb.insert = makeInsertMock();

    const res = await request(app)
      .post("/joint-account/disbursement")
      .send({ amount: 500, description: "Something", date: "2026-09-28" });

    expect(res.status).toBe(400);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});
