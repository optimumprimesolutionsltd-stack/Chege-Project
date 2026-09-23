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
    contributionsTable: table,
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

type MockableDb = { execute: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };
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

function mockIncomeSources(rows: Array<{ id: number; name: string }>) {
  const chain = { from: () => chain, where: () => Promise.resolve(rows) };
  mockedDb.select.mockReturnValue(chain as never);
}

function sqlValues(): unknown[] {
  return sqlMock.mock.calls.flatMap((call: unknown[]) => call.slice(1));
}

// The single-month income streams report answers "how did this month go";
// this answers "is this stream slipping", the question a treasurer actually
// asks next, which needs the same total against a row of months.
describe("GET /dashboard/income-streams-trend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncomeSources([{ id: 1, name: "Ujenzi salary" }, { id: 2, name: "Rental income" }]);
    mockedDb.execute.mockResolvedValue({ rows: [] });
  });

  it("defaults to the last six months, ending with the current one", async () => {
    const response = await request(buildApp()).get("/dashboard/income-streams-trend");

    expect(response.status).toBe(200);
    expect(response.body.months).toHaveLength(6);
  });

  it("clamps the requested span to between one and twelve months", async () => {
    const tooMany = await request(buildApp()).get("/dashboard/income-streams-trend?months=99");
    expect(tooMany.body.months).toHaveLength(12);

    // 0 is falsy, so it falls back to the default of 6 rather than clamping
    // to 1 — the same behaviour /dashboard/trends already has.
    const tooFew = await request(buildApp()).get("/dashboard/income-streams-trend?months=-5");
    expect(tooFew.body.months).toHaveLength(1);
  });

  it("lists every income source even before any funding is fetched", async () => {
    const response = await request(buildApp()).get("/dashboard/income-streams-trend");

    expect(response.body.streams.map((s: { sourceName: string }) => s.sourceName).sort()).toEqual([
      "Rental income",
      "Ujenzi salary",
    ]);
  });

  it("places each month's funding in the right column, per stream", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [
        { incomeSourceId: 1, sourceName: "Ujenzi salary", year: 2026, month: 7, amount: "58000" },
        { incomeSourceId: 1, sourceName: "Ujenzi salary", year: 2026, month: 9, amount: "60000" },
      ],
    });

    const response = await request(buildApp()).get("/dashboard/income-streams-trend?months=3");

    const ujenzi = response.body.streams.find((s: { incomeSourceId: number }) => s.incomeSourceId === 1);
    expect(ujenzi.amounts).toEqual([58_000, 0, 60_000]);
    expect(ujenzi.total).toBe(118_000);
  });

  it("unions in every funding source the single-month report does", async () => {
    await request(buildApp()).get("/dashboard/income-streams-trend");

    const statement = sqlMock.mock.calls
      .map((call: unknown[]) => call[0] as TemplateStringsArray)
      .find((strings) => strings.join("").includes("WITH funding AS"));
    const text = statement?.join("") ?? "";
    expect(text).toContain("expense_income_splits");
    expect(text).toContain("joint_account_deposit_splits");
    expect(text).toContain("savings_goal_contributions");
  });

  it("excludes a settlement and a loan the same way the single-month report does", async () => {
    // A repayment or a loan reaching the account is not income — see
    // repayment-is-not-income.test.ts and borrowing-is-not-income.test.ts.
    await request(buildApp()).get("/dashboard/income-streams-trend");

    const statement = sqlMock.mock.calls
      .map((call: unknown[]) => call[0] as TemplateStringsArray)
      .find((strings) => strings.join("").includes("WITH funding AS"));
    const text = statement?.join("") ?? "";
    expect((text.match(/AND deposit\.settles_contributor_id IS NULL/g) ?? []).length).toBe(2);
    expect((text.match(/AND NOT deposit\.is_borrowing/g) ?? []).length).toBe(2);
  });

  it("scopes the whole range to the group asked for", async () => {
    await request(buildApp()).get("/dashboard/income-streams-trend");

    expect(sqlValues()).toContain(1);
  });
});
