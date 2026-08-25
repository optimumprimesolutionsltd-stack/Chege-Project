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