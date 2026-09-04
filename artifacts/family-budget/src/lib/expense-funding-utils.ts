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
    showPersonalIncomeSources: hasPersonalFunding && (!paidFromBank || allowMixedFunding),
  };
}

export function getFundingRemainder(total: number, primaryAmount: number): number {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(primaryAmount) || primaryAmount <= 0) {
    return 0;
  }
  return Math.max(0, total - primaryAmount);
}

export function isFundingFulfilled(total: number, fundingTotal: number): boolean {
  return Number.isFinite(total) && total > 0 && Number.isFinite(fundingTotal) && fundingTotal >= total;
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
  if (selectedSourceIds.includes(newSourceId)) return amounts;
  const assigned = selectedSourceIds.reduce(
    (sum, sourceId) => sum + (Number(amounts[sourceId]) || 0),
    0,
  );
  const remainder = getFundingRemainder(total, assigned);
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

export type ExpenseEntryStatus = {
  tone: "ready" | "attention" | "error";
  message: string;
};

export function getProjectedCategoryBalance({
  budgetAmount,
  spentAmount,
  allocationAmount,
  previousAllocationAmount = 0,
}: {
  budgetAmount: number;
  spentAmount: number;
  allocationAmount: number;
  previousAllocationAmount?: number;
}) {
  const projectedSpent = spentAmount - previousAllocationAmount + allocationAmount;
  const difference = budgetAmount - projectedSpent;
  return {
    projectedSpent,
    remaining: Math.max(0, difference),
    overBy: Math.max(0, -difference),
    isOverBudget: difference < 0,
  };
}

export function getCategoryAllocationStatus({
  total,
  allocations,
  formatAmount,
}: {
  total: number;
  allocations: Array<{ category: string; amount: number }>;
  formatAmount: (amount: number) => string;
}): ExpenseEntryStatus {
  if (!Number.isInteger(total) || total <= 0) {
    return { tone: "attention", message: "Enter the expense amount to begin" };
  }
  if (allocations.some((allocation) => !allocation.category.trim())) {
    return { tone: "attention", message: "Choose a category for every row" };
  }
  if (new Set(allocations.map((allocation) => allocation.category.trim().toLocaleLowerCase())).size !== allocations.length) {
    return { tone: "error", message: "Choose a different category for each row" };
  }
  const hasInvalidAmount = allocations.some((allocation) => !Number.isInteger(allocation.amount) || allocation.amount <= 0);
  const allocated = allocations.reduce(
    (sum, allocation) => sum + (Number.isInteger(allocation.amount) && allocation.amount > 0 ? allocation.amount : 0),
    0,
  );
  const difference = total - allocated;
  if (hasInvalidAmount) {
    if (allocated === 0) {
      return { tone: "attention", message: "Enter a positive whole-KES amount for every category" };
    }
    if (difference > 0) {
      return {
        tone: "error",
        message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · ${formatAmount(difference)} remaining`,
      };
    }
    if (difference < 0) {
      return {
        tone: "error",
        message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · ${formatAmount(Math.abs(difference))} over`,
      };
    }
    return {
      tone: "attention",
      message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · Complete the remaining category amounts`,
    };
  }

  if (difference > 0) {
    return {
      tone: "error",
      message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · ${formatAmount(difference)} remaining`,
    };
  }
  if (difference < 0) {
    return {
      tone: "error",
      message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · ${formatAmount(Math.abs(difference))} over`,
    };
  }
  return {
    tone: "ready",
    message: `Allocated ${formatAmount(allocated)} of ${formatAmount(total)} · Ready to save`,
  };
}

export function getExpenseFundingStatus({
  total,
  fundingTotal,
  hasBankFunding,
  hasBankAccount,
  hasDirectFunding,
  hasDirectPayer,
  hasDirectIncomeSource,
  formatAmount,
}: {
  total: number;
  fundingTotal: number;
  hasBankFunding: boolean;
  hasBankAccount: boolean;
  hasDirectFunding: boolean;
  hasDirectPayer: boolean;
  hasDirectIncomeSource: boolean;
  formatAmount: (amount: number) => string;
}): ExpenseEntryStatus {
  if (!Number.isInteger(total) || total <= 0) {
    return { tone: "attention", message: "Enter the expense amount to begin" };
  }
  if (!hasBankFunding && !hasDirectFunding) {
    return { tone: "attention", message: "Choose a direct payer or bank account to begin" };
  }
  if (hasBankFunding && !hasBankAccount) {
    return { tone: "attention", message: "Choose the bank account used for this expense" };
  }
  if (hasDirectFunding && !hasDirectPayer) {
    return { tone: "attention", message: "Choose who paid the direct portion" };
  }
  if (hasDirectFunding && !hasDirectIncomeSource) {
    return { tone: "attention", message: "Choose an income source for every direct portion" };
  }
  if (!Number.isInteger(fundingTotal) || fundingTotal <= 0) {
    return { tone: "attention", message: "Enter the amount from each funding source" };
  }

  const difference = total - fundingTotal;
  if (difference > 0) {
    return {
      tone: "attention",
      message: `Funded ${formatAmount(fundingTotal)} of ${formatAmount(total)} · ${formatAmount(difference)} remaining`,
    };
  }
  if (difference < 0) {
    return {
      tone: "error",
      message: `Funded ${formatAmount(fundingTotal)} of ${formatAmount(total)} · ${formatAmount(Math.abs(difference))} over`,
    };
  }
  return {
    tone: "ready",
    message: `Funded ${formatAmount(fundingTotal)} of ${formatAmount(total)} · Fully funded`,
  };
}