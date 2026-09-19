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

const mockedDb = db as unknown as { select: ReturnType<typeof vi.fn> };

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

/** The route fires three selects: expenses, disbursements, allocations. */
function queueLedger(expenses: unknown[], disbursements: unknown[], allocations: unknown[] = []) {
  for (const rows of [expenses, disbursements]) {
    mockedDb.select.mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: () => Promise.resolve(rows) }) }),
    });
  }
  mockedDb.select.mockReturnValueOnce({
    from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(allocations) }) }) }),
  });
}

function sqlValues(): unknown[] {
  return sqlMock.mock.calls.flatMap((call) => call.slice(1) as unknown[]);
}

const shop = {
  id: 12,
  category: "Food",
  description: "Naivas shopping",
  amount: 2400,
  paidFromBank: false,
  payerName: "Jane",
  date: "2026-09-15",
};

// Every other way into the expenses goes through a category or a named thing
// first. None of them answered "show me everything that happened".
describe("GET /dashboard/expense-ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists an expense whatever its category", async () => {
    queueLedger([shop], []);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.status).toBe(200);
    expect(response.body.entries).toEqual([{
      id: "expense-12",
      source: "expense",
      categories: ["Food"],
      description: "Naivas shopping",
      amount: 2400,
      paidFromBank: false,
      payerName: "Jane",
      date: "2026-09-15",
    }]);
    expect(response.body.total).toBe(2400);
  });

  it("lists a split expense once, not once per category", async () => {
    // A shop split across Food and Household is one thing that happened;
    // listing it twice would read as two separate trips.
    queueLedger([shop], [], [
      { expenseId: 12, category: "Food", position: 0 },
      { expenseId: 12, category: "Household", position: 1 },
    ]);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0].categories).toEqual(["Food", "Household"]);
    // The row still carries the whole amount, so the total is the real spend.
    expect(response.body.total).toBe(2400);
  });

  it("includes a standalone bank disbursement", async () => {
    queueLedger([], [{
      id: 3,
      category: "Rent",
      description: "Landlord",
      amount: 35_000,
      payerName: null,
      date: "2026-09-01",
    }]);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.body.entries[0]).toMatchObject({
      id: "bank-disbursement-3",
      source: "bank_disbursement",
      paidFromBank: true,
      payerName: "Joint bank",
    });
  });

  it("puts the newest first, whichever source it came from", async () => {
    queueLedger(
      [{ ...shop, date: "2026-09-10" }],
      [{ id: 3, category: "Rent", description: "Landlord", amount: 35_000, payerName: null, date: "2026-09-20" }],
    );

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.body.entries.map((entry: { date: string }) => entry.date))
      .toEqual(["2026-09-20", "2026-09-10"]);
  });

  it("names the joint bank rather than leaving a payer blank", async () => {
    queueLedger([{ ...shop, payerName: null, paidFromBank: true }], []);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.body.entries[0].payerName).toBe("Joint bank");
  });

  it("says so plainly when nobody was recorded", async () => {
    queueLedger([{ ...shop, payerName: null, paidFromBank: false }], []);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30");

    expect(response.body.entries[0].payerName).toBe("Payer not recorded");
  });
});

describe("the span the combined ledger answers about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers the selected month when no dates are given", async () => {
    queueLedger([], []);

    const response = await request(buildApp()).get("/dashboard/expense-ledger?month=2&year=2024");

    // 2024 is a leap year — the last day is found, not assumed to be the 28th.
    expect(response.body).toMatchObject({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("reads a backwards range as the span between the two dates", async () => {
    queueLedger([], []);

    const response = await request(buildApp())
      .get("/dashboard/expense-ledger?from=2026-09-30&to=2026-09-01");

    expect(response.body).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("refuses half a range rather than answering about a different span", async () => {
    for (const half of ["from=2026-09-01", "to=2026-09-30"]) {
      vi.clearAllMocks();
      const response = await request(buildApp()).get(`/dashboard/expense-ledger?${half}`);
      expect(response.status).toBe(400);
      expect(mockedDb.select).not.toHaveBeenCalled();
    }
  });

  it("treats a search as text, not as a pattern", async () => {
    queueLedger([], []);

    await request(buildApp()).get("/dashboard/expense-ledger?q=50%25 off");

    expect(sqlValues()).toContain("%50!% off%");
  });
});
