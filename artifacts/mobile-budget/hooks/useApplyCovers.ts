import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey } from '@workspace/api-client-react';
import { useImportProgress } from '@/lib/importProgress';
import { coversRules, sweepSince, type CoversPlan } from '@/lib/covers';
import { parseStoredRules, payeeKey, rulesStorageKey } from '@/lib/payeeLearning';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

type Candidate = { id: number; amount: number; date: string; description: string; category: string | null };

/**
 * What a person's money covers, applied to their payments since `since` that are
 * not split yet (api-server lib/transaction-splits). Returns how many were split.
 */
export async function applyCoversFor(client: QueryClient, key: string, covers: CoversPlan, since: string): Promise<number> {
  const { entries } = await customFetch<{ entries: Candidate[] }>('/api/transaction-splits/candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: [key], since }),
  });
  // Found by name on the server; the same person only, by their payee key, here.
  const theirs = entries.filter((entry) => payeeKey(entry.description) === key).map((entry) => entry.id);
  if (theirs.length === 0) return 0;
  const { split } = await customFetch<{ split: number }>('/api/transaction-splits/covers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionIds: theirs, payeeKey: key, plan: covers.plan, rest: covers.rest }),
  });
  if (split > 0) {
    void client.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) void client.invalidateQueries({ queryKey });
  }
  return split;
}

/**
 * From Home: every person whose money covers something has their new payments
 * split by it, with no question - at most every half hour, and again as soon as
 * an import has saved. Only for who may change the budget; never in the way.
 */
export function useApplyCovers(groupId: number | undefined, canManage: boolean, onScreen: boolean): void {
  const queryClient = useQueryClient();
  const importDone = useImportProgress()?.stage === 'done';
  useEffect(() => {
    if (importDone && groupId != null) void queryClient.invalidateQueries({ queryKey: ['apply-covers', groupId] });
  }, [importDone, groupId, queryClient]);

  useQuery({
    queryKey: ['apply-covers', groupId],
    enabled: groupId != null && canManage,
    subscribed: onScreen,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const rules = parseStoredRules(await AsyncStorage.getItem(rulesStorageKey(groupId)).catch(() => null));
      let split = 0;
      for (const { payeeKey: key, ...covers } of coversRules(rules)) {
        split += await applyCoversFor(queryClient, key, covers, sweepSince()).catch(() => 0);
      }
      return split;
    },
  });
}
