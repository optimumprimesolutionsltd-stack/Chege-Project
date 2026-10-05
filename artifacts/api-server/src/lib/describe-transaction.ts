import type { jointAccountTxTable, reversalLinksTable } from "@workspace/db";

/**
 * How one bank or M-Pesa entry is shown in a list, worked out from what was
 * fetched for the whole list at once (lib/transaction-details).
 *
 * The list used to fetch these for each entry on its own: who made it, its
 * savings goal, its splits, the account at the other end of a transfer, the
 * party to a debt and the other half of a reversal - up to six queries an
 * entry, all sent together. A year of M-Pesa is a couple of thousand entries,
 * so opening the account queued several thousand queries on a pool of ten
 * connections, and every other request waited behind them: the whole server
 * stood still for about 25 seconds at a time (5 Oct 2026), long enough for
 * Render to answer "502" and for a two-message import to take over a minute.
 *
 * No database here, so this part is tested on its own.
 */

export type TxRow = typeof jointAccountTxTable.$inferSelect;
export type ReversalLinkRow = typeof reversalLinksTable.$inferSelect;

export type SplitRow = {
  transactionId: number;
  userId: string | null;
  amount: number;
  incomeSourceId: number | null;
  userName: string | null;
};

export type TransactionDetails = {
  /** First name of each member of this budget, by user id. */
  memberNames: Map<string, string | null>;
  savingsGoalNames: Map<number, string>;
  /** A deposit's splits, by its id. */
  splits: Map<number, SplitRow[]>;
  accountNames: Map<number, string>;
  /** The party named on the row itself (settles_contributor_id), by party id. */
  partyNames: Map<number, string>;
  /** The party in debt_entry_links, by entry id. */
  linkedPartyNames: Map<number, string>;
  /** The reversal link each entry is half of, by entry id. */
  reversalLinks: Map<number, ReversalLinkRow>;
  /** The other half of a reversal, by its id. */
  reversalOthers: Map<number, { description: string | null; date: string | Date }>;
};

export const emptyTransactionDetails = (): TransactionDetails => ({
  memberNames: new Map(),
  savingsGoalNames: new Map(),
  splits: new Map(),
  accountNames: new Map(),
  partyNames: new Map(),
  linkedPartyNames: new Map(),
  reversalLinks: new Map(),
  reversalOthers: new Map(),
});

/** Whether an entry has a debt party worth looking up at all. */
export const isDebtEntry = (tx: TxRow): boolean => Boolean(tx.isBorrowing || tx.isLending || tx.settlesContributorId);

/**
 * The person or business a debt entry was with. A repayment names them on the
 * row itself; a borrowing or a loan out names them in debt_entry_links.
 *
 * The row's own party is the one somebody chose on this posting, and wins.
 * A link written earlier - an M-Pesa import's guess - could name somebody
 * else, and titling the row after it said "Paid to Ujenzi" on a payment the
 * form showed going to Hermda.
 */
export function debtPartyName(tx: TxRow, details: TransactionDetails): string | null {
  if (!isDebtEntry(tx)) return null;
  if (tx.settlesContributorId) {
    const party = details.partyNames.get(tx.settlesContributorId);
    if (party !== undefined) return party;
  }
  return details.linkedPartyNames.get(tx.id) ?? null;
}

/** How the list shows an entry that is half of a reversal, or null. */
export function reversalPairing(tx: TxRow, details: TransactionDetails) {
  const link = details.reversalLinks.get(tx.id);
  if (!link) return null;
  const isMoneyBack = link.reversalTransactionId === tx.id;
  const otherId = isMoneyBack ? link.originalTransactionId : link.reversalTransactionId;
  const other = details.reversalOthers.get(otherId);
  if (!other) return null;
  return {
    role: isMoneyBack ? ("money_back" as const) : ("reversed_payment" as const),
    otherTransactionId: otherId,
    otherDescription: other.description ?? "",
    otherDate: String(other.date),
  };
}

export function describeTransaction(tx: TxRow, details: TransactionDetails) {
  const contributorSplits = tx.type === "deposit" ? details.splits.get(tx.id) ?? [] : [];
  const memberName = tx.madeById ? details.memberNames.get(tx.madeById) ?? null : null;
  const madeByName = contributorSplits.length === 1
    ? (contributorSplits[0].userName ?? "Member")
    : contributorSplits.length > 1
      ? `${contributorSplits.length} contributors`
      : memberName;
  return {
    ...tx,
    // null madeById = Joint bank (shared household); name resolves to null so UI can show GROUP_ATTRIBUTION
    madeByName,
    notes: tx.notes ?? null,
    expenseCategory: tx.expenseCategory ?? null,
    isLending: tx.isLending ?? false,
    chargeForTransactionId: tx.chargeForTransactionId ?? null,
    isBorrowing: tx.isBorrowing ?? false,
    // Which party a repayment settled. Without it the editor reopens a
    // repayment as ordinary money in, and says so on screen.
    settlesContributorId: tx.settlesContributorId ?? null,
    // Who the money was borrowed from, lent to, or paid back by, so the entry
    // can be titled by them ("Borrowed from KCB") rather than by the bank's text.
    debtPartyName: debtPartyName(tx, details),
    // Half of a reversal: a money-back deposit, or the payment it undid.
    reversal: reversalPairing(tx, details),
    savingsGoalId: tx.savingsGoalId ?? null,
    savingsGoalName: tx.savingsGoalId ? details.savingsGoalNames.get(tx.savingsGoalId) ?? null : null,
    transferDirection: tx.transferDirection ?? null,
    bankTransferId: tx.bankTransferId ?? null,
    bankTransferAccountId: tx.bankTransferAccountId ?? null,
    bankTransferAccountName: tx.bankTransferAccountId ? details.accountNames.get(tx.bankTransferAccountId) ?? null : null,
    expenseId: tx.expenseId ?? null,
    contributorSplits: contributorSplits.map((split) => ({
      userId: split.userId,
      userName: split.userName ?? "Member",
      amount: split.amount,
      incomeSourceId: split.incomeSourceId ?? null,
    })),
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
  };
}
