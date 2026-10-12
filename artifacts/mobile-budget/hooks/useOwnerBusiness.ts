import { useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetGroup, useGetJointAccounts } from '@workspace/api-client-react';
import { useBusinessAccounts } from '@/hooks/useBusinessAccounts';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';
import { unassignedBusinessAccounts, bankAccountKeys, businessKeyFor, businessMatches, ownerBusinessKey, parseOwnerBusiness, withBankAccountKeys, withKey, withSkipped, type OwnerBusiness } from '@/lib/ownerBusiness';
import { payeeName } from '@/lib/payeeLearning';
import { namedFor } from '@/lib/namedPayees';
import { useNamedPayees } from '@/hooks/useNamedPayees';
import { saveKnowledge } from '@/lib/knowledgeStore';

/** businessOf: the business each entry went to or came from, where one was chosen (transaction id to income stream id). */
type Marked = { ready: boolean; transactionIds: number[]; businessOf?: Record<string, number> };

/**
 * Your business's names and numbers (kept on the server, lib/knowledgeStore)
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
  /** Which of the person's businesses a marked entry is with; undefined for the business set up first. */
  const businessIdOf = useCallback((id: number): number | undefined => {
    const business = marked?.businessOf?.[String(id)];
    return business === undefined ? undefined : Number(business);
  }, [marked]);
  // The business's bank accounts on Bank count as its own, untyped (lib/ownerBusiness).
  const { data: accounts = [] } = useGetJointAccounts();
  const { businessOf } = useBusinessAccounts();
  const fromBank = useMemo(
    () => bankAccountKeys(accounts, businessOf, business.incomeSourceId),
    [accounts, businessOf, business.incomeSourceId],
  );
  const matching = useMemo(() => withBankAccountKeys(business, fromBank), [business, fromBank]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['owner-business'] });
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);

  const save = useCallback(async (next: OwnerBusiness) => {
    queryClient.setQueryData(['owner-business-rule', storageKey], next);
    // On the server too, for every phone and the web (lib/knowledgeStore).
    await saveKnowledge(group?.id, 'owner-business', next);
  }, [group?.id, queryClient, storageKey]);

  const mark = useCallback(async (ids: readonly number[], incomeSourceId?: number) => {
    if (ids.length === 0) return [];
    const result = await customFetch<{ marked: number[] }>('/api/owner-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionIds: [...ids], ...(incomeSourceId ? { incomeSourceId } : {}) }),
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

  const unassigned = useMemo(() => unassignedBusinessAccounts(accounts, businessOf), [accounts, businessOf]);

  return { business, matching, fromBank, unassigned, ready: marked?.ready === true, markedIds, businessIdOf, save, mark, unmark, markFromEntry };
}

/**
 * New entries that name the business are marked as they arrive - from an
 * import, an SMS or by hand - once the business is set up. Quietly, once per
 * entry; the person agreed to this when they named the business.
 */
export function useAutoMarkBusiness<T extends Parameters<typeof businessMatches>[0][number]>(rows: readonly T[] | undefined) {
  const { matching: business, ready, markedIds, mark } = useOwnerBusiness();
  const { named } = useNamedPayees();
  const tried = useRef(new Set<number>());
  useEffect(() => {
    if (!ready || !rows || business.keys.length === 0) return;
    // A payee named with a category is the person's word, and wins over a business key that
    // also matches it (a church's KCB account, 11 Oct 2026).
    const fresh = businessMatches(rows, business, markedIds)
      .filter((row) => !tried.current.has(row.id) && !namedFor(row.description, named)?.category);
    if (fresh.length === 0) return;
    for (const row of fresh) tried.current.add(row.id);
    void mark(fresh.map((row) => row.id)).catch(() => {
      // Tried again next time the list is opened.
      for (const row of fresh) tried.current.delete(row.id);
    });
  }, [rows, business, ready, markedIds, mark, named]);
}
