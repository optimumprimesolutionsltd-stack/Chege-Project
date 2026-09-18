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
// A ledger is what somebody opens to settle an argument about what was spent
// between two dates. This one could only ever answer "this calendar month".
describe("the span the ledger answers about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Every date bound handed to the SQL builder, in the order it was built. */
  function boundsAskedFor(): string[] {
    return sqlMock.mock.calls
      .flatMap((call) => call.slice(1) as unknown[])
      .filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  async function askLedger(query: string) {
    queueLedgerQueries([{ name: "Food" }], [], []);
    const response = await request(buildApp()).get(`/dashboard/category-ledger?${query}`);
    expect(response.status).toBe(200);
    return boundsAskedFor();
  }

  it("still answers about the whole month when no dates are given", async () => {
    // Every caller that existed before the range did asks for exactly this.
    const bounds = await askLedger("month=2&year=2024&category=Food&isBudgeted=true");
    expect(bounds).toContain("2024-02-01");
    // 2024 is a leap year — the last day is found, not assumed to be the 28th.
    expect(bounds).toContain("2024-02-29");
    expect(bounds).not.toContain("2024-03-01");
  });

  it("answers about the exact days asked for", async () => {
    const bounds = await askLedger("month=8&year=2026&category=Food&isBudgeted=true&from=2026-08-10&to=2026-09-05");
    expect(bounds).toContain("2026-08-10");
    expect(bounds).toContain("2026-09-05");
    // The month it was opened from no longer bounds it.
    expect(bounds).not.toContain("2026-08-31");
  });

  it("reads a backwards range as the span between the two dates", async () => {
    const bounds = await askLedger("month=8&year=2026&category=Food&isBudgeted=true&from=2026-09-05&to=2026-08-10");
    expect(bounds).toContain("2026-08-10");
    expect(bounds).toContain("2026-09-05");
  });

  it("refuses half a range rather than answering about a different span", async () => {
    for (const half of ["from=2026-08-10", "to=2026-09-05"]) {
      vi.clearAllMocks();
      queueLedgerQueries([{ name: "Food" }], [], []);
      const response = await request(buildApp())
        .get(`/dashboard/category-ledger?month=8&year=2026&category=Food&isBudgeted=true&${half}`);
      expect(response.status).toBe(400);
      // A ledger that quietly answers the wrong question is worse than none.
      expect(boundsAskedFor()).toEqual([]);
    }
  });

  it("refuses a date it cannot read", async () => {
    queueLedgerQueries([{ name: "Food" }], [], []);
    const response = await request(buildApp())
      .get("/dashboard/category-ledger?month=8&year=2026&category=Food&isBudgeted=true&from=last-tuesday&to=2026-09-05");
    expect(response.status).toBe(400);
  });
});
