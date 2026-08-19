import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  db,
  expensesTable,
  groupMembershipsTable,
  groupsTable,
  pool,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import expensesRouter from "../expenses.js";

const hasDb = !!process.env.DATABASE_URL;
const userId = "expense-personal-payer-test";
let groupId: number;
let expenseId: number;

function app() {
  const server = express();
  server.use(express.json());
  server.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: userId };
    req.group = { id: groupId, role: "owner" };
    next();
  });
  server.use("/", expensesRouter);
  server.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return server;
}

describe.skipIf(!hasDb)("personal expense payer (integration)", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({ id: userId, firstName: "Expense", lastName: "Tester" }).onConflictDoNothing();
    const [group] = await db.insert(groupsTable).values({
      name: `Expense payer group ${Date.now()}`,
      legacyKey: `expense-payer-${Date.now()}`,
      createdByUserId: userId,
    }).returning();
    groupId = group.id;
    await db.insert(groupMembershipsTable).values({ groupId, userId, role: "owner" });
  });

  afterAll(async () => {
    await db.delete(expensesTable).where(eq(expensesTable.groupId, groupId));
    await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, groupId));
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await pool.end();
  });

  it("saves an expense paid by an active group member", async () => {
    const response = await request(app()).post("/expenses").send({
      amount: 750,
      category: "Food",
      description: "Personal payer validation",
      paidById: userId,
      paidFromBank: false,
      isRecurring: false,
      date: "2026-08-20",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expenseId = response.body.id;
    expect(response.body.paidById).toBe(userId);
  });
});