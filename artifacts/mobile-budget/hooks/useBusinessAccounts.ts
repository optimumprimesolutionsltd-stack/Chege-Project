import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

type Marked = { ready: boolean; accountIds: number[] };

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

  const setBusiness = useCallback(async (accountId: number, business: boolean) => {
    await customFetch(`/api/business-accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business }),
    });
    queryClient.setQueryData<Marked>(['business-accounts'], (cached) => {
      const ids = new Set(cached?.accountIds ?? []);
      if (business) ids.add(accountId);
      else ids.delete(accountId);
      return { ready: cached?.ready ?? true, accountIds: [...ids] };
    });
    // Every personal figure changes with it.
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });
  }, [queryClient]);

  return { ready: data?.ready === true, businessIds, setBusiness };
}
