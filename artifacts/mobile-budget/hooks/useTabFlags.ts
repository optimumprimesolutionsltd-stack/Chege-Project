import { useQuery } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';

/**
 * What this budget has, as far as the tab bar cares: is it shared, does it get
 * reports, does it track debt, is the budget section on. Read from the same
 * cached queries wherever it is used, so the tab bar and the More screen never
 * disagree about what exists.
 */
export function useTabFlags() {
  const { data: group } = useGetGroup();
  const showReports = group?.isPrivate !== false;
  // Debt earns its tab rather than being handed one. A budget that tracks no
  // debt gets no tab — an empty Debt tab on every household's phone would be
  // the opposite of making debt matter — and the moment a category is marked
  // as a debt, it appears.
  const { data: debtCategories = [] } = useQuery<Array<{ debtBalance: number | null; budgetAmount?: number | null }>>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<Array<{ debtBalance: number | null; budgetAmount?: number | null }>>('/api/budget-categories'),
    staleTime: 60_000,
  });
  // Somebody you owe is a debt whether or not a category was ever marked as
  // one. Creditors could be recorded all day — a lender named while borrowing,
  // a party given an opening balance — and the tab stayed away, because it
  // only ever looked at categories.
  const { data: debtParties = [] } = useQuery<Array<{ owedByUs?: number | null }>>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Array<{ owedByUs?: number | null }>>('/api/contributors'),
    staleTime: 60_000,
  });
  const showDebt =
    debtCategories.some((row) => row.debtBalance !== null && row.debtBalance !== undefined) ||
    debtParties.some((party) => typeof party.owedByUs === 'number');
  // Budgeting is off for a budget whose purpose is saving or clearing a debt,
  // because a budget of zeros reads as "KES 0 of KES 0 (0%)" everywhere and
  // makes the app look broken. It is not off forever: the moment any category
  // carries a real amount, the tab comes back on its own, so nobody has to
  // find a setting to undo an answer they gave before they knew what the app
  // did. `enabledSections` is what the budget itself says; a real amount
  // overrides it, never the other way round.
  const hasBudgetedAmount = debtCategories.some((row) => Number(row.budgetAmount ?? 0) > 0);
  // An empty or absent list means "everything", which is what every budget
  // made before sections existed carries.
  const sections = group?.enabledSections;
  const budgetSectionOn = !Array.isArray(sections) || sections.length === 0 || sections.includes('budget');
  const showBudget = budgetSectionOn || hasBudgetedAmount;
  const isShared = group?.isPrivate === false;
  return { group, isShared, showReports, showDebt, showBudget };
}
