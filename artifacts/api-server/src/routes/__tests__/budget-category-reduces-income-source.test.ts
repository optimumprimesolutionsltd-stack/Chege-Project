/**
 * A category can name the income source it is a cost of earning — stock
 * bought for a side hustle sold through M-Pesa, say — so the income-streams
 * report can work its spend out of that stream's profit (see dashboard.ts's
 * incomeStreamCostsBySource). These cover the one thing the route itself is
 * responsible for: the link can only point at an income source that is
 * actually in this budget.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  budgetCategoriesTable: { id: "category.id", groupId: "category.groupId", name: "category.name" },
  expensesTable: { groupId: "expense.groupId", category: "expense.category" },
  expenseCategoryAllocationsTable: { groupId: "allocation.groupId", category: "allocation.category" },
  jointAccountTxTable: { groupId: "bank.groupId", expenseCategory: "bank.expenseCategory" },
  incomeSourcesTable: { id: "source.id", groupId: "source.groupId" },
}));

const existingCategory = {
  id: 8,
  groupId: 1,
  name: "Stock",
  budgetAmount: 0,
  priority: 1,
  color: "#6B7280",
  isRecurring: true,
  activeMonth: null,
  activeYear: null,
  parentId: null,
  isArchived: false,
  debtBalance: null,
  debtInterestRateBps: null,
  reducesIncomeSourceId: null,
};

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    query: { budgetCategoriesTable: { findFirst: vi.fn() } },
    transaction: vi.fn(),
  },
  budgetCategoriesTable: tables.budgetCategoriesTable,
  expensesTable: tables.expensesTable,
  expenseCategoryAllocationsTable: tables.expenseCategoryAllocationsTable,
  jointAccountTxTable: tables.jointAccountTxTable,
  incomeSourcesTable: tables.incomeSourcesTable,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ne: vi.fn(),
}));

import { db } from "@workspace/db";
import budgetCategoriesRouter from "../budget-categories.js";

const mockedDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  query: { budgetCategoriesTable: { findFirst: ReturnType<typeof vi.fn> } };
  transaction: ReturnType<typeof vi.fn>;
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.group = { id: 1, role: "owner" };
    next();
  });
  app.use("/", budgetCategoriesRouter);
  return app;
}

/** Discriminates by the shape of the select rather than call order, so it survives the route calling things in a different sequence. */
function mockSelects(options: { category?: Record<string, unknown> | undefined; incomeSourceExists: boolean }) {
  mockedDb.select.mockImplementation((columns?: Record<string, unknown>) => {
    if (columns && "id" in columns && !("name" in columns)) {
      // incomeSourceRejection's own select: { id: incomeSourcesTable.id }
      const rows = options.incomeSourceExists ? [{ id: 42 }] : [];
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
    }
    // The plain `.select()` (no columns) reading the category being updated.
    const rows = options.category ? [options.category] : [];
    return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
  });
}

function mockSuccessfulUpdate(updated: Record<string, unknown>) {
  const noopWhere = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn()
    .mockReturnValueOnce({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })) })
    .mockReturnValueOnce({ set: vi.fn(() => ({ where: noopWhere })) })
    .mockReturnValueOnce({ set: vi.fn(() => ({ where: noopWhere })) })
    .mockReturnValueOnce({ set: vi.fn(() => ({ where: noopWhere })) });
  mockedDb.transaction.mockImplementation((callback: (tx: { update: typeof update }) => unknown) => callback({ update }));
  return update;
}

function mockSuccessfulInsert(created: Record<string, unknown>) {
  const insert = vi.fn().mockReturnValue({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([created]) })) });
  mockedDb.transaction.mockImplementation((callback: (tx: { insert: typeof insert }) => unknown) => callback({ insert }));
  return insert;
}

describe("linking a budget category to the income source it reduces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.query.budgetCategoriesTable.findFirst.mockResolvedValue(undefined);
  });

  it("PUT rejects an income source id that is not in this budget", async () => {
    mockSelects({ category: existingCategory, incomeSourceExists: false });

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ reducesIncomeSourceId: 999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/income stream/i);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("PUT accepts and persists a valid income source id", async () => {
    mockSelects({ category: existingCategory, incomeSourceExists: true });
    mockSuccessfulUpdate({ ...existingCategory, reducesIncomeSourceId: 42 });

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ reducesIncomeSourceId: 42 });

    expect(response.status).toBe(200);
    expect(response.body.reducesIncomeSourceId).toBe(42);
  });

  it("PUT accepts clearing the link back to null", async () => {
    mockSelects({ category: { ...existingCategory, reducesIncomeSourceId: 42 }, incomeSourceExists: true });
    mockSuccessfulUpdate({ ...existingCategory, reducesIncomeSourceId: null });

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ reducesIncomeSourceId: null });

    expect(response.status).toBe(200);
    expect(response.body.reducesIncomeSourceId).toBeNull();
    expect(mockedDb.transaction).toHaveBeenCalled();
  });

  it("POST rejects an income source id that is not in this budget", async () => {
    mockSelects({ category: undefined, incomeSourceExists: false });

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Stock", budgetAmount: 0, reducesIncomeSourceId: 999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/income stream/i);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("POST accepts and persists a valid income source id", async () => {
    mockSelects({ category: undefined, incomeSourceExists: true });
    mockSuccessfulInsert({ ...existingCategory, id: 10, name: "Stock", reducesIncomeSourceId: 42 });

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Stock", budgetAmount: 0, reducesIncomeSourceId: 42 });

    expect(response.status).toBe(201);
    expect(response.body.reducesIncomeSourceId).toBe(42);
  });
});
