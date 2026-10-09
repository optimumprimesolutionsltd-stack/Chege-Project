import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getBudgetCategories } from '@workspace/api-client-react';
import { applyLinksForMatching, ensureCommonCategories, fetchStandardLinks, recognisedPlace } from '@/lib/commonCategories';
import type { EntryToSort } from '@/lib/entriesToSort';
import { getImportProgress } from '@/lib/importProgress';
import type { StandardTarget } from '@/lib/standardCategory';

/**
 * This budget's common category for each kind of payee (lib/commonCategories),
 * kept where lib/knownPayees reads it, so a renamed "Eating out" still gets
 * the restaurants - on every screen that files or suggests.
 */
export function useStandardLinks(enabled: boolean): void {
  const { data } = useQuery({
    queryKey: ['standard-categories'],
    queryFn: fetchStandardLinks,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    applyLinksForMatching(data ?? []);
  }, [data]);
}

const sortedOnceKey = (groupId: number) => `jamvi:recognised-sorted:v1:${groupId}`;

/**
 * Once per budget: entries already saved as Not sure yet to a payee Jamvi knows
 * are filed where they belong, making the common category where needed. "Sort
 * them once" (9 Oct 2026). Only for somebody who may change the budget; quietly,
 * a while after Home opens, and never during an import's save.
 */
export function useSortRecognisedOnce(groupId: number | undefined, canManage: boolean): void {
  const queryClient = useQueryClient();
  const running = useRef(false);
  useEffect(() => {
    if (!groupId || !canManage || running.current) return;
    const timer = setTimeout(() => {
      void (async () => {
        if (running.current || getImportProgress()?.stage === 'saving') return;
        if ((await AsyncStorage.getItem(sortedOnceKey(groupId)).catch(() => null)) === 'done') return;
        running.current = true;
        try {
          const [{ entries }, categories] = await Promise.all([
            customFetch<{ entries: EntryToSort[] }>('/api/entries-to-sort', { responseType: 'json' }),
            getBudgetCategories(),
          ]);
          const names = (categories as Array<{ name: string }>).map((row) => row.name);
          const places = entries
            .filter((entry) => entry.direction === 'out')
            .map((entry) => ({ entry, place: recognisedPlace(entry.description, names) }))
            .filter((row): row is { entry: EntryToSort; place: NonNullable<typeof row.place> } => row.place !== null);
          const made = await ensureCommonCategories(places.map((row) => row.place.target).filter((target): target is StandardTarget => target !== null));
          let filed = 0;
          for (const { entry, place } of places) {
            const name = place.target ? made.get(place.target.key) : place.name;
            if (!name) continue;
            try {
              await customFetch(`/api/joint-account/${entry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: entry.amount, date: entry.date, expenseCategory: name }),
              });
              filed += 1;
            } catch {
              // Left Not sure; Sort them out still has it.
            }
          }
          await AsyncStorage.setItem(sortedOnceKey(groupId), 'done').catch(() => {});
          if (filed > 0 || made.size > 0) void queryClient.invalidateQueries();
        } catch {
          // Tried again next time Home opens.
        } finally {
          running.current = false;
        }
      })();
    }, 4_000);
    return () => clearTimeout(timer);
  }, [groupId, canManage, queryClient]);
}
