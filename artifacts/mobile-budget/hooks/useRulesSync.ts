import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useGetGroup } from '@workspace/api-client-react';
import { syncRules } from '@/lib/rulesStore';

/**
 * Keeps this phone's payee rules in step with the budget's on the server
 * (lib/rulesStore): when Jamvi opens, when the budget changes, and when Jamvi
 * comes back to the front. Runs from the root layout once someone is signed in.
 */
export function useRulesSync(enabled: boolean) {
  const { data: group } = useGetGroup({ query: { enabled } } as never);
  const groupId = enabled ? group?.id : undefined;
  useEffect(() => {
    if (groupId == null) return undefined;
    void syncRules(groupId);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncRules(groupId);
    });
    return () => subscription.remove();
  }, [groupId]);
}
