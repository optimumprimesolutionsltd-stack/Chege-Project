import { getGetDashboardBusinessQueryKey, useGetDashboardBusiness } from '@workspace/api-client-react';

/**
 * Whether this budget runs a side hustle: an income stream with a cost linked
 * to it. A plain household budget has none, and is not shown the Business
 * screen's way in. Linked streams are listed whether or not they sold anything
 * this month, so this holds steady from one month to the next.
 */
export function useHasBusiness(): boolean {
  const { data } = useGetDashboardBusiness(undefined, {
    query: { queryKey: getGetDashboardBusinessQueryKey(), staleTime: 5 * 60 * 1000 },
  });
  return (data?.businesses?.length ?? 0) > 0;
}
