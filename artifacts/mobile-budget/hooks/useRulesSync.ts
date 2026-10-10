import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useGetGroup } from '@workspace/api-client-react';
import { syncKnowledge } from '@/lib/knowledgeStore';
import { syncRules } from '@/lib/rulesStore';

/**
 * Keeps this phone's payee rules (lib/rulesStore) and the rest of what the
 * budget taught Jamvi (lib/knowledgeStore) in step with the server: when Jamvi
 * opens, when the budget changes, and when Jamvi comes back to the front. Runs
 * from the root layout once someone is signed in.
 */
export function useRulesSync(enabled: boolean) {
  const { data: group } = useGetGroup({ query: { enabled } } as never);
  const groupId = enabled ? group?.id : undefined;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (groupId == null) return undefined;
    // Screens holding Named accounts or your business's numbers read them again.
    const sync = () => {
      void syncRules(groupId);
      void syncKnowledge(groupId).then((synced) => {
        if (!synced) return;
        void queryClient.invalidateQueries({ queryKey: ['named-payees'] });
        void queryClient.invalidateQueries({ queryKey: ['owner-business-rule'] });
      });
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [groupId, queryClient]);
}
