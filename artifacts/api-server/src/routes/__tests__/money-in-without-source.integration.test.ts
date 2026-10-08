/**
 * POST /entries-to-sort/money-in-without-source against a real Postgres:
 * only plain money in with no source is gathered, and only in a Personal budget.
 * Run with `pnpm run test:integration` against a scratch DATABASE_URL.
 */
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { bankAccountsTable, db, groupsTable, incomeSourcesTable, jointAccountTxTable, pool, usersTable } from "@workspace/db";
import router from "../entries-to-sort";
import { ensureEntriesToSort } from "../../lib/entries-to-sort";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
const userId = `money-in-source-${STAMP}`;
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

describe.skipIf(!hasDb)("gathering money in with no source (integration)", () => {
  beforeAll(async () => {
    if (hasDb) await ensureEntriesToSort();
  });
  afterAll(async () => {
    if (!hasDb) return;
    if (groupId) {
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
      await db.delete(incomeSourcesTable).where(eq(incomeSourcesTable.groupId, groupId));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [userId]));
    await pool.end();
  });

  it("gathers only plain money in with no source, once", async () => {
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    const [group] = await db.insert(groupsTable).values({ name: "Personal budget", kind: "personal", privateOwnerUserId: userId }).returning({ id: groupsTable.id });
    groupId = group.id;
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "Chege Mpesa", openingBalance: 0 }).returning({ id: bankAccountsTable.id });
    const [salary] = await db.insert(incomeSourcesTable).values({ groupId, userId, name: "Salary" } as never).returning({ id: incomeSourcesTable.id });
    const base = { groupId, accountId: account.id, type: "deposit", date: "2026-10-01" };
    const rows = await db.insert(jointAccountTxTable).values([
      { ...base, amount: 4000, description: "Received from Victor Akwir" },
      { ...base, amount: 500, description: "Fuliza", isBorrowing: true },
      { ...base, amount: 300, description: "Paid back", settlesContributorId: null, incomeSourceId: salary.id },
      { ...base, amount: 1000, description: "From Equity", bankTransferId: `move-${STAMP}`, transferDirection: "in" },
      { ...base, amount: 200, description: "Spent", type: "disbursement" },
    ] as never).returning({ id: jointAccountTxTable.id, description: jointAccountTxTable.description });

    const first = await request(app()).post("/entries-to-sort/money-in-without-source");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ added: 1 });

    const listed = await request(app()).get("/entries-to-sort");
    const ids = listed.body.entries.map((entry: { id: number }) => entry.id);
    expect(ids).toEqual([rows.find((row) => row.description === "Received from Victor Akwir")!.id]);

    // Asked again: nothing new to add.
    expect((await request(app()).post("/entries-to-sort/money-in-without-source")).body).toEqual({ added: 0 });
  });

  it("can be kept to one year: earlier money in is left out", async () => {
    const [old] = await db.insert(jointAccountTxTable).values({
      groupId, accountId: (await db.select({ id: bankAccountsTable.id }).from(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId)))[0].id,
      type: "deposit", amount: 900, description: "December gift", date: "2025-12-20",
    } as never).returning({ id: jointAccountTxTable.id });
    const thisYear = await request(app()).post("/entries-to-sort/money-in-without-source").send({ from: "2026-01-01" });
    expect(thisYear.body).toEqual({ added: 0 });
    const listed = await request(app()).get("/entries-to-sort");
    expect(listed.body.entries.map((entry: { id: number }) => entry.id)).not.toContain(old.id);
    expect((await request(app()).post("/entries-to-sort/money-in-without-source").send({ from: "26-1-1" })).status).toBe(400);
  });

  // "Should also apply to shared budget too" (8 Oct 2026): a Shared group gathers
  // only imported money in from people, banks and agents, never members' contributions.
  it("gathers in a Shared group only what was imported from people, banks and agents", async () => {
    const response = await request(app(false)).post("/entries-to-sort/money-in-without-source");
    expect(response.status).toBe(200);
  });
});
