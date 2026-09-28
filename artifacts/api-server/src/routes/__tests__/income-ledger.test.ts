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

const mockedDb = db as unknown as { execute: ReturnType<typeof vi.fn> };

function buildApp() {
  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.group = { id: 7, role: "owner" };
    next();
  });
  app.use("/", dashboardRouter);
  return app;
}

/** The text of a mocked sql`` call, with its interpolations as ${}. */
function sqlText(call: { strings: TemplateStringsArray }): string {
  return call.strings.join("${}");
}

describe("GET /dashboard/income-ledger", () => {
  beforeEach(() => {
    mockedDb.execute.mockReset();
    sqlMock.mockClear();
  });

  it("returns the ledger built from this group's deposits, splits and streams", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [
        { id: 4, date: "2026-09-05", description: "September salary", amount: 80000, incomeSourceId: 1, makerName: "Chege", accountName: "Equity", kind: "income" },
        { id: 5, date: "2026-09-06", description: "Loan from Mum", amount: 10000, incomeSourceId: null, makerName: "Chege", accountName: "Equity", kind: "borrowed" },
      ] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Chege – Salary" }] });

    const response = await request(buildApp())
      .get("/dashboard/income-ledger")
      .query({ from: "2026-09-01", to: "2026-09-30" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      total: 80000,
      otherMoneyIn: { borrowed: 10000, repaidToYou: 0, fromSavings: 0 },
    });
    expect(response.body.entries).toEqual([
      expect.objectContaining({ transactionId: 4, streams: ["Chege – Salary"], accountName: "Equity" }),
    ]);
  });

  it("scopes every query to the active group and leaves transfers between accounts out", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    await request(buildApp()).get("/dashboard/income-ledger").query({ from: "2026-09-01", to: "2026-09-30" });

    const queries = sqlMock.mock.results
      .map((result) => result.value as { strings: TemplateStringsArray; values: unknown[] })
      .filter((call) => /FROM (joint_account_transactions|joint_account_deposit_splits|income_sources)/.test(sqlText(call)));
    expect(queries).toHaveLength(3);
    for (const query of queries) expect(query.values).toContain(7);

    const deposits = sqlText(queries[0]);
    expect(deposits).toContain("t.type = 'deposit'");
    expect(deposits).toContain("t.bank_transfer_id IS NULL");
  });

  it("puts the range the right way round when the dates are given backwards", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    const response = await request(buildApp())
      .get("/dashboard/income-ledger")
      .query({ from: "2026-09-30", to: "2026-09-01" });

    expect(response.body).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("refuses a start date without an end date", async () => {
    const response = await request(buildApp()).get("/dashboard/income-ledger").query({ from: "2026-09-01" });

    expect(response.status).toBe(400);
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });
});
