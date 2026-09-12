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
 *  to a Shared group. Names the person's own subscription, not the group's,
 *  so an admin is not left looking for a group setting that no longer exists. */
export function subscriptionRequiredMessage(): string {
  return "This person needs an active Jamvi subscription to join a Shared group.";
}

/**
 * Shown to a manager whose own subscription has lapsed when they try to bring
 * somebody new in.
 *
 * Separate from readOnlyMessage() because the remedy reads differently: this
 * is not about the records they can no longer add to, it is about the person
 * they were trying to invite, who would have been refused at the door anyway.
 */
export function inviteRequiresSubscriptionMessage(): string {
  return "Your Jamvi subscription has lapsed, so you cannot invite anyone to this group. "
    + "Nothing has been removed — subscribe to start inviting again.";
}

/** Shown to a member whose own subscription has lapsed, in either a Shared
 *  group or their own Personal budget. Says what they can still do, because
 *  they have not lost the budget or their records — only the ability to add
 *  to them. */
export function readOnlyMessage(isPrivate: boolean): string {
  return isPrivate
    ? "Your Jamvi subscription has lapsed, so your Personal budget is read-only. "
      + "Nothing has been removed — subscribe to start recording again."
    : "Your Jamvi subscription has lapsed, so this Shared group is read-only. "
      + "Nothing has been removed — subscribe to start recording again.";
}
