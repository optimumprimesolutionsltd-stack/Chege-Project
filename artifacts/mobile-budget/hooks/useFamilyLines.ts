import { useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetBudgetCategoriesQueryKey, getGetJointAccountQueryKey, useUpdateJointAccountTransaction } from '@workspace/api-client-react';
import { ensurePersonCategory, personLine, rulesAfterConversion } from '@/lib/familyPeople';
import { withFamily } from '@/lib/family';
import { payeeKey, type PayeeRules } from '@/lib/payeeLearning';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

type Earlier = { id: number; amount: number; date: string; description: string; category: string | null };

/**
 * A family member's own line under Family support (lib/familyPeople), and their
 * payments filed there: the rule kept for every message after, and this year's
 * saved payments still under another family category moved across.
 */
export function useFamilyLines() {
  const queryClient = useQueryClient();
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();

  /** Makes their line; gives back the rules to keep and the line's name. */
  const lineFor = async (name: string, rules: PayeeRules): Promise<{ line: string; rules: PayeeRules; converted: boolean }> => {
    const { line, converted } = await ensurePersonCategory(name);
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
    const base = converted ? rulesAfterConversion(rules) : rules;
    return { line, converted, rules: withFamily(base, name, line) };
  };

  /** Their saved payments this year under one of `from`, moved to their line. Gives back how many. */
  const moveEarlier = async (name: string, line: string, from: ReadonlySet<string>): Promise<number> => {
    const key = payeeKey(name);
    if (!key) return 0;
    const { entries } = await customFetch<{ entries: Earlier[] }>('/api/transaction-splits/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [key], since: `${new Date().getFullYear()}-01-01` }),
    }).catch(() => ({ entries: [] as Earlier[] }));
    const theirs = entries.filter((entry) => payeeKey(entry.description) === key && entry.category !== line && (entry.category == null || from.has(entry.category)));
    let moved = 0;
    for (const entry of theirs) {
      await updateTransaction({ id: entry.id, data: { amount: entry.amount, date: entry.date, expenseCategory: line } as never }).then(() => { moved += 1; }).catch(() => {});
    }
    if (moved > 0) {
      void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });
      for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
    }
    return moved;
  };

  return { lineFor, moveEarlier, personLine };
}
