/**
 * Turning a Personal budget into a Shared group and back, and removing an
 * unused Personal budget. The server does the work in place - nothing copied,
 * nothing lost (api-server lib/workspace-conversion.ts). This file holds when
 * each option is offered, what the confirmations say, and the calls.
 *
 * The same rules and wording as the phone's lib/budgetConversion.ts.
 */

export type PersonalBudgetStatus = { exists: boolean; empty: boolean; id?: number | null };

export const PERSONAL_STATUS_QUERY_KEY = ["personal-budget-status"] as const;

export const MAKE_SHARED_WARNING =
  "Everyone you invite will see everything in this budget, including past entries.";

export function makeSharedConfirmation(name: string): { title: string; message: string } {
  return {
    title: `Turn your Personal budget into "${name}"?`,
    message: `${MAKE_SHARED_WARNING} Everything recorded stays exactly where it is. Afterwards you won't have a Personal budget - you can create a new one any time.`,
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
  members: ReadonlyArray<{ userId: string; role: string }> | null | undefined;
  userId: string | null | undefined;
}): boolean {
  if (!group || group.isPrivate || !userId || !members) return false;
  return members.length === 1 && members[0].userId === userId && members[0].role === "owner";
}

/** The swap, spelled out: what happens to the Personal budget they already have. */
export function makePersonalConfirmation(
  groupName: string,
  status: PersonalBudgetStatus | null | undefined,
): { title: string; message: string } {
  const existing = !status?.exists
    ? "You don't have a Personal budget now, so nothing else changes."
    : status.empty
      ? "Your current Personal budget has nothing recorded in it, so it will be removed."
      : 'Your current Personal budget has records in it, so it will be kept as a Shared group called "Old personal budget" - nothing in it is deleted.';
  return {
    title: `Make "${groupName}" your Personal budget?`,
    message: `Everything in "${groupName}" stays exactly as it is, and only you will see it. Pending invitations and links to it stop working. ${existing} You can turn it back into a Shared group later.`,
  };
}

/** Offered only while the Personal budget is unused - removing it loses nothing. */
export function canRemovePersonalBudget(status: PersonalBudgetStatus | null | undefined): boolean {
  return Boolean(status?.exists && status.empty);
}

export const REMOVE_PERSONAL_CONFIRMATION = {
  title: "Remove your unused Personal budget?",
  message:
    "Nothing has been recorded in it, so nothing is lost. You can create a new Personal budget any time from My budget & groups.",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong. Please try again.");
  return body as T;
}

export const fetchPersonalBudgetStatus = () =>
  requestJson<PersonalBudgetStatus>("/api/workspaces/personal/status");

export const makePersonalBudgetShared = (name: string, kind: string) =>
  requestJson<{ id: number; name: string }>("/api/workspaces/personal/make-shared", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, kind }),
  });

export const makeGroupPersonal = (groupId: number) =>
  requestJson<{ id: number; previousPersonal: { outcome: string; name?: string } | null }>(
    `/api/workspaces/${groupId}/make-personal`,
    { method: "POST" },
  );

export const removeUnusedPersonalBudget = () =>
  requestJson<{ removed: boolean; id: number }>("/api/workspaces/personal", { method: "DELETE" });
