import { ACTIVE_WORKSPACE_STORAGE_KEY } from './workspace';

/**
 * Turning a Personal budget into a Shared group and back, and removing an
 * unused Personal budget. The server does the work in place (nothing copied,
 * nothing lost - see api-server lib/workspace-conversion.ts); this file holds
 * when each option is offered, what the confirmations say, and how the phone
 * moves to the right budget afterwards.
 */

export type PersonalBudgetStatus = { exists: boolean; empty: boolean; id?: number | null };

export const PERSONAL_STATUS_QUERY_KEY = ['personal-budget-status'] as const;

export const MAKE_SHARED_WARNING =
  'Everyone you invite will see everything in this budget, including past entries.';

export function makeSharedConfirmation(name: string): { title: string; message: string } {
  return {
    title: `Turn your Personal budget into "${name}"?`,
    message:
      `${MAKE_SHARED_WARNING}\n\nEverything recorded stays exactly where it is. Afterwards you won't have a Personal budget - you can create a new one any time.`,
  };
}

/**
 * A Shared group can become its owner's Personal budget only while they are
 * its only member - a viewer counts, because they would lose access too.
 */
export function canMakeGroupPersonal({
  group,
  members,
  userId,
}: {
  group: { isPrivate: boolean } | null | undefined;
  members: ReadonlyArray<{ userId: string; role: string }>;
  userId: string | null | undefined;
}): boolean {
  if (!group || group.isPrivate || !userId) return false;
  return members.length === 1 && members[0].userId === userId && members[0].role === 'owner';
}

/** The swap, spelled out: what happens to the Personal budget they already have. */
export function makePersonalConfirmation(
  groupName: string,
  status: PersonalBudgetStatus | null | undefined,
): { title: string; message: string } {
  const existing = !status?.exists
    ? 'You don\'t have a Personal budget now, so nothing else changes.'
    : status.empty
      ? 'Your current Personal budget has nothing recorded in it, so it will be removed.'
      : 'Your current Personal budget has records in it, so it will be kept as a Shared group called "Old personal budget" - nothing in it is deleted.';
  return {
    title: `Make "${groupName}" your Personal budget?`,
    message:
      `Everything in "${groupName}" stays exactly as it is, and only you will see it. Pending invitations and links to it stop working.\n\n${existing}\n\nYou can turn it back into a Shared group later.`,
  };
}

/** Offered only while the Personal budget is unused - removing it loses nothing. */
export function canRemovePersonalBudget(status: PersonalBudgetStatus | null | undefined): boolean {
  return Boolean(status?.exists && status.empty);
}

export const REMOVE_PERSONAL_CONFIRMATION = {
  title: 'Remove your unused Personal budget?',
  message:
    'Nothing has been recorded in it, so nothing is lost. You can create a new Personal budget any time from your budgets list.',
};

type Storage = {
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

/**
 * After a conversion or removal: point the phone at the right budget (or at
 * none, so the chooser decides), and drop every cached answer. Cached data
 * still says whether the old budget was Personal - the tab bar, Contributions,
 * members and "My"/"Group" labels all read it - so it must go, persisted copy
 * included, before anything renders again.
 */
export async function settleAfterConversion({
  groupId,
  storage,
  clearPersistedCache,
  resetQueries,
}: {
  groupId: number | null;
  storage: Storage;
  clearPersistedCache: () => Promise<unknown>;
  resetQueries: () => Promise<unknown> | unknown;
}): Promise<void> {
  if (groupId === null) await storage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  else await storage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));
  await clearPersistedCache();
  await resetQueries();
}
