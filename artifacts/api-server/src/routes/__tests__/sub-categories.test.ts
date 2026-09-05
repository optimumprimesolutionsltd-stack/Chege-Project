/**
 * Sub-categories: the mini-ledger inside a budget category.
 *
 * Groceries is thirty purchases a month, not one, and belongs under Food
 * rather than beside it. The rules worth holding still are the two that keep
 * this from turning into a filing system:
 *
 *  - ledgers go exactly one level deep;
 *  - deleting the parent never quietly takes the ledgers with it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  budgetCategoriesTable: {
    id: "category.id",
    groupId: "category.groupId",
    name: "category.name",
    parentId: "category.parentId",
  },
  expensesTable: { groupId: "expense.groupId", category: "expense.category" },
  expenseCategoryAllocationsTable: { groupId: "allocation.groupId", category: "allocation.category" },
  jointAccountTxTable: { groupId: "bank.groupId", expenseCategory: "bank.expenseCategory" },
  groupsTable: { id: "group.id", kind: "group.kind" },
}));

const { selectRows, inserted } = vi.hoisted(() => ({
  /** Rows each successive db.select() chain resolves to, in call order. */
  selectRows: { queue: [] as unknown[][] },
  inserted: { values: [] as unknown[] },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = selectRows.queue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => Promise.resolve(rows);
      chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        inserted.values.push(values);
        return { returning: () => Promise.resolve([{ id: 99, ...(values as object) }]) };
      },
    })),
    delete: vi.fn(() => ({
      where: () => ({ returning: () => Promise.resolve([{ id: 7 }]) }),
    })),
    query: { budgetCategoriesTable: { findFirst: vi.fn(async () => undefined) } },
    transaction: vi.fn(),
  },
  budgetCategoriesTable: tables.budgetCategoriesTable,
  expensesTable: tables.expensesTable,
  expenseCategoryAllocationsTable: tables.expenseCategoryAllocationsTable,
  jointAccountTxTable: tables.jointAccountTxTable,
  groupsTable: tables.groupsTable,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ne: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));

import budgetCategoriesRouter from "../budget-categories.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: unknown }).group = { id: 1, role: "owner", isPrivate: true };
    next();
  });
  app.use("/", budgetCategoriesRouter);
  return app;
}

const utilities = { id: 4, parentId: null };
const wifi = { id: 5, parentId: 4 };

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.queue = [];
  inserted.values = [];
});

describe("creating a sub-category", () => {
  it("puts a ledger under a top-level category", async () => {
    selectRows.queue = [[utilities]];

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Wi-Fi", budgetAmount: 3_000, parentId: 4 });

    expect(response.status).toBe(201);
    expect(inserted.values[0]).toMatchObject({ name: "Wi-Fi", parentId: 4, groupId: 1 });
  });

  it("refuses to nest a ledger inside a ledger", async () => {
    // Wi-Fi already sits under Utilities, so nothing may sit under Wi-Fi.
    selectRows.queue = [[wifi]];

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Router rental", budgetAmount: 500, parentId: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/one level deep/i);
    expect(inserted.values).toHaveLength(0);
  });

  it("refuses a parent that is not in this budget", async () => {
    selectRows.queue = [[]];

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Wi-Fi", budgetAmount: 3_000, parentId: 4_242 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/does not exist/i);
    expect(inserted.values).toHaveLength(0);
  });

  it("still creates an ordinary top-level category, untouched", async () => {
    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Utilities", budgetAmount: 10_000 });

    expect(response.status).toBe(201);
    expect(inserted.values[0]).toMatchObject({ name: "Utilities", groupId: 1 });
    // No parent lookup should have happened at all.
    expect(selectRows.queue).toHaveLength(0);
  });

  it("accepts a ledger with no target of its own", async () => {
    // Groceries varies month to month. Tracking it is the point; judging it is
    // not, and 0 is how that is said.
    selectRows.queue = [[utilities]];

    const response = await request(buildApp())
      .post("/budget-categories")
      .send({ name: "Groceries", budgetAmount: 0, parentId: 4 });

    expect(response.status).toBe(201);
    expect(inserted.values[0]).toMatchObject({ name: "Groceries", budgetAmount: 0, parentId: 4 });
  });
});

describe("deleting a category that holds ledgers", () => {
  it("refuses, and names one of them", async () => {
    selectRows.queue = [[{ name: "Wi-Fi" }]];

    const response = await request(buildApp()).delete("/budget-categories/4");

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("Wi-Fi");
  });

  it("allows deleting a category with none", async () => {
    selectRows.queue = [[]];

    const response = await request(buildApp()).delete("/budget-categories/7");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});
