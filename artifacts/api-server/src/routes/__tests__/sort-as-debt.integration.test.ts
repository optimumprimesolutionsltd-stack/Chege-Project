/**
 * POST/DELETE /entries-to-sort/:id/debt against a real Postgres: an entry on
 * Sort them out filed as lent, paid back, borrowed or repaid, the way Who owes
 * who reads it, and put back on the list by Undo.
 * Run with `pnpm run test:integration` against a scratch DATABASE_URL.
 */
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { bankAccountsTable, db, debtEntryLinksTable, groupContributorsTable, groupsTable, jointAccountTxTable, pool, usersTable } from "@workspace/db";
import router from "../entries-to-sort";
import { ensureEntriesToSort } from "../../lib/entries-to-sort";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
const userId = `sort-debt-${STAMP}`;
let groupId = 0;
let role = "owner";

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: userId };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { group: unknown }).group = { id: groupId, role, isPrivate: true };
    next();
  });
  server.use(router);
  return server;
}

describe.skipIf(!hasDb)("sorting an entry out as a debt (integration)", () => {
  let accountId = 0;
  let personId = 0;
  beforeAll(async () => {
    if (!hasDb) return;
    await ensureEntriesToSort();
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    const [group] = await db.insert(groupsTable).values({ name: "Personal budget", kind: "personal", privateOwnerUserId: userId }).returning({ id: groupsTable.id });
    groupId = group.id;
    const [account] = await db.insert(bankAccountsTable).values({ groupId, name: "Chege Mpesa", openingBalance: 0 }).returning({ id: bankAccountsTable.id });
    accountId = account.id;
    const [person] = await db.insert(groupContributorsTable).values({ groupId, name: "Alice Mwangi" } as never).returning({ id: groupContributorsTable.id });
    personId = person.id;
  });
  afterAll(async () => {
    if (!hasDb) return;
    if (groupId) {
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
      await db.delete(groupContributorsTable).where(eq(groupContributorsTable.groupId, groupId));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [userId]));
    await pool.end();
  });

  const listed = async () => (await request(app()).get("/entries-to-sort")).body.entries.map((entry: { id: number }) => entry.id) as number[];
  const row = async (id: number) => (await db.select().from(jointAccountTxTable).where(eq(jointAccountTxTable.id, id)))[0];
  const link = async (id: number) => (await db.select().from(debtEntryLinksTable).where(eq(debtEntryLinksTable.transactionId, id)))[0];

  it("money out lent to somebody leaves the list as a loan out, linked to them, and Undo puts it back", async () => {
    const [entry] = await db.insert(jointAccountTxTable).values({ groupId, accountId, type: "disbursement", amount: 3500, description: "Alice Mwangi", date: "2026-01-03", expenseCategory: "Not sure yet" } as never).returning({ id: jointAccountTxTable.id });
    expect(await listed()).toContain(entry.id);

    const sorted = await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "lend", partyId: personId });
    expect(sorted.status).toBe(204);
    expect(await row(entry.id)).toMatchObject({ isLending: true, expenseCategory: null, settlesContributorId: personId });
    expect(await link(entry.id)).toMatchObject({ partyId: personId, kind: "lend" });
    expect(await listed()).not.toContain(entry.id);

    expect((await request(app()).delete(`/entries-to-sort/${entry.id}/debt`)).status).toBe(204);
    expect(await row(entry.id)).toMatchObject({ isLending: false, expenseCategory: "Not sure yet", settlesContributorId: null });
    expect(await link(entry.id)).toBeUndefined();
    expect(await listed()).toContain(entry.id);
  });

  it("money in borrowed with nobody named yet is still taken off the list, as borrowing", async () => {
    const [entry] = await db.insert(jointAccountTxTable).values({ groupId, accountId, type: "deposit", amount: 2000, description: "Received from Kamau", date: "2026-01-04" } as never).returning({ id: jointAccountTxTable.id });
    await request(app()).post("/entries-to-sort").send({ transactionIds: [entry.id] });
    expect(await listed()).toContain(entry.id);

    expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "borrowed" })).status).toBe(204);
    expect(await row(entry.id)).toMatchObject({ isBorrowing: true, incomeSourceId: null, settlesContributorId: null });
    expect(await listed()).not.toContain(entry.id);

    await request(app()).delete(`/entries-to-sort/${entry.id}/debt`);
    expect(await row(entry.id)).toMatchObject({ isBorrowing: false });
    expect(await listed()).toContain(entry.id);
  });

  it("refuses the wrong direction, a repayment with nobody named, a person from elsewhere, and members", async () => {
    const [entry] = await db.insert(jointAccountTxTable).values({ groupId, accountId, type: "disbursement", amount: 700, description: "Abel Ndegwa", date: "2026-01-05", expenseCategory: "Not sure yet" } as never).returning({ id: jointAccountTxTable.id });
    expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "borrowed", partyId: personId })).status).toBe(400);
    expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "pay-back" })).status).toBe(400);
    expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "pay-back", partyId: 2_000_000_000 })).status).toBe(400);
    role = "member";
    try {
      expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "pay-back", partyId: personId })).status).toBe(403);
    } finally {
      role = "owner";
    }
    expect((await request(app()).post(`/entries-to-sort/${entry.id}/debt`).send({ kind: "pay-back", partyId: personId })).status).toBe(204);
    expect(await row(entry.id)).toMatchObject({ isLending: false, expenseCategory: null, settlesContributorId: personId });
    expect(await link(entry.id)).toMatchObject({ kind: "pay-back" });
  });
});
