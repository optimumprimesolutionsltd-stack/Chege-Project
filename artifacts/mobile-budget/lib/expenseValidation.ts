/**
 * Everything that can be wrong with an expense, worked out in one pass.
 *
 * The save button used to stop at the first fault and raise an alert. With
 * roughly twenty-five possible faults on the busiest screen in the app, a
 * half-filled form became a queue: fix one thing, tap Save, get told the next
 * thing, tap Save again. Somebody entering an expense at a counter has no
 * patience for that, and no way to see how much further they have to go.
 *
 * Collecting the faults costs nothing extra - every check was already pure -
 * and lets the screen say all of it at once.
 *
 * Deliberately not included here: the two branches that are flow rather than
 * fault. Clearing the amount on an existing expense means delete, and offering
 * to add a category later is a question with three answers and a navigation in
 * one of them. Neither is a validation error, and folding them in would have
 * turned a list of problems into a list of decisions.
 */

export type ExpenseProblem = {
  /** Which control is at fault, so a caller can focus or highlight it. */
  field: string;
  /** The heading the single-fault alert uses, and the label in a list. */
  title: string;
  message: string;
};

export type ExpenseValidationInput = {
  amount: string;
  description: string;
  notes: string;
  date: string;
  todayIso: string;
  isAdvanced: boolean;
  isEditMode: boolean;
  category: string;
  hasNormalIncomeSource: boolean;
  categoryAllocations: Array<{ category: string; amount: string }>;
  isRecurring: boolean;
  recurringMonthlyBudget: string;
  payerIds: string[];
  payerAmounts: Record<string, string>;
  payerIncomeSourceIds: Record<string, string | number | null | undefined>;
  paidFromBank: boolean;
  selectedBankAccountId: number | null;
  selectedSources: string[];
  splitAmounts: Record<string, string>;
  fundingDirty: boolean;
  /** True when editing an expense whose funding was not touched: the existing
   *  splits are preserved wholesale, so none of the funding rules apply. */
  skipFundingChecks: boolean;
};

export const JOINT_BANK_KEY = '__joint_bank__';

const kes = (value: number) => value.toLocaleString();

/** The amount as the rest of the form reads it. Commas are how people type
 *  thousands, and they are not part of the number. */
export function parseExpenseAmount(amount: string): number {
  return parseFloat(amount.replace(/,/g, ''));
}

function money(value: string | undefined): number {
  return parseFloat(value || '0') || 0;
}

/** The allocations that actually name a category, with their amounts as
 *  numbers. Rows left blank are not errors; they are rows not yet filled. */
export function normalizeAllocations(
  allocations: Array<{ category: string; amount: string }>,
): Array<{ category: string; amount: number }> {
  return allocations
    .filter((allocation) => allocation.category.trim())
    .map((allocation) => ({
      category: allocation.category.trim(),
      amount: Number(allocation.amount.replace(/,/g, '')),
    }));
}

export function collectExpenseProblems(input: ExpenseValidationInput): ExpenseProblem[] {
  const problems: ExpenseProblem[] = [];
  const add = (field: string, title: string, message: string) =>
    problems.push({ field, title, message });

  const parsed = parseExpenseAmount(input.amount);
  const amountUsable = Boolean(parsed) && parsed > 0;
  if (!amountUsable) {
    add('amount', 'Amount required', 'Please enter a valid amount.');
  }
  if (!input.description.trim()) {
    add('description', 'Description required', 'Please add a description.');
  }

  if (!input.isAdvanced && !input.isEditMode) {
    if (!input.category.trim()) {
      add('category', 'Category required', 'Choose one category for this expense, or switch to Detailed for more options.');
    }
    if (!input.hasNormalIncomeSource) {
      add('incomeSource', 'Income source required', 'Add a saved income source in Detailed before you can save this expense.');
    }
  }

  const hasOther = input.categoryAllocations.some(
    (allocation) => allocation.category.trim().toLocaleLowerCase() === 'other',
  );
  if (hasOther && input.notes.trim().length < 3) {
    add('notes', 'Note required', 'Add a short note explaining what this one-off expense was for.');
  }

  const allocations = normalizeAllocations(input.categoryAllocations);
  if (allocations.length > 0) {
    if (allocations.some((allocation) => !Number.isInteger(allocation.amount) || allocation.amount <= 0)) {
      add('allocations', 'Allocation amounts required', 'Enter a positive whole-KES amount for every category.');
    } else if (amountUsable) {
      // Only worth comparing against a total that exists. Reporting a shortfall
      // measured against a missing amount would be noise on top of the real
      // fault, which is the missing amount.
      const allocated = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      if (allocated !== parsed) {
        const difference = parsed - allocated;
        add(
          'allocations',
          difference > 0 ? 'Category amounts still needed' : 'Category amounts exceed the expense',
          difference > 0
            ? `Allocate the remaining KES ${kes(difference)} before saving.`
            : `Reduce category allocations by KES ${kes(Math.abs(difference))}.`,
        );
      }
    }
  }

  if (input.isRecurring && allocations.length > 1) {
    add(
      'recurring',
      'Recurring expenses need one category',
      'A recurring expense cannot be split across categories yet because each recurring expense updates one category budget. Save this as a one-time expense or use one category.',
    );
  }
  const recurringBudget = Number(input.recurringMonthlyBudget);
  if (input.isRecurring && (!Number.isInteger(recurringBudget) || recurringBudget <= 0)) {
    add('recurringBudget', 'Monthly budget required', 'Enter a whole KES amount greater than zero for this recurring expense.');
  }

  if (input.payerIds.length === 0 && !input.paidFromBank) {
    add('paidBy', 'Paid by required', 'Please choose who paid.');
  }
  if (input.paidFromBank && input.selectedBankAccountId == null) {
    add('bankAccount', 'Bank account required', 'Choose the bank account that funded this expense.');
  }
  if (input.date > input.todayIso) {
    add('date', 'Future date not allowed', 'This records actual spending — please use today or an earlier date.');
  }

  if (!input.skipFundingChecks) {
    problems.push(...fundingProblems(input, parsed, amountUsable));
  }

  return problems;
}

