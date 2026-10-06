import { and, eq, sql } from "drizzle-orm";
import { db, debtEntryLinksTable, groupContributorsTable, jointAccountTxTable } from "@workspace/db";
import { entriesToSortReady, NOT_SURE_CATEGORY } from "./entries-to-sort";

/**
 * Sorting an entry out as a debt, not a category or an income source.
 *
 * "I can't see the logic of debt option here... adding debtor/creditor"
 * (6 Oct 2026): Sort them out offered only spending categories and income
 * sources, so money lent, borrowed or paid back had to be filed as spending
 * or income - which it is not. Each kind sets the entry the way the Bank
 * screen saves it (lib/who-owes-who.ts reads the same flags), and links the
 * person when one is named, so Who owes who counts it.
 *
 *  - lend:     money out to somebody who now owes you   (a debtor)
 *  - pay-back: money out to somebody you owed           (a creditor)
 *  - borrowed: money in from somebody you now owe       (a creditor)
 *  - repaid:   money in from somebody who owed you      (a debtor)
 */
export const DEBT_KINDS = ["lend", "pay-back", "borrowed", "repaid"] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

const OUT_KINDS: readonly DebtKind[] = ["lend", "pay-back"];

export type SortAsDebtResult = { ok: true } | { ok: false; status: number; error: string };

async function entryToSort(groupId: number, transactionId: number) {
  const [entry] = await db
    .select()
    .from(jointAccountTxTable)
    .where(and(eq(jointAccountTxTable.id, transactionId), eq(jointAccountTxTable.groupId, groupId)))
    .limit(1);
  return entry ?? null;
}

export async function sortAsDebt(groupId: number, transactionId: number, kind: DebtKind, partyId: number | null): Promise<SortAsDebtResult> {
  const entry = await entryToSort(groupId, transactionId);
  if (!entry) return { ok: false, status: 404, error: "Not found" };
  const out = OUT_KINDS.includes(kind);
  if ((entry.type === "disbursement") !== out) {
    return { ok: false, status: 400, error: out ? "Only money out can be lent or paid back." : "Only money in can be borrowed or repaid to you." };
  }
  if (entry.bankTransferId !== null || entry.savingsGoalId !== null || entry.transferDirection !== null) {
    return { ok: false, status: 409, error: "A move between your own accounts is not a debt." };
  }
  const reversed = await db.execute(sql`
    SELECT 1 FROM "reversal_links"
    WHERE "reversal_transaction_id" = ${transactionId} OR "original_transaction_id" = ${transactionId}
    LIMIT 1`).catch(() => ({ rows: [] }));
  if (reversed.rows.length > 0) return { ok: false, status: 409, error: "This entry is part of a reversal." };
  // Paying back, or being paid back, settles a person's balance: it needs the person.
  if (partyId === null && (kind === "pay-back" || kind === "repaid")) {
    return { ok: false, status: 400, error: "Say who it was with." };
  }
  if (partyId !== null) {
    const [party] = await db
      .select({ id: groupContributorsTable.id })
      .from(groupContributorsTable)
      .where(and(eq(groupContributorsTable.id, partyId), eq(groupContributorsTable.groupId, groupId)))
      .limit(1);
    if (!party) return { ok: false, status: 400, error: "That person is not in this budget." };
  }

  await db.transaction(async (trx) => {
    await trx
      .update(jointAccountTxTable)
      .set(out
        ? { expenseCategory: null, isLending: kind === "lend", settlesContributorId: partyId }
        : { incomeSourceId: null, isBorrowing: kind === "borrowed", settlesContributorId: partyId })
      .where(and(eq(jointAccountTxTable.id, transactionId), eq(jointAccountTxTable.groupId, groupId)));
    if (partyId !== null) {
      await trx
        .insert(debtEntryLinksTable)
        .values({ groupId, transactionId, partyId, kind })
        .onConflictDoUpdate({ target: debtEntryLinksTable.transactionId, set: { partyId, kind } });
    } else {
      await trx.delete(debtEntryLinksTable).where(and(eq(debtEntryLinksTable.transactionId, transactionId), eq(debtEntryLinksTable.groupId, groupId)));
    }
    if (!out && entriesToSortReady()) {
      await trx.execute(sql`DELETE FROM "entries_to_sort" WHERE "transaction_id" = ${transactionId} AND "group_id" = ${groupId}`);
    }
  });
  return { ok: true };
}

/** Undo: back on the list as it was - money out under Not sure yet, money in with no source. */
export async function unsortDebt(groupId: number, transactionId: number): Promise<SortAsDebtResult> {
  const entry = await entryToSort(groupId, transactionId);
  if (!entry) return { ok: false, status: 404, error: "Not found" };
  const out = entry.type === "disbursement";
  await db.transaction(async (trx) => {
    await trx
      .update(jointAccountTxTable)
      .set(out
        ? { expenseCategory: NOT_SURE_CATEGORY, isLending: false, settlesContributorId: null }
        : { incomeSourceId: null, isBorrowing: false, settlesContributorId: null })
      .where(and(eq(jointAccountTxTable.id, transactionId), eq(jointAccountTxTable.groupId, groupId)));
    await trx.delete(debtEntryLinksTable).where(and(eq(debtEntryLinksTable.transactionId, transactionId), eq(debtEntryLinksTable.groupId, groupId)));
    if (!out && entriesToSortReady()) {
      await trx.execute(sql`
        INSERT INTO "entries_to_sort" ("transaction_id", "group_id")
        VALUES (${transactionId}, ${groupId})
        ON CONFLICT ("transaction_id") DO NOTHING`);
    }
  });
  return { ok: true };
}
