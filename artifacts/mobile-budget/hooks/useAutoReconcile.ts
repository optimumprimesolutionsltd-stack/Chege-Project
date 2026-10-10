import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { getImportProgress } from '@/lib/importProgress';
import { reconcileQuietly, RECONCILE_EVERY_MS, type Leftover } from '@/lib/autoReconcile';

const keyFor = (groupId: number) => `jamvi:auto-reconcile:${groupId}`;
type Kept = { at: number; left: Leftover | null };

/**
 * Find the difference, run quietly from Home (lib/autoReconcile): at most every
 * six hours per budget, never while an import is saving, and only for somebody
 * who may change the budget. What it leaves for the person is kept, so Home's
 * Waiting for you can say it between runs.
 */
export function useAutoReconcile(groupId: number | undefined, canManage: boolean, onScreen: boolean): Leftover | null {
  const { data } = useQuery<Leftover | null>({
    queryKey: ['auto-reconcile', groupId],
    enabled: groupId != null && canManage,
    subscribed: onScreen,
    staleTime: RECONCILE_EVERY_MS,
    retry: false,
    queryFn: async () => {
      const key = keyFor(groupId!);
      const kept = await AsyncStorage.getItem(key).then((raw) => (raw ? (JSON.parse(raw) as Kept) : null)).catch(() => null);
      if (kept && Date.now() - kept.at < RECONCILE_EVERY_MS) return kept.left;
      if (getImportProgress()?.stage === 'saving') return kept?.left ?? null;
      const left = await reconcileQuietly().catch(() => kept?.left ?? null);
      await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), left } satisfies Kept)).catch(() => {});
      return left;
    },
  });
  return data ?? null;
}
