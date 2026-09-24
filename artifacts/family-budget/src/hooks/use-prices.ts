import { useQuery } from "@tanstack/react-query";
import { FALLBACK_PRICES, pricesFromPackages, type Prices } from "@/lib/pricing";

/** What Jamvi costs, read from the server so no page has its own copy. */
export function usePrices(): Prices {
  const { data } = useQuery({
    queryKey: ["subscription-prices"],
    queryFn: async () => {
      const response = await fetch("/api/subscription-plans", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load prices.");
      return pricesFromPackages((await response.json()).packages);
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return data ?? FALLBACK_PRICES;
}
