import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

/** paysSalary: "Do you pay yourself a salary from it?" - null until asked (lib/businessSalary). */
export type Business = { id: number; name: string; countsProfit: boolean; paysSalary?: boolean | null };
type Named = { ready: boolean; incomeSourceIds: number[]; businesses?: Business[] };

/**
 * The person's businesses, named in My businesses (api-server
 * lib/business-streams). Only these are businesses - never an income stream.
 * Each either counts its profit here (a Business report) or only passes
 * through your phone (a salary is drawn from it); either way its money stays
 * out of your personal income and spending.
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
  const list = useMemo<Business[]>(() => data?.businesses ?? [], [data]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    void queryClient.invalidateQueries({ queryKey: ['income-sources'] });
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });
  }, [queryClient]);

  const setBusiness = useCallback(async (incomeSourceId: number, business: boolean, countsProfit?: boolean) => {
    await customFetch(`/api/businesses/${incomeSourceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business, ...(countsProfit === undefined ? {} : { countsProfit }) }),
    });
    queryClient.setQueryData<Named>(['businesses'], (cached) => {
      const next = new Set(cached?.incomeSourceIds ?? []);
      if (business) next.add(incomeSourceId);
      else next.delete(incomeSourceId);
      const businesses = (cached?.businesses ?? []).filter((one) => one.id !== incomeSourceId);
      const before = cached?.businesses?.find((one) => one.id === incomeSourceId);
      if (business && before) businesses.push({ ...before, countsProfit: countsProfit ?? before.countsProfit });
      return { ready: cached?.ready ?? true, incomeSourceIds: [...next], businesses };
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
    const streams = await customFetch<Array<{ id: number; name: string }>>('/api/income-sources').catch(() => [] as Array<{ id: number; name: string }>);
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

  /** Count its profit here (a Business report), or its money only passes through. */
  const setCountsProfit = useCallback((incomeSourceId: number, countsProfit: boolean) => setBusiness(incomeSourceId, true, countsProfit), [setBusiness]);

  /**
   * "Do you pay yourself a salary from it?" (lib/businessSalary). No: its
   * profit is your income. Kept on the server, for every phone and the web.
   */
  const setPaysSalary = useCallback(async (incomeSourceId: number, paysSalary: boolean) => {
    await customFetch(`/api/businesses/${incomeSourceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business: true, paysSalary }),
    });
    queryClient.setQueryData<Named>(['businesses'], (cached) => cached && ({
      ...cached,
      businesses: (cached.businesses ?? []).map((one) => (one.id === incomeSourceId ? { ...one, paysSalary } : one)),
    }));
    refresh();
  }, [queryClient, refresh]);

  return { ready: data?.ready === true, ids, list, named: ids.size > 0, setBusiness, setCountsProfit, setPaysSalary, create };
}
