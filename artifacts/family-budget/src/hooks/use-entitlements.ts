import { useQuery } from "@tanstack/react-query";
import type { MemberEntitlements } from "@/lib/subscription-status";

/**
 * The person's own subscription, as the Subscription page reads it.
 *
 * One reader for the ["member-entitlements"] cache. The menu used to keep the
 * raw `{ member }` reply under that key while the Subscription page and the
 * plan gate kept `member` itself, so whichever loaded first decided what the
 * others saw - and the menu's "days left" read a field one level too high.
 */
export function useEntitlements() {
  return useQuery<MemberEntitlements>({
    queryKey: ["member-entitlements"],
    queryFn: async () => {
      const response = await fetch("/api/subscription-plans/entitlements", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your subscription.");
      return (await response.json()).member as MemberEntitlements;
    },
    retry: false,
    staleTime: 60_000,
  });
}
