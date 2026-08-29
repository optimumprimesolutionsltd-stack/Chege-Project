import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  budgetCategoriesTable: { id: "category.id", groupId: "category.groupId", name: "category.name" },
  expensesTable: { groupId: "expense.groupId", category: "expense.category" },
  expenseCategoryAllocationsTable: { groupId: "allocation.groupId", category: "allocation.category" },
  jointAccountTxTable: { groupId: "bank.groupId", expenseCategory: "bank.expenseCategory" },
}));

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

describe("PUT /budget-categories/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries existing expense and bank totals into a renamed category", async () => {
    const existing = {
      id: 8,
      groupId: 1,
      name: "Nanny",
      budgetAmount: 18_000,
      priority: 1,
      color: "#6B7280",
      isRecurring: true,
      activeMonth: null,
      activeYear: null,
    };
    const updated = { ...existing, name: "Housekeeping" };
    mockedDb.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([existing]) }) }),
    });
    mockedDb.query.budgetCategoriesTable.findFirst.mockResolvedValue(undefined);

    const allocationWhere = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn()
      .mockReturnValueOnce({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updated]) })) })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({ where: allocationWhere })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      });
    mockedDb.transaction.mockImplementation((callback: (tx: { update: typeof update }) => unknown) => callback({ update }));

    const response = await request(buildApp())
      .put("/budget-categories/8")
      .send({ name: "Housekeeping" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Housekeeping");
    expect(update).toHaveBeenCalledTimes(4);
    expect(update.mock.results[1]?.value.set).toHaveBeenCalledWith({ category: "Housekeeping" });
    expect(update.mock.results[2]?.value.set).toHaveBeenCalledWith({ category: "Housekeeping" });
    expect(update.mock.results[3]?.value.set).toHaveBeenCalledWith({ expenseCategory: "Housekeeping" });
    // The allocation update is independent of position: it renames every
    // matching primary or secondary portion, scoped to the active group.
    expect(allocationWhere).toHaveBeenCalledWith([
      { column: "allocation.groupId", value: 1 },
      { column: "allocation.category", value: "Nanny" },
    ]);
  });
});