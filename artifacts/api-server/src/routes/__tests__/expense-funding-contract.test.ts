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
    groupMembershipsTable: table,
    incomeSourcesTable: table, expenseIncomeSplitsTable: table, jointAccountTxTable: table,
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

import expensesRouter from "../expenses.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use((_req: any, _res, next) => {
    _req.isAuthenticated = () => true;
    _req.group = { id: 1, role: "owner" };
    next();
  });
  server.use("/", expensesRouter);
  return server;
}

describe("expense funding request contract", () => {
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
});