/**
 * Where the money came from, and whether the parts add up to the whole.
 *
 * Split and single funding are different shapes, not different strictnesses:
 * one expense paid by two people needs a portion each, one paid from a single
 * account needs that account to cover it.
 */
function fundingProblems(
  input: ExpenseValidationInput,
  parsed: number,
  amountUsable: boolean,
): ExpenseProblem[] {
  const problems: ExpenseProblem[] = [];
  const add = (field: string, title: string, message: string) =>
    problems.push({ field, title, message });

  const sourceCount = input.payerIds.length + (input.paidFromBank ? 1 : 0);

  if (sourceCount > 1) {
    const anyPortionEmpty =
      input.payerIds.some((id) => money(input.payerAmounts[id]) <= 0) ||
      (input.paidFromBank && money(input.payerAmounts[JOINT_BANK_KEY]) <= 0);
    if (anyPortionEmpty) {
      add('funding', 'Enter every funding portion', 'Each direct-payment and bank-deposit portion must be greater than zero.');
    }
    if (input.payerIds.some((id) => !input.payerIncomeSourceIds[id])) {
      add('funding', 'Income source required', 'Choose the saved income stream that funded every direct-payment portion.');
    }
    if (!anyPortionEmpty && amountUsable) {
      const splitTotal =
        input.payerIds.reduce((sum, id) => sum + money(input.payerAmounts[id]), 0) +
        (input.paidFromBank ? money(input.payerAmounts[JOINT_BANK_KEY]) : 0);
      if (!Number.isInteger(parsed) || splitTotal !== parsed) {
        add(
          'funding',
          "Amounts don't add up",
          `Payer portions total KES ${kes(splitTotal)} but the expense is KES ${kes(parsed)}.`,
        );
      }
    }
    return problems;
  }

  if (input.paidFromBank) {
    const bankAmount = money(input.payerAmounts[JOINT_BANK_KEY]);
    if (!Number.isInteger(bankAmount) || bankAmount <= 0) {
      add('funding', 'Enter the funding amount', 'Enter how much came from the selected bank account.');
    } else if (amountUsable && bankAmount !== parsed) {
      const remaining = parsed - bankAmount;
      add(
        'funding',
        remaining > 0 ? 'Add another funding source' : 'Funding exceeds the expense',
        remaining > 0
          ? `KES ${kes(remaining)} is still unfunded. Add a direct-payment portion.`
          : `Reduce the bank funding by KES ${kes(Math.abs(remaining))}.`,
      );
    }
    return problems;
  }

  if (input.selectedSources.length === 0) {
    // An untouched edit keeps the funding it already had, so silence is right.
    if (!input.isEditMode || input.fundingDirty) {
      add('funding', 'Source required', 'Please choose where this money came from.');
    }
    return problems;
  }

  if (input.selectedSources.some((key) => money(input.splitAmounts[key]) <= 0)) {
    add('funding', 'Enter the funding amount', 'Enter how much came from every selected income source.');
    return problems;
  }

  if (amountUsable) {
    const splitsTotal = input.selectedSources.reduce((sum, key) => sum + money(input.splitAmounts[key]), 0);
    // A shilling of rounding is not a disagreement worth blocking a save over.
    if (Math.abs(splitsTotal - parsed) >= 1) {
      const remaining = parsed - splitsTotal;
      add(
        'funding',
        remaining > 0 ? 'Add another funding source' : 'Funding exceeds the expense',
        remaining > 0
          ? `KES ${kes(remaining)} is still unfunded. Select another income source.`
          : `Reduce the funding amounts by KES ${kes(Math.abs(remaining))}.`,
      );
    }
  }

  return problems;
}

/**
 * One alert for however many faults there are.
 *
 * A single fault keeps exactly the wording it had before, because that is
 * still the common case and there is nothing to enumerate. Several become a
 * numbered list under a heading that says how many, so the person can see the
 * whole of what is left rather than discovering it one tap at a time.
 */
export function describeProblems(problems: ExpenseProblem[]): { title: string; message: string } {
  if (problems.length === 1) {
    return { title: problems[0].title, message: problems[0].message };
  }
  return {
    title: `${problems.length} things need fixing`,
    message: problems
      .map((problem, index) => `${index + 1}. ${problem.title} — ${problem.message}`)
      .join('\n\n'),
  };
}
