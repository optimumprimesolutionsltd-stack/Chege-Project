import { db, groupMembershipsTable, groupsTable, GROUP_PLAN } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { resolveGroupEntitlements } from "./subscription-catalog";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How many people a free workspace holds, counting the owner.
 *
 * Six covers a household — two parents and four children — while a chama is
 * typically 12 to 30 and is clearly over. Almost nobody sits between about 7
 * and 12, so the limit rarely catches anyone awkwardly.
 *
 * Read from the environment so it can be tuned once real usage is visible,
 * without a code change or a migration.
 */
export const FREE_MEMBER_LIMIT = Number(process.env.FREE_MEMBER_LIMIT ?? 6);

type EntitlementResolver = (
  groupId: number,
  tx: DbOrTransaction,
) => Promise<{ memberLimit: number | null }>;

/**
 * Whether one more person can join this workspace.
 *
 * Paid workspaces are unlimited. Free ones are capped, and the check is
 * deliberately "is there room now" rather than "is this group compliant":
 * a workspace that already exceeds the limit keeps working and simply cannot
 * grow. Nobody is ever removed by a rule introduced after they joined.
 *
 * Call inside the same transaction as the insert, so two people accepting
 * invitations at once cannot both pass the check and land the group over.
 */
export async function hasMemberCapacity(
  tx: DbOrTransaction,
  groupId: number,
  resolveEntitlements: EntitlementResolver = resolveGroupEntitlements,
): Promise<boolean> {
  const [group] = await tx
    .select({ plan: groupsTable.plan })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  // A missing group is not this function's problem to report — callers already
  // handle it, and returning true keeps the existing error path in charge.
  if (!group) return true;
  if (group.plan !== GROUP_PLAN.FREE) return true;

  const entitlements = await resolveEntitlements(groupId, tx);
  if (entitlements.memberLimit === null) return true;

  const [row] = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.groupId, groupId));

  return Number(row?.count ?? 0) < entitlements.memberLimit;
}

/** Wording shown when a workspace is full. */
export function memberLimitMessage(memberLimit = FREE_MEMBER_LIMIT): string {
  return `This Shared budget is full. Its current package supports up to ${memberLimit} members.`;
}
