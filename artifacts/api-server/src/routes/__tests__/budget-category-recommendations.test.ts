import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  groupId: 1,
  kind: "team",
  categories: [] as Array<{ groupId: number; name: string }>,
  inserted: [] as Array<Record<string, unknown>>,
}));

const tables = vi.hoisted(() => ({
  groupsTable: { id: "group.id", kind: "group.kind" },
  budgetCategoriesTable: {
    id: "category.id",
    groupId: "category.groupId",
    name: "category.name",
    priority: "category.priority",
  },
  expensesTable: { groupId: "expense.groupId", category: "expense.category" },
  jointAccountTxTable: { groupId: "bank.groupId", expenseCategory: "bank.expenseCategory" },
}));

function selectFromState(fields: Record<string, unknown>) {
  return {
    from: () => ({
      where: (condition: { value?: unknown }) => {
        const groupId = Number(condition.value);
        const rows = "kind" in fields
          ? [{ kind: state.kind }]
          : state.categories.filter((category) => category.groupId === groupId).map(({ name }) => ({ name }));
        return "kind" in fields ? { limit: () => Promise.resolve(rows) } : Promise.resolve(rows);
      },
    }),
  };
}

vi.mock("@workspace/db", () => {
  const insert = vi.fn(() => ({
    values: (rows: Record<string, unknown>[]) => {
      state.inserted.push(...rows);
      state.categories.push(...rows.map((row) => ({
        groupId: row.groupId as number,
        name: row.name as string,
      })));
      return { onConflictDoNothing: () => Promise.resolve() };
    },
  }));
  const tx = { select: vi.fn(selectFromState), insert };
  return {
    db: {
      select: vi.fn(selectFromState),
      transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
      query: { budgetCategoriesTable: { findFirst: vi.fn() } },
    },
    groupsTable: tables.groupsTable,
    budgetCategoriesTable: tables.budgetCategoriesTable,
    expensesTable: tables.expensesTable,
    jointAccountTxTable: tables.jointAccountTxTable,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ne: vi.fn(),
  // Applying suggestions now reads the parent categories back so that the
  // suggested sub-categories land underneath them. Without this the route
  // calls an undefined function and every apply answers 500.
  inArray: vi.fn((column: unknown, values: unknown) => ({ column, values })),
  sql: vi.fn(),
}));

import { db } from "@workspace/db";
import budgetCategoriesRouter from "../budget-categories.js";

function buildApp(role: "owner" | "admin" | "member", groupId = state.groupId) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.group = { id: groupId, role };
    next();
  });
  app.use("/", budgetCategoriesRouter);
  return app;
}

describe("POST /budget-categories/recommendations/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.groupId = 1;
    state.kind = "team";
    state.categories = [];
    state.inserted = [];
  });

  it("does not let a non-manager apply recommendations", async () => {
    const response = await request(buildApp("member")).post("/budget-categories/recommendations/apply").send({});

    expect(response.status).toBe(403);
    expect((db as any).transaction).not.toHaveBeenCalled();
    expect(state.inserted).toEqual([]);
  });

  it("treats case-variant existing names as present without overwriting them", async () => {
    state.categories = [{ groupId: 1, name: "tOoLs" }];

    const response = await request(buildApp("owner")).post("/budget-categories/recommendations/apply").send({});

    expect(response.status).toBe(200);
    expect(state.categories).toContainEqual({ groupId: 1, name: "tOoLs" });
    expect(state.inserted.map((row) => row.name)).not.toContain("Tools");
    expect(response.body.existing).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Tools", exists: true }),
    ]));
  });

  it("adds only missing recommendations for the active workspace", async () => {
    state.groupId = 9;
    state.categories = [
      { groupId: 9, name: "Travel" },
      { groupId: 2, name: "Tools" },
    ];

    const response = await request(buildApp("admin", 9)).post("/budget-categories/recommendations/apply").send({});

    expect(response.status).toBe(200);
    expect(state.inserted).not.toHaveLength(0);
    expect(state.inserted.every((row) => row.groupId === 9)).toBe(true);
    expect(state.inserted.map((row) => row.name)).not.toContain("Travel");
    expect(state.categories).toContainEqual({ groupId: 2, name: "Tools" });
  });
});