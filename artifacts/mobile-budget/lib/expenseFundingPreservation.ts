export type PreservedExpenseSplit = {
  userId?: string | null;
  label?: string;
  amount: number;
  incomeSourceId?: number;
  fromBank: boolean;
};

export function preserveExpenseSplitsForAmount(
  splits: PreservedExpenseSplit[],
  nextAmount: number,
): PreservedExpenseSplit[] | null {
  if (splits.length === 0) return [];
  if (!Number.isInteger(nextAmount) || nextAmount < splits.length) return null;

  const previousTotal = splits.reduce((sum, split) => sum + split.amount, 0);
  if (previousTotal <= 0) return null;
  if (previousTotal === nextAmount) return splits.map((split) => ({ ...split }));

  const distributable = nextAmount - splits.length;
  const weighted = splits.map((split, index) => {
    const exact = (split.amount / previousTotal) * distributable;
    return {
      index,
      amount: 1 + Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = nextAmount - weighted.reduce((sum, item) => sum + item.amount, 0);
  weighted
    .slice()
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((item) => {
      if (remaining <= 0) return;
      weighted[item.index].amount += 1;
      remaining -= 1;
    });

  return splits.map((split, index) => ({
    ...split,
    amount: weighted[index].amount,
  }));
}

export function buildSinglePayerFundingReplacement({
  amount,
  paidFromBank,
  userId,
  sources,
}: {
  amount: number;
  paidFromBank: boolean;
  userId?: string;
  sources: Array<{ incomeSourceId: number; label: string; amount: number }>;
}): PreservedExpenseSplit[] {
  if (paidFromBank) {
    return [{ userId: null, label: 'Joint bank', amount, fromBank: true }];
  }
  return sources.map((source) => ({
    userId,
    label: source.label,
    amount: source.amount,
    incomeSourceId: source.incomeSourceId,
    fromBank: false,
  }));
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
  return addToBudget && canManageCategories ? 'budgeted' as const : 'unbudgeted' as const;
}