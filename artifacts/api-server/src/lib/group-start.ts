import { resolveMemberEntitlements } from "./subscription-catalog";

/**
 * Starting a new Shared group needs the person's own trial or subscription to
 * be active. A group started after it ends would be read-only to them from its
 * first minute (requireTransactionEligibility in lib/activeGroup.ts), so it is
 * refused at the door with a way forward instead. No subscription row at all
 * (an account from before subscriptions) is let through, as it is for
 * recording. The apps hide "New group" by the same rule (lib/groupStart.ts).
 */
export const START_GROUP_NEEDS_SUBSCRIPTION =
  "Starting a new group needs an active Jamvi subscription. Your groups and records are all still here - subscribe to start a new one.";

/** The refusal to send, or null when the person may start a group. */
export function startGroupRefusal(entitlements: { fullAccess: boolean; status: string | null }): string | null {
  return entitlements.fullAccess || entitlements.status === null ? null : START_GROUP_NEEDS_SUBSCRIPTION;
}

export async function refuseStartingGroup(userId: string): Promise<string | null> {
  return startGroupRefusal(await resolveMemberEntitlements(userId));
}
