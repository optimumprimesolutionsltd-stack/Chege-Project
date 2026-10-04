/**
 * POST /mpesa/difference against a real Postgres: picks the M-Pesa account,
 * reads its entries, and names the other account a missing payment went to.
 * Run with `pnpm run test:integration` against a scratch DATABASE_URL.
 */
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { bankAccountsTable, db, groupsTable, jointAccountTxTable, pool, usersTable } from "@workspace/db";
import router from "../mpesa-import";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
const userId = `mpesa-difference-${STAMP}`;
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

const at = (day: string) => new Date(`${day}T09:00:00+03:00`).getTime();

describe.skipIf(!hasDb)("POST /mpesa/difference (integration)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    if (groupId) {
      await db.delete(jointAccountTxTable).where(eq(jointAccountTxTable.groupId, groupId));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.groupId, groupId));
      await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [userId]));
    await pool.end();
  });

  it("finds money in that went to another account, and spending typed by hand twice", async () => {
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    const [group] = await db.insert(groupsTable).values({ name: "Personal budget", kind: "personal", privateOwnerUserId: userId }).returning({ id: groupsTable.id });
    groupId = group.id;
    const [mpesa] = await db.insert(bankAccountsTable).values({ groupId, name: "Chege Mpesa", openingBalance: 1000 }).returning({ id: bankAccountsTable.id });
    const [equity] = await db.insert(bankAccountsTable).values({ groupId, name: "Equity", openingBalance: 0 }).returning({ id: bankAccountsTable.id });
    await db.insert(jointAccountTxTable).values([
      { groupId, accountId: mpesa.id, type: "disbursement", amount: 300, description: "Shop", date: "2026-10-01", mpesaReceipt: `S${STAMP}`.slice(0, 12) },
      // Money in, saved to Equity by mistake.
      { groupId, accountId: equity.id, type: "deposit", amount: 2000, description: "Salary", date: "2026-10-02", mpesaReceipt: `R${STAMP}`.slice(0, 12) },
      { groupId, accountId: mpesa.id, type: "disbursement", amount: 500, description: "Rent", date: "2026-10-03", mpesaReceipt: `T${STAMP}`.slice(0, 12) },
      // The same rent, typed by hand.
      { groupId, accountId: mpesa.id, type: "disbursement", amount: 500, description: "Rent (typed)", date: "2026-10-03" },
    ] as never);

    const response = await request(app()).post("/mpesa/difference").send({
      messages: [
        { receipt: `S${STAMP}`.slice(0, 12), balance: 700, at: at("2026-10-01"), day: "2026-10-01" },
        { receipt: `R${STAMP}`.slice(0, 12), balance: 2700, at: at("2026-10-02"), day: "2026-10-02" },
        { receipt: `T${STAMP}`.slice(0, 12), balance: 2200, at: at("2026-10-03"), day: "2026-10-03" },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.account.name).toBe("Chege Mpesa");
    const { result } = response.body;
    expect(result.startGap).toBe(0);
    expect(result.endGap).toBe(2500);
    expect(result.spans).toHaveLength(2);
    expect(result.spans[0].missing).toEqual([{ receipt: `R${STAMP}`.slice(0, 12), day: "2026-10-02", savedIn: "Equity", savedOn: "2026-10-02" }]);
    expect(result.spans[1].extra).toMatchObject([{ description: "Rent (typed)", amount: -500, receipt: null }]);
  });

  it("refuses an empty list", async () => {
    const response = await request(app()).post("/mpesa/difference").send({ messages: [] });
    expect(response.status).toBe(400);
  });
});
