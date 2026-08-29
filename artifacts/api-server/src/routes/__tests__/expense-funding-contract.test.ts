import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })),
      transaction: vi.fn(),
      query: {
        membersTable: { findFirst: vi.fn() },
        incomeSourcesTable: { findFirst: vi.fn() },
      },
    },
    expensesTable: table, usersTable: table, membersTable: table,
    bankAccountsTable: table,
    groupMembershipsTable: table,
    incomeSourcesTable: table, expenseIncomeSplitsTable: table, jointAccountTxTable: table,
    expenseCategoryAllocationsTable: table,
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

import expensesRouter from "../expenses.js";
import { validateOtherExpenseNotes } from "../expenses.js";
import { db } from "@workspace/db";

function app(role: "owner" | "admin" | "member" = "owner") {
  const server = express();
  server.use(express.json());
  server.use((_req: any, _res, next) => {
    _req.isAuthenticated = () => true;
    _req.user = { id: "member-1" };
    _req.group = { id: 1, role };
    next();
  });
  server.use("/", expensesRouter);
  return server;
}

function mockExpenseUpdateReads(existing: Record<string, unknown>, allocations: unknown[]) {
  const rows = [existing];
  let read = 0;
  (db.transaction as any).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
    select: () => {
      read += 1;
      if (read === 1) {
        return { from: () => ({ where: () => ({ for: async () => rows }) }) };
      }
      if (read === 2) {
        return { from: () => ({ where: async () => [] }) };
      }
      return { from: () => ({ where: () => ({ orderBy: async () => allocations }) }) };
    },
  }));
}

