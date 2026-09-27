import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      execute: vi.fn(),
      select: vi.fn(),
    },
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
    incomeSourcesTable: table,
  };
});

vi.mock("drizzle-orm", () => ({
  sql: sqlMock,
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

import { db } from "@workspace/db";
import dashboardRouter from "../dashboard.js";

type MockableDb = {
  execute: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

const mockedDb = db as unknown as MockableDb;

function buildApp(groupId = 1) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.group = { id: groupId, role: "owner" };
    next();
  });
  app.use("/", dashboardRouter);
  return app;
}

function mockIncomeSources(rows: Array<{
  id: number;
  name: string;
  userId: string;
  expectedMonthlyAmount: number;
  ownerName: string | null;
}>) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => Promise.resolve(rows),
  };
  mockedDb.select.mockReturnValue(chain as never);
}

// The route issues the cost query before the funding query (see dashboard.ts),
// so the first db.execute() resolves the costs-by-source rows and the second
// resolves the funding CTE rows.
function mockExecuteCalls(costRows: unknown[], fundingRows: unknown[]) {
  mockedDb.execute
    .mockImplementationOnce(() => Promise.resolve({ rows: costRows }))
    .mockImplementationOnce(() => Promise.resolve({ rows: fundingRows }));
}

describe("GET /dashboard/income-streams — side-hustle cost categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subtracts a linked category's spend from its income source's profit, and reports the subtraction as costs", async () => {
    mockExecuteCalls(
      [{ incomeSourceId: 9, cost: "1800" }],
      [{
        incomeSourceId: 9,
        sourceName: "Side hustle",
        ownerId: "member-b",
        ownerName: "Baraka",
        total: "6000",
        transactionCount: "3",
      }],
    );
    mockIncomeSources([
      { id: 9, name: "Side hustle", userId: "member-b", expectedMonthlyAmount: 0, ownerName: "Baraka" },
    ]);

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body.streams).toEqual([
      expect.objectContaining({ incomeSourceId: 9, total: 4200, costs: 1800, transactionCount: 3 }),
    ]);
    expect(response.body.totalFunding).toBe(4200);
  });

  it("shows a loss when a linked category cost money this month but nothing was sold yet", async () => {
    mockExecuteCalls([{ incomeSourceId: 9, cost: "1800" }], []);
    mockIncomeSources([
      { id: 9, name: "Side hustle", userId: "member-b", expectedMonthlyAmount: 0, ownerName: "Baraka" },
    ]);

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body.streams).toEqual([
      expect.objectContaining({ incomeSourceId: 9, total: -1800, costs: 1800, transactionCount: 0 }),
    ]);
  });

  it("leaves an income source with no linked cost category untouched", async () => {
    mockExecuteCalls([], [{
      incomeSourceId: 7,
      sourceName: "Salary",
      ownerId: "member-a",
      ownerName: "Amina",
      total: "1800",
      transactionCount: "2",
    }]);
    mockIncomeSources([
      { id: 7, name: "Salary", userId: "member-a", expectedMonthlyAmount: 2000, ownerName: "Amina" },
    ]);

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body.streams).toEqual([
      expect.objectContaining({ incomeSourceId: 7, total: 1800, costs: 0 }),
    ]);
  });
});
