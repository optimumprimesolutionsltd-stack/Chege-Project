/**
 * Onboarding asks amounts against a category's subcategories, never the
 * category itself (5 Oct 2026). The plan route makes each subcategory under
 * its category and leaves the category as a heading with no amount of its own.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

type Row = { id: number; name: string; parentId: number | null; budgetAmount: number; debtBalance: number | null };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  // The name each findFirst is asked for, in order, since the where clause is
  // mocked away.
  lookups: [] as string[],
  nextId: 100,
  updates: [] as Array<{ id: number | null; values: Record<string, unknown> }>,
  pendingUpdate: null as Record<string, unknown> | null,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn((_column: unknown, value: unknown) => ({ eq: value })),
  sql: vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => {
    // lower(btrim(column)) = lower(btrim(name)): the name is the second value.
    state.lookups.push(String(_values[1]));
    return {};
  }),
}));

vi.mock("@workspace/db", () => {
  const categories = { __table: "categories" };
  const planCategories = { __table: "planCategories" };
  const plans = { __table: "plans" };
  const tx = {
    query: {
      budgetCategoriesTable: {
        findFirst: () => {
          const name = state.lookups.shift() ?? "";
          return Promise.resolve(state.rows.find((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase()));
        },
      },
    },
    insert: (table: { __table: string }) => ({
      values: (values: Record<string, unknown>) => {
        let created: unknown = values;
        if (table.__table === "categories") {
          const row: Row = { id: state.nextId++, name: String(values.name), parentId: (values.parentId as number | undefined) ?? null, budgetAmount: Number(values.budgetAmount), debtBalance: null };
          state.rows.push(row);
          created = row;
        } else if (table.__table === "plans") {
          created = { id: 1, ...values };
        }
        const done = Promise.resolve(undefined) as Promise<undefined> & { returning: () => Promise<unknown[]> };
        done.returning = () => Promise.resolve([created]);
        return done;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (clause: { eq?: number }) => {
          const id = clause?.eq ?? null;
          state.updates.push({ id, values });
          const row = state.rows.find((item) => item.id === id);
          if (row && typeof values.budgetAmount === "number") row.budgetAmount = values.budgetAmount;
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    db: { transaction: (run: (t: typeof tx) => Promise<unknown>) => run(tx) },
    budgetCategoriesTable: categories,
    budgetPlanCategoriesTable: planCategories,
    budgetPlansTable: plans,
  };
});

import budgetPlansRouter from "../budget-plans.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "user-1" };
    req.group = { id: 1, role: "owner" };
    next();
  });
  server.use("/", budgetPlansRouter);
  return server;
}

const plan = (categories: unknown[]) => ({ name: "My budget", purpose: "working", durationType: "ongoing", startDate: "2026-10-05", endDate: null, categories });

beforeEach(() => {
  state.rows = [];
  state.lookups = [];
  state.nextId = 100;
  state.updates = [];
});

describe("POST /budget-plans/onboarding with subcategories", () => {
  it("makes each subcategory under its category, with the amount on the subcategory", async () => {
    const response = await request(app()).post("/budget-plans/onboarding").send(plan([
      { name: "Food", plannedAmount: 12000, priority: 1, subcategories: [{ name: "Groceries", plannedAmount: 8000 }, { name: "Eating out", plannedAmount: 4000 }] },
    ]));
    expect(response.status).toBe(201);
    const food = state.rows.find((row) => row.name === "Food")!;
    expect(food).toMatchObject({ parentId: null, budgetAmount: 0 });
    expect(state.rows.filter((row) => row.parentId === food.id).map(({ name, budgetAmount }) => ({ name, budgetAmount }))).toEqual([
      { name: "Groceries", budgetAmount: 8000 },
      { name: "Eating out", budgetAmount: 4000 },
    ]);
  });

  it("fills in a subcategory a starter pack already made, without overwriting one already set", async () => {
    state.rows = [
      { id: 1, name: "Food", parentId: null, budgetAmount: 0, debtBalance: null },
      { id: 2, name: "Groceries", parentId: 1, budgetAmount: 0, debtBalance: null },
      { id: 3, name: "Eating out", parentId: 1, budgetAmount: 1500, debtBalance: null },
    ];
    await request(app()).post("/budget-plans/onboarding").send(plan([
      { name: "food", plannedAmount: 12000, priority: 1, subcategories: [{ name: "Groceries", plannedAmount: 8000 }, { name: "Eating out", plannedAmount: 4000 }] },
    ])).expect(201);
    expect(state.rows.find((row) => row.id === 2)?.budgetAmount).toBe(8000);
    expect(state.rows.find((row) => row.id === 3)?.budgetAmount).toBe(1500);
    // "food" found "Food" rather than making a second one.
    expect(state.rows.filter((row) => row.name.toLowerCase() === "food")).toHaveLength(1);
  });

  it("turns an existing category with its own amount into a heading once it gains subcategories", async () => {
    state.rows = [{ id: 1, name: "Housing", parentId: null, budgetAmount: 20000, debtBalance: null }];
    await request(app()).post("/budget-plans/onboarding").send(plan([
      { name: "Housing", plannedAmount: 15000, priority: 1, subcategories: [{ name: "Rent", plannedAmount: 15000 }] },
    ])).expect(201);
    expect(state.rows.find((row) => row.id === 1)?.budgetAmount).toBe(0);
    expect(state.rows.find((row) => row.name === "Rent")).toMatchObject({ parentId: 1, budgetAmount: 15000 });
  });

  it("leaves a same-named category elsewhere in the budget where it is", async () => {
    state.rows = [{ id: 5, name: "Rent", parentId: null, budgetAmount: 9000, debtBalance: null }];
    await request(app()).post("/budget-plans/onboarding").send(plan([
      { name: "Housing", plannedAmount: 15000, priority: 1, subcategories: [{ name: "Rent", plannedAmount: 15000 }] },
    ])).expect(201);
    expect(state.rows.find((row) => row.id === 5)).toMatchObject({ parentId: null, budgetAmount: 9000 });
  });

  it("keeps the web's plain category amounts working when no subcategories are sent", async () => {
    await request(app()).post("/budget-plans/onboarding").send(plan([{ name: "Transport", plannedAmount: 5000, priority: 2 }])).expect(201);
    expect(state.rows).toEqual([expect.objectContaining({ name: "Transport", parentId: null, budgetAmount: 5000 })]);
  });
});
