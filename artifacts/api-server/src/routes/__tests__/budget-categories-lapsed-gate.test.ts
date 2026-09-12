/**
 * POST /budget-categories did not check subscription status at all - a
 * lapsed manager, Personal budget or Shared group alike, could keep adding
 * categories forever. Found alongside the same gap in contributors.ts and
 * income-sources.ts while chasing a real report of a lapsed member still
 * being able to "work and save". The three bulk "apply" routes
 * (recommendations, subcategory-suggestions, migration) insert new
 * categories the same way and are gated for the same reason, but are not
 * re-tested individually here - they share the one call to
 * requireTransactionEligibility this file exercises directly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const tables = vi.hoisted(() => ({
  budgetCategoriesTable: { id: "category.id", groupId: "category.groupId", name: "category.name" },
}));

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  query: { budgetCategoriesTable: { findFirst: vi.fn() } },
}));

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(
    async (): Promise<{ status: string | null; fullAccess: boolean }> =>
      ({ status: "active", fullAccess: true }),
  ),
}));

vi.mock("@workspace/db", () => ({
  db: dbMocks,
  budgetCategoriesTable: tables.budgetCategoriesTable,
  expensesTable: {},
  expenseCategoryAllocationsTable: {},
  groupsTable: {},
  jointAccountTxTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  asc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: unknown) => ({ inArray: { column, values } })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: { column, value } })),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));

vi.mock("../../lib/categoryPacks", () => ({
  categoryPackChildren: vi.fn(() => []),
  categoryPackForKind: vi.fn(() => []),
  categoryPackRows: vi.fn(() => []),
  normalizedCategoryPackKind: vi.fn(() => null),
  priorityTiersForKind: vi.fn(() => []),
  subcategorySuggestions: vi.fn(() => []),
}));

vi.mock("../../lib/subscription-catalog", () => ({ resolveMemberEntitlements: mockResolve }));

const { default: budgetCategoriesRouter } = await import("../budget-categories");

function appFor(isPrivate: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: { id: number; role: string; isPrivate: boolean } }).group =
      { id: 7, role: "owner", isPrivate };
    (req as unknown as { user: { id: string } }).user = { id: "user-1" };
    next();
  });
  app.use(budgetCategoriesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ status: "active", fullAccess: true });
  dbMocks.query.budgetCategoriesTable.findFirst.mockResolvedValue(undefined);
  dbMocks.insert.mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([{ id: 1, name: "Groceries", budgetAmount: 5000 }]) }),
  });
});

const NEW_CATEGORY = { name: "Groceries", budgetAmount: 5_000, isRecurring: true };

describe.each([
  ["a Personal budget", true],
  ["a Shared group", false],
])("POST /budget-categories in %s", (_label, isPrivate) => {
  it("refuses a lapsed manager with 402, and writes nothing", async () => {
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });

    const response = await request(appFor(isPrivate)).post("/budget-categories").send(NEW_CATEGORY);

    expect(response.status).toBe(402);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("lets a current subscriber add a category", async () => {
    const response = await request(appFor(isPrivate)).post("/budget-categories").send(NEW_CATEGORY);

    expect(response.status).toBe(201);
    expect(dbMocks.insert).toHaveBeenCalled();
  });
});
