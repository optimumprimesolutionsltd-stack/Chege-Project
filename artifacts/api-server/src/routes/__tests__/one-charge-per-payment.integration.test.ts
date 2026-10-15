/**
 * One M-Pesa charge per payment, against a real Postgres. A charge carries no
 * M-Pesa code, so a save tried again after its answer was lost (the phone's
 * lib/saveWhileAway, the server's import job) used to save it a second time:
 * seven payments had theirs twice (13 Oct 2026). The suite skips when
 * DATABASE_URL is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { bankAccountsTable, budgetCategoriesTable, db, groupMembershipsTable, groupsTable, jointAccountTxTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import jointAccountRouter from "../joint-account.js";
import { addMissingCharges } from "../../lib/mpesa-charges.js";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const USER_ID = `one-charge-${Date.now()}`;
let groupId = 0;
let accountId = 0;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: USER_ID };
    req.group = { id: groupId, role: "owner", isPrivate: true };
    next();
  });
  app.use("/", jointAccountRouter);
  return app;
}

async function payment(receipt: string): Promise<number> {
  const [row] = await db.insert(jointAccountTxTable).values({
    groupId, accountId, type: "disbursement", amount: 1000, description: "Moses Ndungu", date: "2026-10-04", mpesaReceipt: receipt,
  }).returning();
  return row.id;
}

const chargesOf = (id: number) => db.select().from(jointAccountTxTable).where(eq(jointAccountTxTable.chargeForTransactionId, id));
const charge = (id: number) => ({ amount: 7, description: "Bank charge — Moses Ndungu", date: "2026-10-04", expenseCategory: "Bank charges", destinationKind: "category", accountId, madeById: USER_ID, chargeForTransactionId: id });

describe.skipIf(!hasDb)("one charge per payment (integration)", () => {
  const app = buildApp();

  beforeAll(async () => {
    await db.insert(usersTable).values({ id: USER_ID, firstName: "One", lastName: "Charge" }).onConflictDoNothing();
    const [group] = await db.insert(groupsTable).values({ name: `One charge ${Date.now()}`, legacyKey: `one-charge-${Date.now()}`, createdByUserId: USER_ID }).returning();
    groupId = group.id;
    await db.insert(groupMembershipsTable).values({ groupId, userId: USER_ID, role: "owner" });
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "M-Pesa" }).returning();
    accountId = account.id;
    await db.insert(budgetCategoriesTable).values({ groupId, name: "Bank charges", budgetAmount: 0 });
  });

  afterAll(async () => {
    if (!groupId) return;
    await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
    await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
    await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, groupId));
    await db.delete(groupMembershipsTable).where(eq(groupMembershipsTable.groupId, groupId));
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    await db.delete(usersTable).where(eq(usersTable.id, USER_ID));
  });

  it("a charge sent again is answered with the one already saved", async () => {
    const id = await payment(`OC${Date.now()}`.slice(0, 10));
    const first = await request(app).post("/joint-account/disbursement").send(charge(id));
    expect(first.status).toBe(201);
    const again = await request(app).post("/joint-account/disbursement").send(charge(id));
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await chargesOf(id)).toHaveLength(1);
  });

  it("three sent at once still save one", async () => {
    const id = await payment(`OD${Date.now()}`.slice(0, 10));
    const answers = await Promise.all([1, 2, 3].map(() => request(app).post("/joint-account/disbursement").send(charge(id))));
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 200, 201]);
    expect(await chargesOf(id)).toHaveLength(1);
  });

  it("Fix all never adds a charge to a payment that has one", async () => {
    const id = await payment(`OE${Date.now()}`.slice(0, 10));
    await request(app).post("/joint-account/disbursement").send(charge(id));
    expect(await addMissingCharges(db, groupId, accountId, [{ entryId: id, amount: 7 }])).toBe(0);
    expect(await chargesOf(id)).toHaveLength(1);
  });
});
