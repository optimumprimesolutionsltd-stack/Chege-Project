type ExistingBankTransaction = {
  amount: number;
  type: string;
} | null;

export function getProjectedBalanceAfterOutgoing(
  currentBalance: number,
  outgoingAmount: number,
  existingTransaction: ExistingBankTransaction = null,
): number {
  const balanceWithoutExisting = existingTransaction
    ? currentBalance + (existingTransaction.type === "disbursement"
      ? existingTransaction.amount
      : -existingTransaction.amount)
    : currentBalance;

  return balanceWithoutExisting - outgoingAmount;
}