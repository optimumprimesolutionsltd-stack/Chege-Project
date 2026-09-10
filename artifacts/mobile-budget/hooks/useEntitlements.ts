import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import type { MemberEntitlements } from '@/lib/subscription-status';

export const MEMBER_ENTITLEMENTS_KEY = ['member-entitlements'] as const;

/**
 * Where this member stands with their Jamvi subscription — trial, active,
 * past-due, or lapsed. Drives the banner and the Subscription screen.
 */
export function useEntitlements() {
  return useQuery<MemberEntitlements>({
    queryKey: MEMBER_ENTITLEMENTS_KEY,
    queryFn: async () => {
      const body = await customFetch<{ member: MemberEntitlements }>(
        '/api/subscription-plans/entitlements',
      );
      return body.member;
    },
    staleTime: 60_000,
    retry: false,
  });
}
