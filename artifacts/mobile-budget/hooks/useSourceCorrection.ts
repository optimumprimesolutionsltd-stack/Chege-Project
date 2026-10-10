import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetGroup, useGetIncomeSources } from '@workspace/api-client-react';
import { useBusinesses } from '@/hooks/useBusinesses';
import { parseStoredRules, payeeName, rulesStorageKey } from '@/lib/payeeLearning';
import { saveRules } from '@/lib/rulesStore';
import { clashOf, clashText, keptFromNowOn, type EarlierMoneyIn } from '@/lib/sourceClash';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

/**
 * After money in is put under an income source: if that goes against what Jamvi
 * was told before (lib/sourceClash), ask once - "From now on" changes the rule
 * and every earlier payment from the payer, "Just this once" nothing else.
 * Never in the way: a failure to check is silent.
 */
export function useSourceCorrection() {
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const { data: sources = [] } = useGetIncomeSources();
  const businesses = useBusinesses();

  return async (entry: { id?: number; description: string; amount: number }, chosenId: number, leaveOut: readonly number[] = []) => {
    const groupId = group?.id;
    if (groupId == null || !entry.description?.trim()) return;
    try {
      const rules = parseStoredRules(await AsyncStorage.getItem(rulesStorageKey(groupId)).catch(() => null));
      const { entries: earlier } = await customFetch<{ entries: EarlierMoneyIn[] }>('/api/payer-money-in/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: entry.description }),
      });
      const clash = clashOf(entry, chosenId, rules, earlier, new Set(leaveOut));
      if (!clash) return;
      const named = new Map((sources as Array<{ id: number; name: string }>).map((one) => [one.id, one.name]));
      const businessIds = new Set(businesses.list.map((one) => one.id));
      const label = payeeName(entry.description.replace(/^Received from\s+/i, '')) || entry.description;
      const { title, message } = clashText(label, clash, (id) => named.get(id) ?? 'another source', chosenId, (id) => businessIds.has(id));
      const fromNowOn = async () => {
        await saveRules(groupId, keptFromNowOn(rules, entry.description, clash, chosenId), rules);
        if (clash.others.length === 0) return;
        await customFetch('/api/payer-money-in/refile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: clash.others.map((one) => one.id), incomeSourceId: chosenId }),
        });
        void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });
        for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
      };
      Alert.alert(title, message, [
        { text: 'Just this once', style: 'cancel' },
        {
          text: 'From now on',
          onPress: () => void fromNowOn().catch((error: unknown) =>
            Alert.alert('Could not change them all', error instanceof Error ? error.message : 'Try again in a moment.')),
        },
      ]);
    } catch {
      // Checking is a courtesy: never in the way of the save it follows.
    }
  };
}
