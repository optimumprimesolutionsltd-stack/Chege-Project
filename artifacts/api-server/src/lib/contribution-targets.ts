import { db, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The contribution target a person inherits when they join a workspace.
 *
 * A chama sets one figure when the workspace is created and everyone who
 * joins is held to it. Without this, every member's monthlyTarget stayed null
 * and the target-versus-contributed comparison on the dashboard and in the
 * monthly digest was permanently blank — the data was displayed but never
 * populated.
 *
 * Returns null for groups that do not work to a fixed amount, which is most
 * families and any one-off group. A null target is not a failure; it means the
 * comparison simply does not apply.
 *
 * Call inside the same transaction as the membership insert.
 */
export async function inheritedMonthlyTarget(
  tx: DbOrTransaction,
  groupId: number,
): Promise<number | null> {
  const [group] = await tx
    .select({ defaultMonthlyTarget: groupsTable.defaultMonthlyTarget })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  return group?.defaultMonthlyTarget ?? null;
}
