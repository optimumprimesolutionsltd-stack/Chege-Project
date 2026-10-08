import { useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetGroup } from '@workspace/api-client-react';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';
import { businessKeyFor, businessMatches, ownerBusinessKey, parseOwnerBusiness, withKey, withSkipped, type OwnerBusiness } from '@/lib/ownerBusiness';
import { payeeName } from '@/lib/payeeLearning';

type Marked = { ready: boolean; transactionIds: number[] };

/**
 * Your business's names and numbers (kept on this device, lib/ownerBusiness)
 * and the entries marked on the server as money between you and it.
 */
export function useOwnerBusiness() {
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const storageKey = ownerBusinessKey(group?.id);
  const { data: business = parseOwnerBusiness(null) } = useQuery<OwnerBusiness>({
    queryKey: ['owner-business-rule', storageKey],
    queryFn: async () => parseOwnerBusiness(await AsyncStorage.getItem(storageKey).catch(() => null)),
    enabled: group?.id != null,
    staleTime: Infinity,
  });
  const { data: marked } = useQuery<Marked>({
    queryKey: ['owner-business'],
    queryFn: () => customFetch<Marked>('/api/owner-business'),
    staleTime: 60_000,
    retry: false,
  });
  const markedIds = useMemo(() => new Set(marked?.transactionIds ?? []), [marked]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['owner-business'] });
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);

  const save = useCallback(async (next: OwnerBusiness) => {
    queryClient.setQueryData(['owner-business-rule', storageKey], next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  }, [queryClient, storageKey]);

  const mark = useCallback(async (ids: readonly number[]) => {
    if (ids.length === 0) return [];
    const result = await customFetch<{ marked: number[] }>('/api/owner-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionIds: [...ids] }),
    });
    refresh();
    return result.marked;
  }, [refresh]);

  /** Not business money after all: unmarked, and never marked again. */
  const unmark = useCallback(async (id: number) => {
    await customFetch(`/api/owner-business/${id}`, { method: 'DELETE' });
    await save(withSkipped(business, id));
    refresh();
  }, [business, refresh, save]);

  /**
   * "This is my business": the entry's payee becomes one of the business's
   * names, and the entry is marked. Others naming it follow (useAutoMarkBusiness).
   */
  const markFromEntry = useCallback(async (entry: { id: number; description: string }) => {
    const key = businessKeyFor(payeeName(entry.description) || entry.description);
    const next = withKey({ ...business, skipped: business.skipped.filter((id) => id !== entry.id) }, key);
    await save(next);
    await mark([entry.id]);
    return payeeName(entry.description) || entry.description;
  }, [business, mark, save]);

  return { business, ready: marked?.ready === true, markedIds, save, mark, unmark, markFromEntry };
}

/**
 * New entries that name the business are marked as they arrive - from an
 * import, an SMS or by hand - once the business is set up. Quietly, once per
 * entry; the person agreed to this when they named the business.
 */
export function useAutoMarkBusiness<T extends Parameters<typeof businessMatches>[0][number]>(rows: readonly T[] | undefined) {
  const { business, ready, markedIds, mark } = useOwnerBusiness();
  const tried = useRef(new Set<number>());
  useEffect(() => {
    if (!ready || !rows || business.keys.length === 0) return;
    const fresh = businessMatches(rows, business, markedIds).filter((row) => !tried.current.has(row.id));
    if (fresh.length === 0) return;
    for (const row of fresh) tried.current.add(row.id);
    void mark(fresh.map((row) => row.id)).catch(() => {
      // Tried again next time the list is opened.
      for (const row of fresh) tried.current.delete(row.id);
    });
  }, [rows, business, ready, markedIds, mark]);
}
