export function hasMissingPersonalFundingSource({
  payerIds,
  isSplitPayment,
  incomeSourceId,
  payerIncomeSourceIds,
}: {
  payerIds: string[];
  isSplitPayment: boolean;
  incomeSourceId: number | null;
  payerIncomeSourceIds: Record<string, number | null>;
}) {
  return payerIds.some((payerId) =>
    isSplitPayment
      ? !payerIncomeSourceIds[payerId]
      : !incomeSourceId,
  );
}

export function getExpenseFundingControlState({
  paidFromBank,
  hasPersonalFunding,
  allowMixedFunding,
}: {
  paidFromBank: boolean;
  hasPersonalFunding: boolean;
  allowMixedFunding: boolean;
}) {
  const bankOnly = paidFromBank && !hasPersonalFunding;
  return {
    requiresBankAccount: paidFromBank,
    personalPayersDisabled: bankOnly && !allowMixedFunding,
    showBankOnlyExplanation: bankOnly,
    showPersonalIncomeSources: !paidFromBank && hasPersonalFunding,
  };
}

export function getFundingRemainder(total: number, primaryAmount: number): number {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(primaryAmount) || primaryAmount <= 0) {
    return 0;
  }
  return Math.max(0, total - primaryAmount);
}

export function addFundingSourceWithRemainder({
  total,
  selectedSourceIds,
  newSourceId,
  amounts,
}: {
  total: number;
  selectedSourceIds: string[];
  newSourceId: string;
  amounts: Record<string, string>;
}): Record<string, string> {
  if (selectedSourceIds.includes(newSourceId) || selectedSourceIds.length !== 1) return amounts;
  const remainder = getFundingRemainder(total, Number(amounts[selectedSourceIds[0]]));
  return remainder > 0 ? { ...amounts, [newSourceId]: String(remainder) } : amounts;
}

export function getNewExpenseCategoryMode({
  addToBudget,
  canManageCategories,
}: {
  addToBudget: boolean;
  canManageCategories: boolean;
}) {
  return addToBudget && canManageCategories ? "budgeted" as const : "unbudgeted" as const;
}