/**
 * Deleting a past year from a Personal budget, against a real Postgres.
 * Run with `pnpm run test:integration` against a scratch DATABASE_URL.
 */
import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  accountDeletionCodesTable,
  bankAccountsTable,
  budgetCategoriesTable,
  contributionsTable,
  db,
  expensesTable,
  groupsTable,
  jointAccountTxTable,
  pool,
  usersTable,
} from "@workspace/db";
import router from "../delete-year";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
const userId = `delete-year-${STAMP}`;
let groupId = 0;

function app(isPrivate = true) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: userId };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: unknown }).group = { id: groupId, role: "owner", isPrivate };
    next();
  });
  server.use(router);
  return server;
}

async function issueCode(year: number, code: string) {
  await db.insert(accountDeletionCodesTable).values({
    userId,
    codeHash: crypto.createHash("sha256").update(`year:${groupId}:${year}:${code}`).digest("hex"),
    expiresAt: new Date(Date.now() + 600_000),
  });
}

describe.skipIf(!hasDb)("deleting a past year (integration)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    if (groupId) {
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
      await db.delete(expensesTable).where(eq(expensesTable.groupId, groupId));
      await db.delete(contributionsTable).where(eq(contributionsTable.groupId, groupId));
      await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, groupId));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    }
    await db.delete(accountDeletionCodesTable).where(eq(accountDeletionCodesTable.userId, userId));
    await db.delete(usersTable).where(inArray(usersTable.id, [userId]));
    await pool.end();
  });

  it("lists past years with what each holds, and deletes only that year, with the emailed code", async () => {
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    const [group] = await db.insert(groupsTable).values({ name: "Personal budget", kind: "personal", privateOwnerUserId: userId }).returning({ id: groupsTable.id });
    groupId = group.id;
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "Chege Mpesa", openingBalance: 500 }).returning({ id: bankAccountsTable.id });
    await db.insert(budgetCategoriesTable).values({ groupId, name: "Food", budgetAmount: 1000 });
    await db.insert(expensesTable).values([
      { groupId, amount: 300, category: "Food", description: "2025 lunch", date: "2025-06-01" },
      { groupId, amount: 400, category: "Food", description: "2026 lunch", date: "2026-02-01" },
    ]);
    const [paid] = await db.insert(jointAccountTxTable).values({ groupId, accountId: account.id, type: "disbursement", amount: 1000, description: "2025 rent", date: "2025-12-31", mpesaReceipt: `Y${STAMP}`.slice(0, 12) } as never).returning({ id: jointAccountTxTable.id });
    await db.insert(jointAccountTxTable).values([
      // Its M-Pesa charge, tied to it.
      { groupId, accountId: account.id, type: "disbursement", amount: 25, description: "Charge", date: "2025-12-31", chargeForTransactionId: paid.id },
      { groupId, accountId: account.id, type: "deposit", amount: 2000, description: "2026 salary", date: "2026-01-01" },
    ] as never);

    const years = await request(app()).get("/budget-years");
    expect(years.status).toBe(200);
    expect(years.body.years).toEqual([{ year: 2025, expenses: 1, bankEntries: 2, contributions: 0 }]);

    // A wrong code changes nothing.
    await issueCode(2025, "123456");
    expect((await request(app()).delete("/budget-years/2025").send({ code: "654321" })).status).toBe(400);
    expect((await db.select().from(expensesTable).where(eq(expensesTable.groupId, groupId)))).toHaveLength(2);

    const done = await request(app()).delete("/budget-years/2025").send({ code: "123456" });
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ year: 2025, deleted: { expenses: 1, bankEntries: 2, contributions: 0 } });

    const expenses = await db.select({ description: expensesTable.description }).from(expensesTable).where(eq(expensesTable.groupId, groupId));
    expect(expenses).toEqual([{ description: "2026 lunch" }]);
    const entries = await db.select({ description: jointAccountTxTable.description }).from(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
    expect(entries).toEqual([{ description: "2026 salary" }]);
    // Undated things stay: the category and the account with its opening balance.
    expect(await db.select().from(budgetCategoriesTable).where(eq(budgetCategoriesTable.groupId, groupId))).toHaveLength(1);
    const [kept] = await db.select({ openingBalance: bankAccountsTable.openingBalance }).from(bankAccountsTable).where(eq(bankAccountsTable.id, account.id));
    expect(Number(kept.openingBalance)).toBe(500);

    // The code is spent.
    expect((await request(app()).delete("/budget-years/2025").send({ code: "123456" })).status).toBe(400);
  });

  it("refuses this year, and any Shared group", async () => {
    const thisYear = new Date().getUTCFullYear();
    expect((await request(app()).post(`/budget-years/${thisYear}/delete/request-code`)).status).toBe(400);
    expect((await request(app(false)).get("/budget-years")).status).toBe(403);
    expect((await request(app(false)).delete("/budget-years/2025").send({ code: "123456" })).status).toBe(403);
  });

  // An account a sign-in made with no email could never get a code (5 Oct 2026).
  it("lets an account with no email confirm by typing DELETE, and never lets one with an email skip its code", async () => {
    await db.insert(jointAccountTxTable).values({ groupId, accountId: (await db.select({ id: bankAccountsTable.id }).from(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId)))[0].id, type: "deposit", amount: 50, description: "2024 gift", date: "2024-03-01" } as never);

    // With an email: the word is refused.
    expect((await request(app()).delete("/budget-years/2024").send({ confirm: "DELETE" })).status).toBe(400);

    await db.update(usersTable).set({ email: null }).where(eq(usersTable.id, userId));
    const asked = await request(app()).post("/budget-years/2024/delete/request-code");
    expect(asked.status).toBe(200);
    expect(asked.body).toEqual({ sent: false, confirmWith: "DELETE" });
    expect((await request(app()).delete("/budget-years/2024").send({ confirm: "delet" })).status).toBe(400);
    const done = await request(app()).delete("/budget-years/2024").send({ confirm: "delete" });
    expect(done.status).toBe(200);
    expect(done.body.deleted.bankEntries).toBe(1);
  });
});
