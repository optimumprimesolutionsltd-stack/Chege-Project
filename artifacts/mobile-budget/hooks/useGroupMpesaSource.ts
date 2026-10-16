import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import type { GroupMpesaSource } from '@/lib/groupMpesa';

/**
 * The open budget's M-Pesa source (lib/groupMpesa): asked of a shared group
 * only. A Personal budget never asks - its M-Pesa is the person's own.
 */
export function useGroupMpesaSource() {
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const shared = group?.isPrivate === false;
  const { data, isLoading } = useQuery<GroupMpesaSource & { ready?: boolean }>({
    queryKey: ['group-mpesa-source', group?.id ?? null],
    queryFn: () => customFetch('/api/group/mpesa-source'),
    enabled: shared,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const save = useCallback(async (value: { source: GroupMpesaSource['source']; lineNumber?: string | null; treasurerUserId?: string | null }) => {
    const saved = await customFetch<GroupMpesaSource>('/api/group/mpesa-source', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    queryClient.setQueryData(['group-mpesa-source', group?.id ?? null], { ready: true, ...saved });
    // What counts as new messages changes with it.
    void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });
    return saved;
  }, [group?.id, queryClient]);
  return {
    group,
    shared,
    source: shared ? data ?? null : null,
    // Asked once: only when the server can keep the answer and nobody has given it.
    unanswered: shared && !isLoading && data?.ready === true && data.source === null,
    save,
  };
}
