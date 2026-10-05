/**
 * A category with subcategories is a heading: its budget is theirs added up
 * and it never holds an amount of its own (5 Oct 2026). Both apps hide the
 * amount box on one; the route refuses it too, for an older app or a direct
 * request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ selects: [] as unknown[][] }));

vi.mock("@workspace/db", () => ({
  db: {
    // Each select answers with the next prepared result: the category first,
    // then whether it has a subcategory.
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(state.selects.shift() ?? []) }) }) })),
    query: { budgetCategoriesTable: { findFirst: vi.fn().mockResolvedValue(undefined) } },
    transaction: vi.fn(),
  },
  budgetCategoriesTable: { id: "category.id", groupId: "category.groupId", name: "category.name", parentId: "category.parentId" },
  expensesTable: {},
  expenseCategoryAllocationsTable: {},
  jointAccountTxTable: {},
  groupsTable: {},
  incomeSourcesTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn(),
  ne: vi.fn(),
  sql: vi.fn(),
}));

import { db } from "@workspace/db";
import budgetCategoriesRouter from "../budget-categories.js";

const mockedDb = db as unknown as { transaction: ReturnType<typeof vi.fn> };

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

const food = { id: 3, groupId: 1, name: "Food", budgetAmount: 0, priority: 1, color: "#6B7280", isRecurring: true, activeMonth: null, activeYear: null, parentId: null };

beforeEach(() => {
  vi.clearAllMocks();
  state.selects = [];
});

describe("PUT /budget-categories/:id on a heading", () => {
  it("refuses an amount on a category that has subcategories, and changes nothing", async () => {
    state.selects = [[food], [{ id: 9 }]];
    const response = await request(buildApp()).put("/budget-categories/3").send({ budgetAmount: 12000 });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("budgeted through its subcategories");
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("does not look for subcategories when no amount is being set", async () => {
    state.selects = [[food]];
    mockedDb.transaction.mockImplementation((run: (tx: unknown) => unknown) => run({
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ ...food, budgetAmount: 0 }]) }) }) }),
    }));
    const response = await request(buildApp()).put("/budget-categories/3").send({ budgetAmount: 0 });
    expect(response.status).toBe(200);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
