import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { FALLBACK_PRICES, pricesFromPackages, type Prices } from '@/lib/pricing';

/** What Jamvi costs, read from the server so no screen has its own copy. */
export function usePrices(): Prices {
  const { data } = useQuery({
    queryKey: ['subscription-prices'],
    queryFn: async () => pricesFromPackages((await customFetch<{ packages: unknown }>('/api/subscription-plans')).packages),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return data ?? FALLBACK_PRICES;
}
