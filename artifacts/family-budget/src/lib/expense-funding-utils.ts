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

export function getNewExpenseCategoryMode({
  addToBudget,
  canManageCategories,
}: {
  addToBudget: boolean;
  canManageCategories: boolean;
}) {
  return addToBudget && canManageCategories ? "budgeted" as const : "unbudgeted" as const;
}