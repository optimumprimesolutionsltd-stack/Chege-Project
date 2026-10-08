/**
 * Money in saved earlier from a person, a bank or an agent, with a source,
 * listed once to check it - against a real Postgres. Its source is never
 * cleared; Keep or another source takes it off the list.
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
const userId = `money-in-check-${STAMP}`;
let groupId = 0;

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: userId };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: unknown }).group = { id: groupId, role: "owner", isPrivate: true };
    next();
  });
  server.use(router);
  return server;
}

describe.skipIf(!hasDb)("money in listed to check its source (integration)", () => {
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

  it("lists imported money in from people and banks once, keeps the source, and takes it off on Keep or a change", async () => {
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    const [group] = await db.insert(groupsTable).values({ name: "Personal budget", kind: "personal", privateOwnerUserId: userId }).returning({ id: groupsTable.id });
    groupId = group.id;
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "Chege Mpesa", openingBalance: 0 }).returning({ id: bankAccountsTable.id });
    const [salary] = await db.insert(incomeSourcesTable).values({ groupId, userId, name: "Salary" } as never).returning({ id: incomeSourcesTable.id });
    const [side] = await db.insert(incomeSourcesTable).values({ groupId, userId, name: "Side hustle" } as never).returning({ id: incomeSourcesTable.id });
    const base = { groupId, accountId: account.id, type: "deposit", date: "2026-08-01", incomeSourceId: salary.id };
    const rows = await db.insert(jointAccountTxTable).values([
      { ...base, amount: 3000, description: "Received from Paul Mouguo", mpesaReceipt: `CHK${STAMP}A` },
      { ...base, amount: 5000, description: "National Bank", mpesaReceipt: `CHK${STAMP}B` },
      { ...base, amount: 9000, description: "ACME LTD SALARY", mpesaReceipt: `CHK${STAMP}C` },
      { ...base, amount: 700, description: "Received from Typed By Hand" },
    ] as never).returning({ id: jointAccountTxTable.id, description: jointAccountTxTable.description });
    const id = (description: string) => rows.find((row) => row.description === description)!.id;

    const listedIds = async () => {
      const res = await request(app()).get("/entries-to-sort");
      expect(res.status).toBe(200);
      return (res.body.entries as Array<{ id: number; incomeSourceId: number | null }>).filter((e) => e.incomeSourceId !== null).map((e) => e.id).sort();
    };
    expect(await listedIds()).toEqual([id("Received from Paul Mouguo"), id("National Bank")].sort());
    const [kept] = await db.select({ incomeSourceId: jointAccountTxTable.incomeSourceId }).from(jointAccountTxTable).where(eq(jointAccountTxTable.id, id("National Bank")));
    expect(kept.incomeSourceId).toBe(salary.id);

    // Keep, then Undo, then Keep again.
    await request(app()).post("/entries-to-sort/checked").send({ transactionIds: [id("National Bank")] }).expect(204);
    expect(await listedIds()).toEqual([id("Received from Paul Mouguo")]);
    await request(app()).post("/entries-to-sort/checked").send({ transactionIds: [id("National Bank")], again: true }).expect(204);
    expect(await listedIds()).toEqual([id("Received from Paul Mouguo"), id("National Bank")].sort());
    await request(app()).post("/entries-to-sort/checked").send({ transactionIds: [id("National Bank")] }).expect(204);

    // Another source takes it off by itself; it is not gathered a second time.
    await db.update(jointAccountTxTable).set({ incomeSourceId: side.id }).where(eq(jointAccountTxTable.id, id("Received from Paul Mouguo")));
    expect(await listedIds()).toEqual([]);
  });
});
