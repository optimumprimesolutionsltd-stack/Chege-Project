/**
 * A category becomes a tracked debt when debtBalance is set on it through
 * this same PUT route — no separate debts table. These cover the validation
 * that keeps a debt's numbers sane: balance never negative, rate a real
 * percentage (basis points, so 0-10000 inclusive).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  budgetCategoriesTable: { id: "category.id", groupId: "category.groupId", name: "category.name" },
  expensesTable: { groupId: "expense.groupId", category: "expense.category" },
  expenseCategoryAllocationsTable: { groupId: "allocation.groupId", category: "allocation.category" },
  jointAccountTxTable: { groupId: "bank.groupId", expenseCategory: "bank.expenseCategory" },
}));

const existing = {
  id: 8,
  groupId: 1,
  name: "Fuliza",
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

describe("tracking a debt on a budget category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => Promise.resolve([existing]) }) }) });
    mockedDb.query.budgetCategoriesTable.findFirst.mockResolvedValue(undefined);
  });

  it("accepts a balance and interest rate", async () => {
    mockSuccessfulUpdate({ ...existing, debtBalance: 3000, debtInterestRateBps: 1200 });

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ debtBalance: 3000, debtInterestRateBps: 1200 });

    expect(response.status).toBe(200);
    expect(response.body.debtBalance).toBe(3000);
    expect(response.body.debtInterestRateBps).toBe(1200);
  });

  it("accepts clearing both fields back to null to stop tracking", async () => {
    mockSuccessfulUpdate({ ...existing, debtBalance: null, debtInterestRateBps: null });

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ debtBalance: null, debtInterestRateBps: null });

    expect(response.status).toBe(200);
    expect(response.body.debtBalance).toBeNull();
  });

  it("rejects a negative balance", async () => {
    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ debtBalance: -500 });

    expect(response.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects an interest rate above 100% (10000 basis points)", async () => {
    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ debtBalance: 1000, debtInterestRateBps: 10001 });

    expect(response.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects a negative interest rate", async () => {
    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ debtBalance: 1000, debtInterestRateBps: -1 });

    expect(response.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});
