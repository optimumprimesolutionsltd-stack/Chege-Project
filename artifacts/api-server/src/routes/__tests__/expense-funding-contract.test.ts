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
      query: {
        membersTable: { findFirst: vi.fn() },
        incomeSourcesTable: { findFirst: vi.fn() },
      },
    },
    expensesTable: table, usersTable: table, membersTable: table,
    bankAccountsTable: table,
    groupMembershipsTable: table,
    incomeSourcesTable: table, expenseIncomeSplitsTable: table, jointAccountTxTable: table,
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

import expensesRouter from "../expenses.js";
import { validateOtherExpenseDescription } from "../expenses.js";

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

describe("expense funding request contract", () => {
  it("requires a brief description when Other is selected", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 1000,
      category: "Other",
      description: "  ",
      paidFromBank: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Briefly describe");
  });

  it("accepts a brief description for Other instead of treating it as a setup sentinel", () => {
    expect(validateOtherExpenseDescription("Other", "Unclassified spending")).toBeNull();
    expect(validateOtherExpenseDescription("Food", "")).toBeNull();
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

  it("requires a brief description when changing an expense category to Other", async () => {
    const response = await request(app()).patch("/expenses/1").send({
      amount: 1000,
      category: " other ",
      description: " ",
      paidFromBank: true,
      date: "2026-08-19",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Briefly describe");
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