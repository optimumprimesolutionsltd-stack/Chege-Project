import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getImportProgress, useImportProgress } from '@/lib/importProgress';
import { reconcileQuietly, RECONCILE_EVERY_MS, type Leftover } from '@/lib/autoReconcile';
import { needsYou } from '@/lib/reconcileLeftover';

const keyFor = (groupId: number) => `jamvi:auto-reconcile:${groupId}`;

/**
 * A count that asks something of the person is checked again after this long,
 * not six hours: Waiting for you said "4 entries M-Pesa never had" after they
 * were sorted, and the screen it opened had nothing to do ("why identify
 * problems you cannot solve?", 10 Oct 2026). Only what still needs them shows.
 */
export const RECHECK_WAITING_MS = 10 * 60 * 1000;
type Kept = { at: number; left: Leftover | null };

/**
 * Find the difference to run again on the next visit to Home, not up to six
 * hours later: after the person brings payments in, removes an entry, or fixes
 * something on Find the difference, Home kept the old count and the job looked
 * never finished (10 Oct 2026).
 */
export function reconcileAgain(client: QueryClient, groupId: number | undefined): void {
  if (groupId == null) return;
  void AsyncStorage.removeItem(keyFor(groupId))
    .catch(() => {})
    .then(() => client.invalidateQueries({ queryKey: ['auto-reconcile', groupId] }));
}

/**
 * Find the difference, run quietly from Home (lib/autoReconcile): at most every
 * six hours per budget, never while an import is saving, and only for somebody
 * who may change the budget. What it leaves for the person is kept, so Home's
 * Waiting for you can say it between runs. A run that fails is not kept, so the
 * next visit tries again.
 */
export function useAutoReconcile(groupId: number | undefined, canManage: boolean, onScreen: boolean): Leftover | null {
  const queryClient = useQueryClient();
  // An import that has just saved changes what M-Pesa and Jamvi have in common.
  const importDone = useImportProgress()?.stage === 'done';
  useEffect(() => {
    if (importDone) reconcileAgain(queryClient, groupId);
  }, [importDone, groupId, queryClient]);

  const { data } = useQuery<Leftover | null>({
    queryKey: ['auto-reconcile', groupId],
    enabled: groupId != null && canManage,
    subscribed: onScreen,
    // Asked again on a visit to Home after this; the kept answer above decides
    // whether that means a new check.
    staleTime: RECHECK_WAITING_MS,
    retry: false,
    queryFn: async () => {
      const key = keyFor(groupId!);
      const kept = await AsyncStorage.getItem(key).then((raw) => (raw ? (JSON.parse(raw) as Kept) : null)).catch(() => null);
      if (kept && Date.now() - kept.at < (needsYou(kept.left) ? RECHECK_WAITING_MS : RECONCILE_EVERY_MS)) return kept.left;
      if (getImportProgress()?.stage === 'saving') return kept?.left ?? null;
      try {
        const left = await reconcileQuietly();
        await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), left } satisfies Kept)).catch(() => {});
        return left;
      } catch {
        return kept?.left ?? null;
      }
    },
  });
  return data ?? null;
}
