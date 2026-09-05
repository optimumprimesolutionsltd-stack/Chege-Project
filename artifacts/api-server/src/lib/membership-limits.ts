import { db } from "@workspace/db";
import { memberMayUseSharedBudgets } from "./subscription-catalog";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Group size is no longer a billing question.
 *
 * This file used to hold hasMemberCapacity() and FREE_MEMBER_LIMIT, which
 * capped a workspace at six people unless the group held a paid plan. Jamvi is
 * now bought per member and groups cost nothing, so there is no cap to
 * enforce: a chama of fifty is fifty current members.
 *
 * What replaces it is a question about the person joining, not the room they
 * are joining.
 */

/** Whether this member's own subscription lets them take part in a Shared
 *  budget. Groups have no plan, so this is the only gate on joining one. */
export async function memberMayJoinGroups(
  userId: string,
  executor: DbOrTransaction,
): Promise<boolean> {
  return memberMayUseSharedBudgets(userId, executor);
}

/** Shown when someone whose subscription has lapsed tries to join or be added
 *  to a Shared budget. Names the person's own subscription, not the group's,
 *  so an admin is not left looking for a group setting that no longer exists. */
export function subscriptionRequiredMessage(): string {
  return "This person needs an active Jamvi subscription to join a Shared budget.";
}

/** Shown to a member already in a group whose own subscription has lapsed.
 *  Says what they can still do, because they have not lost the group or their
 *  records — only the ability to add to them. */
export function readOnlyMessage(): string {
  return "Your Jamvi subscription has lapsed, so this Shared budget is read-only. "
    + "Nothing has been removed — subscribe to start recording again.";
}
