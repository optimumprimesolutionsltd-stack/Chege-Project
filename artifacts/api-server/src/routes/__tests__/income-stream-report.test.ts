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
    expenseIncomeSplitsTable: table,
    budgetCategoriesTable: table,
    usersTable: table,
    jointAccountTxTable: table,
    jointAccountDepositSplitsTable: table,
    savingsGoalContributionsTable: table,
    savingsGoalsTable: table,
    groupMembershipsTable: table,
    incomeSourcesTable: table,
  };
});

vi.mock("drizzle-orm", () => ({
  sql: sqlMock,
  eq: vi.fn(),
  and: vi.fn(),
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

describe("GET /dashboard/income-streams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns split-aware stream totals and one explicit Unattributed bucket", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [
        {
          incomeSourceId: 7,
          sourceName: "Salary",
          ownerId: "member-a",
          ownerName: "Amina",
          total: "1800",
          transactionCount: "2",
        },
        {
          incomeSourceId: 9,
          sourceName: "Side business",
          ownerId: "member-b",
          ownerName: "Baraka",
          total: "200",
          transactionCount: "1",
        },
        {
          incomeSourceId: null,
          sourceName: "Unattributed",
          ownerId: null,
          ownerName: "No income stream selected",
          total: "500",
          transactionCount: "2",
        },
      ],
    });

    const response = await request(buildApp()).get("/dashboard/income-streams?month=5&year=2026");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: 5,
      year: 2026,
      totalFunding: 2500,
      streams: [
        expect.objectContaining({ sourceName: "Salary", total: 1800, sharePercent: 72, transactionCount: 2 }),
        expect.objectContaining({ sourceName: "Side business", total: 200, sharePercent: 8, transactionCount: 1 }),
        expect.objectContaining({
          incomeSourceId: null,
          sourceName: "Unattributed",
          total: 500,
          sharePercent: 20,
          transactionCount: 2,
        }),
      ],
    });
  });

  it("uses the authenticated group and month filters while excluding joint-bank expense portions", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    const response = await request(buildApp(41)).get("/dashboard/income-streams?month=2&year=2025&groupId=999");

    expect(response.status).toBe(200);
    const statement = sqlMock.mock.results.at(-1)?.value as { strings: TemplateStringsArray; values: unknown[] };
    const statementText = statement.strings.join("");
    expect(statement.values).toContain(41);
    expect(statement.values).toContain(2);
    expect(statement.values).toContain(2025);
    expect(statement.values).not.toContain(999);
    expect(statementText).toContain("split.from_bank = false");
    expect(statementText).toContain("expense.paid_from_bank = false");
    expect(statementText).toContain("joint_account_deposit_splits");
    expect(statementText).toContain("deposit.transfer_direction IS DISTINCT FROM 'from_savings'");
    expect(statementText).toContain("savings_goal_contributions");
    expect(statementText).toContain("NOT EXISTS");
  });

  it("returns a safe empty report when the selected month has no funding", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    const response = await request(buildApp()).get("/dashboard/income-streams?month=1&year=2024");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ month: 1, year: 2024, totalFunding: 0, streams: [] });
  });
});