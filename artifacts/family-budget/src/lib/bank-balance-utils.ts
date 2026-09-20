type ExistingBankTransaction = {
  amount: number;
  type: string;
} | null;

/**
 * What the balance becomes once this posting is saved.
 *
 * Money moves both ways and the person entering a day's postings wants to
 * watch the balance fall towards the figure on their statement, so this takes
 * a direction rather than assuming the money is leaving.
 *
 * An existing transaction is taken back out before the new amount is applied:
 * an edit replaces that posting rather than adding a second one, and without
 * the reversal the projection would count it twice.
 */
export function getProjectedBalanceAfterPosting(
  currentBalance: number,
  amount: number,
  direction: "in" | "out",
  existingTransaction: ExistingBankTransaction = null,
): number {
  const balanceWithoutExisting = existingTransaction
    ? currentBalance + (existingTransaction.type === "disbursement"
      ? existingTransaction.amount
      : -existingTransaction.amount)
    : currentBalance;

  return direction === "out"
    ? balanceWithoutExisting - amount
    : balanceWithoutExisting + amount;
}

export function getProjectedBalanceAfterOutgoing(
  currentBalance: number,
  outgoingAmount: number,
  existingTransaction: ExistingBankTransaction = null,
): number {
  return getProjectedBalanceAfterPosting(currentBalance, outgoingAmount, "out", existingTransaction);
}
