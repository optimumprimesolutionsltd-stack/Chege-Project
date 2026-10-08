import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

type Named = { ready: boolean; incomeSourceIds: number[] };

/**
 * The person's businesses: income streams they named as one (api-server
 * lib/business-streams). Until they name one, `named` is false and the old
 * reading - a stream with costs is a business - still applies.
 */
export function useBusinesses() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data } = useQuery<Named>({
    queryKey: ['businesses'],
    queryFn: () => customFetch<Named>('/api/businesses'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const ids = useMemo(() => new Set(data?.incomeSourceIds ?? []), [data]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    void queryClient.invalidateQueries({ queryKey: ['income-sources'] });
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });
  }, [queryClient]);

  const setBusiness = useCallback(async (incomeSourceId: number, business: boolean) => {
    await customFetch(`/api/businesses/${incomeSourceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business }),
    });
    queryClient.setQueryData<Named>(['businesses'], (cached) => {
      const next = new Set(cached?.incomeSourceIds ?? []);
      if (business) next.add(incomeSourceId);
      else next.delete(incomeSourceId);
      return { ready: cached?.ready ?? true, incomeSourceIds: [...next] };
    });
    refresh();
  }, [queryClient, refresh]);

  /**
   * A new business: an income stream under its name, marked as a business. A
   * name already used - any capitals or spacing - is that one, not a second
   * business under the same name.
   */
  const create = useCallback(async (name: string): Promise<{ id: number; name: string } | null> => {
    if (!user?.id || !name.trim()) return null;
    const same = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');
    const streams = await customFetch<Array<{ id: number; name: string }>>('/api/income-sources').catch(() => []);
    const existing = streams.find((stream) => same(stream.name) === same(name));
    if (existing) {
      await setBusiness(existing.id, true);
      return existing;
    }
    const created = await customFetch<{ id: number; name: string }>('/api/income-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, name: name.trim() }),
    });
    await setBusiness(created.id, true);
    return created;
  }, [setBusiness, user?.id]);

  return { ready: data?.ready === true, ids, named: ids.size > 0, setBusiness, create };
}
