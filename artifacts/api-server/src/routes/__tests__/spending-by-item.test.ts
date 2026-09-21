import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { sqlMock } = vi.hoisted(() => {
  const mock: any = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }));
  return { sqlMock: mock };
});

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
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", dashboardRouter);
  return app;
}

const netflix = {
  description: "Netflix",
  total: "3600",
  count: "3",
  firstDate: "2026-07-05",
  lastDate: "2026-09-05",
  categories: ["Entertainment"],
};

/** Every value handed to the SQL builder, flattened. */
function sqlValues(): unknown[] {
  return sqlMock.mock.calls.flatMap((call: unknown[]) => call.slice(1));
}

// Categories answer "how much on Food". Nobody budgets a category called
// Netflix, so until now there was no way to ask what a particular thing cost.
describe("GET /dashboard/spending-by-item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.execute.mockResolvedValue({ rows: [netflix] });
  });

  it("adds up what was spent on each named thing", async () => {
    const response = await request(buildApp()).get("/dashboard/spending-by-item");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([{
      description: "Netflix",
      total: 3600,
      count: 3,
      firstDate: "2026-07-05",
      lastDate: "2026-09-05",
      categories: ["Entertainment"],
    }]);
    expect(response.body.total).toBe(3600);
  });

  it("answers about the last twelve months when asked about no range", async () => {
    // "How much do I spend on rent" is not a question about one month, and a
    // default covering only the current one would answer it wrongly far more
    // often than not.
    const response = await request(buildApp()).get("/dashboard/spending-by-item");

    const from = new Date(response.body.from);
    const to = new Date(response.body.to);
    const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    expect(months).toBe(12);
  });

  it("answers about the exact days asked for", async () => {
    const response = await request(buildApp())
      .get("/dashboard/spending-by-item?from=2026-01-01&to=2026-03-31");

    expect(response.body).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
    expect(sqlValues()).toContain("2026-01-01");
    expect(sqlValues()).toContain("2026-03-31");
  });

  it("reads a backwards range as the span between the two dates", async () => {
    const response = await request(buildApp())
      .get("/dashboard/spending-by-item?from=2026-03-31&to=2026-01-01");

    expect(response.body).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("refuses half a range rather than answering about a different span", async () => {
    for (const half of ["from=2026-01-01", "to=2026-03-31"]) {
      const response = await request(buildApp()).get(`/dashboard/spending-by-item?${half}`);
      expect(response.status).toBe(400);
    }
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("treats a search as text, not as a pattern", async () => {
    // Somebody typing "50% off" is naming a shop, not writing SQL. Without
    // escaping, the % would match anything and the row would be wrong.
    await request(buildApp()).get("/dashboard/spending-by-item?q=50%25 off");

    expect(sqlValues()).toContain("%50!% off%");
  });

  it("escapes the escape character itself", async () => {
    await request(buildApp()).get("/dashboard/spending-by-item?q=" + encodeURIComponent("wow!"));

    expect(sqlValues()).toContain("%wow!!%");
  });

  it("searches on nothing when the box is empty", async () => {
    await request(buildApp()).get("/dashboard/spending-by-item?q=%20%20");

    expect(sqlValues().some((value) => typeof value === "string" && value.startsWith("%"))).toBe(false);
  });

  it("narrows to one category when asked", async () => {
    await request(buildApp()).get("/dashboard/spending-by-item?category=Entertainment");

    expect(sqlValues()).toContain("Entertainment");
  });

  it("survives a row whose categories came back empty", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [{ ...netflix, categories: null }] });

    const response = await request(buildApp()).get("/dashboard/spending-by-item");

    expect(response.status).toBe(200);
    expect(response.body.items[0].categories).toEqual([]);
  });

  it("trims a timestamp back to the day it happened", async () => {
    // Postgres hands dates back as a string; a driver that widens them to a
    // timestamp would otherwise leak the time into the UI.
    mockedDb.execute.mockResolvedValue({
      rows: [{ ...netflix, firstDate: "2026-07-05T00:00:00.000Z", lastDate: "2026-09-05T00:00:00.000Z" }],
    });

    const response = await request(buildApp()).get("/dashboard/spending-by-item");

    expect(response.body.items[0]).toMatchObject({ firstDate: "2026-07-05", lastDate: "2026-09-05" });
  });
});

// "KES 3,600 on Netflix" invites "which three?" — a total that cannot be
// checked is a total that has to be believed.
describe("the expenses behind one thing's total", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nothing extra until a thing is named", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [netflix] });

    const response = await request(buildApp()).get("/dashboard/spending-by-item");

    expect(response.body.entries).toBeNull();
    // One query, not two: the entry list is not loaded for a list of totals.
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });

  it("lists them newest first when one is named", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [netflix] })
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          date: "2026-09-05",
          description: "Netflix",
          amount: "1200",
          category: "Entertainment",
          paidFromBank: false,
          preferredName: "Jane Wanjiku",
          firstName: "Jane",
          lastName: "Wanjiku",
        }],
      });

    const response = await request(buildApp()).get("/dashboard/spending-by-item?item=netflix");

    expect(response.body.entries).toEqual([{
      id: 9,
      date: "2026-09-05",
      description: "Netflix",
      amount: 1200,
      category: "Entertainment",
      paidFromBank: false,
      payerName: "Jane Wanjiku",
    }]);
  });

  it("matches the name however it was typed", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    await request(buildApp()).get("/dashboard/spending-by-item?item=" + encodeURIComponent("  NETFLIX "));

    // Both the grouping and the entry list are asked about the same spelling.
    expect(sqlValues().filter((value) => value === "  NETFLIX ")).toHaveLength(2);
  });

  it("names a bank-funded expense rather than leaving the payer blank", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [netflix] })
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          date: "2026-09-05",
          description: "Netflix",
          amount: "1200",
          category: "Entertainment",
          paidFromBank: true,
          preferredName: null,
          firstName: null,
          lastName: null,
        }],
      });

    const response = await request(buildApp()).get("/dashboard/spending-by-item?item=Netflix");

    expect(response.body.entries[0].payerName).toBe("The group");
  });

  it("says so plainly when nobody was recorded", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [netflix] })
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          date: "2026-09-05",
          description: "Netflix",
          amount: "1200",
          category: "Entertainment",
          paidFromBank: false,
          preferredName: null,
          firstName: null,
          lastName: null,
        }],
      });

    const response = await request(buildApp()).get("/dashboard/spending-by-item?item=Netflix");

    expect(response.body.entries[0].payerName).toBe("Payer not recorded");
  });
});
