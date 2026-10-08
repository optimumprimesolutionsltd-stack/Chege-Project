import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

type Marked = { ready: boolean; accountIds: number[]; accounts?: Array<{ accountId: number; incomeSourceId: number | null }> };

/**
 * Which accounts are the business's (api-server lib/business-accounts): kept
 * out of personal income, spending and reports, and shown in the Business
 * report instead.
 */
export function useBusinessAccounts() {
  const queryClient = useQueryClient();
  const { data } = useQuery<Marked>({
    queryKey: ['business-accounts'],
    queryFn: () => customFetch<Marked>('/api/business-accounts'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const businessIds = useMemo(() => new Set(data?.accountIds ?? []), [data]);
  /** Which business (income stream) each business account belongs to, when set. */
  const businessOf = useMemo(() => new Map((data?.accounts ?? []).map((row) => [row.accountId, row.incomeSourceId])), [data]);

  const setBusiness = useCallback(async (accountId: number, business: boolean, incomeSourceId: number | null = null) => {
    await customFetch(`/api/business-accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business, incomeSourceId }),
    });
    queryClient.setQueryData<Marked>(['business-accounts'], (cached) => {
      const rows = (cached?.accounts ?? (cached?.accountIds ?? []).map((id) => ({ accountId: id, incomeSourceId: null })))
        .filter((row) => row.accountId !== accountId);
      if (business) rows.push({ accountId, incomeSourceId });
      return { ready: cached?.ready ?? true, accountIds: rows.map((row) => row.accountId), accounts: rows };
    });
    // Every personal figure changes with it.
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });
  }, [queryClient]);

  return { ready: data?.ready === true, businessIds, businessOf, setBusiness };
}
