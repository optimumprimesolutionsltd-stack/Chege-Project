/**
 * An account still in use is never erased (5 Oct 2026): a deletion asked for on
 * 20 Sep was never cancelled by signing back in, and the daily run erased an
 * account in daily use 14 days later. Against a real Postgres.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db, groupMembershipsTable, groupsTable, pool, sessionsTable, usersTable } from "@workspace/db";
import { hasLiveSession, requestAccountDeletion, runAccountDeletions } from "../account-deletion";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("unit-tests-never-connect");
const STAMP = Date.now();
const active = `keep-active-${STAMP}`;
const gone = `keep-gone-${STAMP}`;
const NOW = new Date();
const LONG_AGO = new Date(NOW.getTime() - 20 * 86_400_000);

async function session(userId: string, sid: string) {
  await db.insert(sessionsTable).values({ sid, sess: { user: { id: userId } }, expire: new Date(NOW.getTime() + 86_400_000) });
}

describe.skipIf(!hasDb)("a pending deletion and an account still in use (integration)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    await db.delete(sessionsTable).where(sql`${sessionsTable.sess} -> 'user' ->> 'id' IN (${active}, ${gone})`);
    const groups = await db.select({ id: groupsTable.id }).from(groupsTable).where(inArray(groupsTable.privateOwnerUserId, [active, gone]));
    if (groups.length) {
      await db.delete(groupMembershipsTable).where(inArray(groupMembershipsTable.groupId, groups.map((g) => g.id)));
      await db.delete(groupsTable).where(inArray(groupsTable.id, groups.map((g) => g.id)));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [active, gone]));
    await pool.end();
  });

  it("asking to delete signs the account out everywhere", async () => {
    await db.insert(usersTable).values({ id: active, email: `${active}@example.test` });
    await session(active, `${active}-phone`);
    await session(active, `${active}-web`);
    await requestAccountDeletion(active);
    expect(await hasLiveSession(active, NOW)).toBe(false);
  });

  it("keeps, and cancels the deletion of, an account signed in again; erases one that is not", async () => {
    await db.update(usersTable).set({ deletionRequestedAt: LONG_AGO }).where(eq(usersTable.id, active));
    await session(active, `${active}-again`);
    await db.insert(usersTable).values({ id: gone, email: `${gone}@example.test`, deletionRequestedAt: LONG_AGO });

    const result = await runAccountDeletions(NOW);
    expect(result.kept).toBeGreaterThanOrEqual(1);

    const [kept] = await db.select().from(usersTable).where(eq(usersTable.id, active));
    expect(kept.deletedAt).toBeNull();
    expect(kept.deletionRequestedAt).toBeNull();
    expect(kept.email).toBe(`${active}@example.test`);

    const [erased] = await db.select().from(usersTable).where(eq(usersTable.id, gone));
    expect(erased.deletedAt).not.toBeNull();
  });
});
