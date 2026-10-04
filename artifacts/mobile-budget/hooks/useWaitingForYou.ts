import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import type { EntryToSort } from '@/lib/entriesToSort';
import { canReadSms, newMpesaSms, parseSmsAuto, smsAutoKey } from '@/lib/mpesaSms';

/**
 * What is waiting for the person: entries saved as "Not sure" (any month), and
 * new M-Pesa messages since Jamvi last took them in (when they turned that on).
 *
 * "These two can easily be forgotten, yet they are the most important in the
 * app" (3 Oct 2026): so they lead Home, and their total is a badge on the Home
 * tab, seen from every screen. One hook, so the cards and the badge never
 * disagree.
 */
export function useWaitingForYou() {
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const toSort = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ['entries-to-sort'],
    queryFn: () => customFetch('/api/entries-to-sort'),
    staleTime: 60_000,
    retry: false,
  });
  const newSms = useQuery<number>({
    queryKey: ['new-mpesa-sms', user?.id],
    queryFn: async () => {
      const auto = parseSmsAuto(await AsyncStorage.getItem(smsAutoKey(user?.id)).catch(() => null));
      if (!auto.on) return 0;
      return (await newMpesaSms(auto.since))?.messages.length ?? 0;
    },
    enabled: canReadSms(),
    staleTime: 30_000,
    retry: false,
  });
  const toSortCount = toSort.data?.entries.length ?? 0;
  const newSmsCount = newSms.data ?? 0;
  const total = waitingTotal({ toSortCount, newSmsCount, canAct: canActOnWaiting(group) });
  return { toSortCount, newSmsCount, total, recheckSms: newSms.refetch };
}

/**
 * Who sees the cards on Home, and so who the badge counts for: anyone in their
 * Personal budget, and a group's owner or admins. A badge with no card behind
 * it is a number nobody can do anything about.
 */
export function canActOnWaiting(group: { isPrivate: boolean; role?: string | null } | null | undefined): boolean {
  if (!group) return false;
  return group.isPrivate || group.role === 'owner' || group.role === 'admin';
}

export function waitingTotal({ toSortCount, newSmsCount, canAct }: { toSortCount: number; newSmsCount: number; canAct: boolean }): number {
  return canAct ? toSortCount + newSmsCount : 0;
}

/** The badge: a number, "99+" past that, nothing at none. */
export const waitingBadge = (total: number): string | undefined => (total <= 0 ? undefined : total > 99 ? '99+' : String(total));
