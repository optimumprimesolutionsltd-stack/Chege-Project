/**
 * Who may start a new Shared group: somebody whose own trial or subscription
 * is active.
 *
 * A group started by somebody whose subscription has ended would open
 * read-only to them - they could not record a thing in it - so the way in is
 * only shown, and the server only accepts it, while they are active. Having no
 * subscription row at all (an account from before subscriptions) counts as
 * active, as it does for recording (api-server lib/activeGroup.ts).
 *
 * Shared with the web (sync-web-twins.py).
 */
export type StartGroupEntitlements = { fullAccess: boolean; status: string | null } | null | undefined;

/** Whether the "New group" way in should show. Unknown (still loading) is no. */
export function mayStartGroup(entitlements: StartGroupEntitlements): boolean {
  if (!entitlements) return false;
  return entitlements.fullAccess || entitlements.status === null;
}

export const START_GROUP_NEEDS_SUBSCRIPTION =
  'Starting a new group needs an active Jamvi subscription. Your groups and records are all still here - subscribe to start a new one.';
