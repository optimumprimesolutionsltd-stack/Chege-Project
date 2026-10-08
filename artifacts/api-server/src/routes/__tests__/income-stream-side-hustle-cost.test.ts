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

// "remove logic of income streams as businesses to avoid confusion" (8 Oct
// 2026): an income stream is income. Costs linked to it are ordinary spending,
// and a business's costs belong to the Business report (lib/business-streams).
describe("GET /dashboard/income-streams - an income stream is what came in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes nothing off a stream, whatever categories are linked to it", async () => {
    mockedDb.execute.mockImplementationOnce(() => Promise.resolve({ rows: [{
      incomeSourceId: 9,
      sourceName: "Side hustle",
      ownerId: "member-b",
      ownerName: "Baraka",
      total: "6000",
      transactionCount: "3",
    }] }));
    mockIncomeSources([
      { id: 9, name: "Side hustle", userId: "member-b", expectedMonthlyAmount: 0, ownerName: "Baraka" },
    ]);

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body.streams).toEqual([
      expect.objectContaining({ incomeSourceId: 9, total: 6000, costs: 0, transactionCount: 3 }),
    ]);
    expect(response.body.totalFunding).toBe(6000);
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });

  it("shows nothing received, not a loss, for a stream with nothing in this month", async () => {
    mockedDb.execute.mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    mockIncomeSources([
      { id: 7, name: "Salary", userId: "member-a", expectedMonthlyAmount: 2000, ownerName: "Amina" },
    ]);

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body.streams).toEqual([
      expect.objectContaining({ incomeSourceId: 7, total: 0, costs: 0 }),
    ]);
  });
});
