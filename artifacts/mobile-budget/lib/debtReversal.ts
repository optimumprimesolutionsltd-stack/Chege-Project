import { Alert } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

import { reversalChanges, type DebtEntryLink, type DeletedEntry } from '@/lib/debtLinks';
import type { DebtCategoryLite, PartyLite } from '@/lib/mpesaDebts';

/** Which people some entries were for, asked before they are deleted. Empty on any trouble: it is only a convenience. */
export async function fetchDebtLinks(ids: number[]): Promise<DebtEntryLink[]> {
  if (ids.length === 0) return [];
  try {
    const body = await customFetch<{ links: DebtEntryLink[] }>(`/api/debt-links?ids=${ids.join(',')}`);
    return body.links ?? [];
  } catch {
    return [];
  }
}

/** Records who each debt entry was for, right after saving. Never gets in the way of saving. */
export async function saveDebtLinks(links: DebtEntryLink[]): Promise<void> {
  if (links.length === 0) return;
  try {
    await customFetch('/api/debt-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links }),
    });
  } catch {
    // The entries are saved either way; only the offer to reverse them later is lost.
  }
}

/**
 * After deleting entries: offer to put back the balances they moved.
 * Asked, never applied by itself. Current balances are read fresh, so the offer is
 * measured from what the balance is now.
 */
export async function offerDebtReversal(entries: DeletedEntry[], links: DebtEntryLink[], queryClient: QueryClient): Promise<void> {
  if (entries.length === 0) return;
  let changes;
  try {
    const [parties, categories] = await Promise.all([
      customFetch<PartyLite[]>('/api/contributors'),
      customFetch<Array<DebtCategoryLite>>('/api/budget-categories'),
    ]);
    changes = reversalChanges(entries, links, parties, categories);
  } catch {
    return;
  }
  if (changes.length === 0) return;
  Alert.alert(
    changes.length === 1 ? 'Put this balance back?' : `Put ${changes.length} balances back?`,
    `If you updated ${changes.length === 1 ? 'it' : 'them'} when you saved what you deleted:\n\n${changes.map((change) => `· ${change.label}`).join('\n')}`,
    [
      { text: 'Leave as it is', style: 'cancel' },
      {
        text: 'Put back',
        onPress: async () => {
          try {
            for (const change of changes) {
              await customFetch(change.endpoint, {
                method: change.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(change.body),
              });
            }
            await queryClient.invalidateQueries();
          } catch (error: unknown) {
            Alert.alert('Some balances did not change', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ],
  );
}
