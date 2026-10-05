import {
  bankAccountsTable,
  db,
  debtEntryLinksTable,
  groupContributorsTable,
  groupMembershipsTable,
  jointAccountDepositSplitsTable,
  jointAccountTxTable,
  reversalLinksTable,
  savingsGoalsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { reversalLinksReady } from "./reversal-links";
import {
  describeTransaction,
  emptyTransactionDetails,
  isDebtEntry,
  type TransactionDetails,
  type TxRow,
} from "./describe-transaction";

/**
 * Everything a list of entries needs to be shown, in a handful of queries for
 * the whole list instead of several for each entry (lib/describe-transaction
 * says why). Every lookup stays inside this budget.
 */

/** Ids per query: far under Postgres's limit of 65,535 parameters in one statement. */
const CHUNK = 5_000;

async function inChunks<T, R>(values: readonly T[], load: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const rows: R[] = [];
  for (let start = 0; start < values.length; start += CHUNK) {
    rows.push(...(await load(values.slice(start, start + CHUNK))));
  }
  return rows;
}

const distinct = <T>(values: ReadonlyArray<T | null | undefined>): T[] =>
  [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];

export async function loadTransactionDetails(txs: readonly TxRow[], groupId: number): Promise<TransactionDetails> {
  const details = emptyTransactionDetails();
  if (txs.length === 0) return details;

  const madeByIds = distinct(txs.map((tx) => tx.madeById));
  const goalIds = distinct(txs.map((tx) => tx.savingsGoalId));
  const depositIds = txs.filter((tx) => tx.type === "deposit").map((tx) => tx.id);
  const accountIds = distinct(txs.map((tx) => tx.bankTransferAccountId));

  const [members, goals, splits, accounts] = await Promise.all([
    inChunks(madeByIds, (ids) => db
      .select({ userId: usersTable.id, firstName: usersTable.firstName })
      .from(groupMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
      .where(and(eq(groupMembershipsTable.groupId, groupId), inArray(groupMembershipsTable.userId, ids)))),
    inChunks(goalIds, (ids) => db
      .select({ id: savingsGoalsTable.id, name: savingsGoalsTable.name })
      .from(savingsGoalsTable)
      .where(and(eq(savingsGoalsTable.groupId, groupId), inArray(savingsGoalsTable.id, ids)))),
    inChunks(depositIds, (ids) => db
      .select({
        transactionId: jointAccountDepositSplitsTable.transactionId,
        userId: jointAccountDepositSplitsTable.userId,
        amount: jointAccountDepositSplitsTable.amount,
        incomeSourceId: jointAccountDepositSplitsTable.incomeSourceId,
        userName: usersTable.firstName,
      })
      .from(jointAccountDepositSplitsTable)
      .leftJoin(usersTable, eq(jointAccountDepositSplitsTable.userId, usersTable.id))
      .where(and(eq(jointAccountDepositSplitsTable.groupId, groupId), inArray(jointAccountDepositSplitsTable.transactionId, ids)))
      .orderBy(asc(jointAccountDepositSplitsTable.id))),
    inChunks(accountIds, (ids) => db
      .select({ id: bankAccountsTable.id, name: bankAccountsTable.name })
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.groupId, groupId), inArray(bankAccountsTable.id, ids)))),
  ]);

  for (const member of members) details.memberNames.set(member.userId, member.firstName);
  for (const goal of goals) details.savingsGoalNames.set(goal.id, goal.name);
  for (const split of splits) {
    const list = details.splits.get(split.transactionId) ?? [];
    list.push(split);
    details.splits.set(split.transactionId, list);
  }
  for (const account of accounts) details.accountNames.set(account.id, account.name);

  await Promise.all([loadDebtParties(txs, groupId, details), loadReversals(txs, groupId, details)]);
  return details;
}

/**
 * Read defensively: debt_entry_links is newer than most rows, and a title is
 * never worth failing the list over. On a failure no entry gets a party name.
 */
async function loadDebtParties(txs: readonly TxRow[], groupId: number, details: TransactionDetails): Promise<void> {
  const debts = txs.filter(isDebtEntry);
  if (debts.length === 0) return;
  try {
    const partyIds = distinct(debts.map((tx) => tx.settlesContributorId));
    const [parties, links] = await Promise.all([
      inChunks(partyIds, (ids) => db
        .select({ id: groupContributorsTable.id, name: groupContributorsTable.name })
        .from(groupContributorsTable)
        .where(and(eq(groupContributorsTable.groupId, groupId), inArray(groupContributorsTable.id, ids)))),
      inChunks(debts.map((tx) => tx.id), (ids) => db
        .select({ transactionId: debtEntryLinksTable.transactionId, name: groupContributorsTable.name })
        .from(debtEntryLinksTable)
        .innerJoin(groupContributorsTable, eq(groupContributorsTable.id, debtEntryLinksTable.partyId))
        .where(and(eq(debtEntryLinksTable.groupId, groupId), inArray(debtEntryLinksTable.transactionId, ids)))),
    ]);
    for (const party of parties) details.partyNames.set(party.id, party.name);
    for (const link of links) {
      if (!details.linkedPartyNames.has(link.transactionId)) details.linkedPartyNames.set(link.transactionId, link.name);
    }
  } catch {
    details.partyNames.clear();
    details.linkedPartyNames.clear();
  }
}

/** Read defensively, like the debt parties: a label is never worth failing the list. */
async function loadReversals(txs: readonly TxRow[], groupId: number, details: TransactionDetails): Promise<void> {
  if (!reversalLinksReady()) return;
  try {
    const links = await inChunks(txs.map((tx) => tx.id), (ids) => db
      .select()
      .from(reversalLinksTable)
      .where(and(
        eq(reversalLinksTable.groupId, groupId),
        or(inArray(reversalLinksTable.reversalTransactionId, ids), inArray(reversalLinksTable.originalTransactionId, ids)),
      )));
    const wanted = new Set(txs.map((tx) => tx.id));
    for (const link of links) {
      for (const id of [link.reversalTransactionId, link.originalTransactionId]) {
        if (wanted.has(id) && !details.reversalLinks.has(id)) details.reversalLinks.set(id, link);
      }
    }
    const otherIds = distinct([...details.reversalLinks].map(([id, link]) =>
      link.reversalTransactionId === id ? link.originalTransactionId : link.reversalTransactionId));
    const others = await inChunks(otherIds, (ids) => db
      .select({ id: jointAccountTxTable.id, description: jointAccountTxTable.description, date: jointAccountTxTable.date })
      .from(jointAccountTxTable)
      .where(and(eq(jointAccountTxTable.groupId, groupId), inArray(jointAccountTxTable.id, ids))));
    for (const other of others) details.reversalOthers.set(other.id, { description: other.description, date: other.date });
  } catch {
    details.reversalLinks.clear();
    details.reversalOthers.clear();
  }
}

/** Entries as the list and the save routes return them. */
export async function enrichTransactions(txs: readonly TxRow[], groupId: number) {
  const details = await loadTransactionDetails(txs, groupId);
  return txs.map((tx) => describeTransaction(tx, details));
}
