import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetGroup } from '@workspace/api-client-react';
import { namedFor, namedPayeesKey, parseNamedPayees, ruleKeysFor, withNamed, withoutNamed, type NamedPayee } from '@/lib/namedPayees';
import { parseStoredRules, rulesStorageKey, withoutRule } from '@/lib/payeeLearning';
import { saveRules } from '@/lib/rulesStore';

/** Names for outside accounts you pay often (lib/namedPayees), kept per budget on this device. */
export function useNamedPayees() {
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const storageKey = namedPayeesKey(group?.id);
  const rulesKey = rulesStorageKey(group?.id);
  const { data: named = [] } = useQuery<NamedPayee[]>({
    queryKey: ['named-payees', storageKey],
    queryFn: async () => parseNamedPayees(await AsyncStorage.getItem(storageKey).catch(() => null)),
    enabled: group?.id != null,
    staleTime: Infinity,
  });

  const store = useCallback(async (next: NamedPayee[]) => {
    queryClient.setQueryData(['named-payees', storageKey], next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  }, [queryClient, storageKey]);

  /** Named, and - with a category - filed there by the next import (payee rules). */
  const add = useCallback(async (entry: NamedPayee) => {
    await store(withNamed(named, entry));
    const rules = parseStoredRules(await AsyncStorage.getItem(rulesKey).catch(() => null));
    const next = { ...rules };
    for (const key of ruleKeysFor(entry.key)) {
      if (entry.category) next[key] = entry.category;
      else delete next[key];
    }
    await saveRules(group?.id, next, rules);
  }, [group?.id, named, rulesKey, store]);

  const remove = useCallback(async (key: string) => {
    await store(withoutNamed(named, key));
    const before = parseStoredRules(await AsyncStorage.getItem(rulesKey).catch(() => null));
    let rules = before;
    for (const ruleKey of ruleKeysFor(key)) rules = withoutRule(rules, ruleKey);
    await saveRules(group?.id, rules, before);
  }, [group?.id, named, rulesKey, store]);

  const nameFor = useCallback((description: string | null | undefined) => namedFor(description, named)?.name ?? null, [named]);

  /**
   * Keeps the whole list as given, names only: for a screen that writes the
   * payee rules itself in one go (the M-Pesa import), so neither write loses the other's.
   */
  const replaceAll = store;

  return { named, add, remove, nameFor, replaceAll };
}