describe("expense funding request contract", () => {
  it("requires a note when Other is selected", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Other",
      description: "Miscellaneous expense",
      notes: "  ",
      paidFromBank: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Add a note");
  });

  it("accepts a note for Other and does not require notes for other categories", () => {
    expect(validateOtherExpenseNotes("Other", "Unclassified spending")).toBeNull();
    expect(validateOtherExpenseNotes("Food", "")).toBeNull();
  });

  it("requires the explicitly selected account for a bank-funded expense", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Emergency repair",
      description: "Replace broken lock",
      paidFromBank: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Choose a valid bank account");
  });

  it("accepts a meaningful unbudgeted category name without requiring a budget row", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Emergency repair",
      description: "Replace broken lock",
      paidFromBank: false,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("income source");
    expect(response.body.error).not.toContain("specific category");
  });

  it("requires a note when changing an expense category to Other", async () => {
    (db.transaction as any).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [{
              id: 1, amount: 1000, category: "Food", description: "Old",
              paidById: null, incomeSourceId: null, paidFromBank: true,
              accountId: 1, isRecurring: false, date: "2026-08-19",
            }],
          }),
        }),
      }),
    }));
    const response = await request(app()).patch("/expenses/1").send({
      amount: 1000,
      category: " other ",
      description: "Miscellaneous expense",
      notes: " ",
      paidFromBank: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Add a note");
  });

  it("rejects a multi-category recurring expense before funding is written", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      categoryAllocations: [
        { category: "Food", amount: 600 },
        { category: "Transport", amount: 400 },
      ],
      description: "Recurring basket",
      paidFromBank: false,
      isRecurring: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Recurring expenses can have only one category allocation");
  });

  it("rejects enabling recurring on an existing multi-category expense", async () => {
    mockExpenseUpdateReads({
      id: 1, amount: 1000, category: "Food", description: "Basket",
      paidById: null, incomeSourceId: null, paidFromBank: true,
      accountId: 1, isRecurring: false, date: "2026-08-19",
    }, [
      { expenseId: 1, groupId: 1, category: "Food", amount: 600, position: 0 },
      { expenseId: 1, groupId: 1, category: "Transport", amount: 400, position: 1 },
    ]);

    const response = await request(app()).patch("/expenses/1").send({
      amount: 1000, category: "Food", description: "Basket", paidById: null,
      paidFromBank: true, isRecurring: true, date: "2026-08-19",
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Recurring expenses can have only one category allocation");
  });

  it("rejects multiple replacement allocations on an existing recurring expense", async () => {
    mockExpenseUpdateReads({
      id: 1, amount: 1000, category: "Food", description: "Basket",
      paidById: null, incomeSourceId: null, paidFromBank: true,
      accountId: 1, isRecurring: true, date: "2026-08-19",
    }, [{ expenseId: 1, groupId: 1, category: "Food", amount: 1000, position: 0 }]);

    const response = await request(app()).patch("/expenses/1").send({
      amount: 1000,
      category: "Food",
      categoryAllocations: [
        { category: "Food", amount: 600 },
        { category: "Transport", amount: 400 },
      ],
      description: "Basket",
      paidById: null,
      paidFromBank: true,
      isRecurring: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Recurring expenses can have only one category allocation");
  });

  it("explains which malformed field prevented an expense from being saved", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: "1000",
      category: "Food",
      description: "Groceries",
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("amount");
  });

  it("rejects a legacy labeled income split before it can create an expense", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      paidById: "member-1",
      isRecurring: false,
      date: "2026-08-19",
      incomeSplits: [{ label: "Salary", amount: 1000 }],
    });

    expect(response.status).toBe(400);
  });

  it("accepts the explicit personal split fields sent by mobile", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      paidById: "member-1",
      isRecurring: false,
      date: "2026-08-19",
      incomeSplits: [{
        userId: "member-1",
        fromBank: false,
        label: "Salary",
        amount: 1000,
        incomeSourceId: 7,
      }],
    });

    // The request makes it past body validation; the mocked member lookup
    // deliberately rejects the synthetic member rather than silently saving it.
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("recognised household member");
  });

  it("rejects a personal split without a saved income source", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      date: "2026-08-19",
      incomeSplits: [{
        userId: "member-1",
        fromBank: false,
        label: "Salary",
        amount: 1000,
      }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("income source");
  });

  it("rejects a Joint-bank split that carries a personal income source", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      date: "2026-08-19",
      incomeSplits: [{
        userId: null,
        fromBank: true,
        label: "Joint bank",
        amount: 1000,
        incomeSourceId: 7,
      }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Joint-bank portion");
  });

  it("rejects a non-positive legacy income source ID before it can be saved", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      paidById: "member-1",
      paidFromBank: false,
      incomeSourceId: 0,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("incomeSourceId");
  });

  it("rejects an unrecognised legacy payer before creating an expense", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      paidById: "unknown-member",
      isRecurring: false,
      date: "2026-08-19",
      paidFromBank: false,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("recognised household member");
  });

  it("rejects an unrecognised legacy payer on an expense update", async () => {
    const response = await request(app()).patch("/expenses/1").send({
      amount: 1000,
      category: "Food",
      description: "Groceries",
      paidById: "unknown-member",
      isRecurring: false,
      date: "2026-08-19",
      paidFromBank: false,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("recognised household member");
  });

  it("blocks members from recording an expense with a non-current date", async () => {
    const response = await request(app("member")).post("/expenses").send({
      amount: 1000,
      category: "Food",
      description: "Old groceries",
      paidById: "member-1",
      isRecurring: false,
      paidFromBank: false,
      date: "2000-01-01",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("today only");
  });

  it("blocks members from editing an expense with a non-current date", async () => {
    const response = await request(app("member")).patch("/expenses/1").send({
      amount: 1000,
      category: "Food",
      description: "Old groceries",
      paidById: "member-1",
      isRecurring: false,
      paidFromBank: false,
      date: "2000-01-01",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("today only");
  });

  it("blocks members from deleting expenses", async () => {
    const response = await request(app("member")).delete("/expenses/1");

    expect(response.status).toBe(403);
  });
});