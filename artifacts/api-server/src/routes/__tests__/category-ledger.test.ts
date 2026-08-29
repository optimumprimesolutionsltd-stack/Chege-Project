import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: { select: vi.fn(), execute: vi.fn() },
    expensesTable: table,
    expenseCategoryAllocationsTable: table,
    expenseIncomeSplitsTable: table,
    budgetCategoriesTable: table,
    usersTable: table,
    jointAccountTxTable: table,
    jointAccountDepositSplitsTable: table,
    savingsGoalContributionsTable: table,
    savingsGoalsTable: table,
    groupMembershipsTable: table,
    groupsTable: table,
  };
});

vi.mock("drizzle-orm", () => ({
  sql: sqlMock,
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { db } from "@workspace/db";
import dashboardRouter from "../dashboard.js";

type MockableDb = { select: ReturnType<typeof vi.fn> };
const mockedDb = db as unknown as MockableDb;

function buildApp() {
  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", dashboardRouter);
  return app;
}

function queueLedgerQueries(
  activeCategories: { name: string }[],
  expenses: unknown[],
  disbursements: unknown[],
  allocations: unknown[] = [],
) {
  mockedDb.select
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve(activeCategories) }),
    })
    .mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: () => Promise.resolve(expenses) }) }),
    })
    .mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: () => Promise.resolve(disbursements) }) }),
    })
    .mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(allocations) }) }) }),
    });
}

describe("GET /dashboard/category-ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every underlying unbudgeted expense and standalone bank disbursement", async () => {
    queueLedgerQueries(
      [{ name: "Medical" }],
      [{
        id: 11,
        category: "Transport",
        description: "Matatu fare",
        amount: 200,
        paidFromBank: false,
        payerName: "Amina",
        date: "2026-08-20",
      }],
      [{
        id: 31,
        category: "Household supplies",
        description: "Market purchase",
        amount: 800,
        payerName: null,
        date: "2026-08-19",
      }],
    );

    const response = await request(buildApp())
      .get("/dashboard/category-ledger?month=8&year=2026&category=Unbudgeted%20spending&isBudgeted=false");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      category: "Unbudgeted spending",
      total: 1000,
      entries: [
        expect.objectContaining({
          id: "expense-11-Transport",
          source: "expense",
          category: "Transport",
          amount: 200,
          payerName: "Amina",
        }),
        expect.objectContaining({
          id: "bank-disbursement-31",
          source: "bank_disbursement",
          category: "Household supplies",
          amount: 800,
          payerName: "Joint bank",
        }),
      ],
    });
  });

  it("includes category-tagged standalone bank disbursements in a budgeted category ledger", async () => {
    queueLedgerQueries(
      [{ name: "Medical" }],
      [],
      [{
        id: 54,
        category: "Medical",
        description: "Clinic payment",
        amount: 1250,
        payerName: "David",
        date: "2026-08-20",
      }],
    );

    const response = await request(buildApp())
      .get("/dashboard/category-ledger?month=8&year=2026&category=Medical&isBudgeted=true");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      category: "Medical",
      total: 1250,
      entries: [
        expect.objectContaining({
          id: "bank-disbursement-54",
          source: "bank_disbursement",
          description: "Clinic payment",
          amount: 1250,
          payerName: "David",
        }),
      ],
    });
  });

  it("uses ordered allocation portions rather than the legacy primary category", async () => {
    queueLedgerQueries(
      [{ name: "Food" }, { name: "Transport" }],
      [{
        id: 12,
        category: "Food",
        description: "Supermarket basket",
        amount: 1000,
        paidFromBank: false,
        payerName: "Amina",
        date: "2026-08-20",
      }],
      [],
      [
        { expenseId: 12, category: "Food", amount: 600, position: 0 },
        { expenseId: 12, category: "Transport", amount: 400, position: 1 },
      ],
    );

    const response = await request(buildApp())
      .get("/dashboard/category-ledger?month=8&year=2026&category=Transport&isBudgeted=true");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(400);
    expect(response.body.entries).toMatchObject([{
      id: "expense-12-Transport",
      category: "Transport",
      amount: 400,
    }]);
  });
});