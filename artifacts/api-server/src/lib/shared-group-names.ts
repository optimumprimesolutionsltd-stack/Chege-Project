import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { DbOrTransaction } from "./account-deletion";

/**
 * Two Shared groups count as the same name when they differ only in case or
 * spacing. Personal budgets are never compared: they are not listed by name.
 */
export function normalizedSharedBudgetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** The normalized names of every Shared group this person belongs to. */
export async function accessibleSharedBudgetNames(
  userId: string,
  excludedGroupId?: number,
  tx: DbOrTransaction = db,
): Promise<Set<string>> {
  const workspaces = await tx
    .select({
      id: groupsTable.id,
      name: groupsTable.name,
      privateOwnerUserId: groupsTable.privateOwnerUserId,
    })
    .from(groupMembershipsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembershipsTable.groupId))
    .where(eq(groupMembershipsTable.userId, userId));

  return new Set(
    workspaces
      .filter((workspace) => workspace.id !== excludedGroupId && !workspace.privateOwnerUserId)
      .map((workspace) => normalizedSharedBudgetName(workspace.name)),
  );
}

export async function hasAccessibleSharedBudgetWithName(
  userId: string,
  name: string,
  excludedGroupId?: number,
  tx: DbOrTransaction = db,
): Promise<boolean> {
  const names = await accessibleSharedBudgetNames(userId, excludedGroupId, tx);
  return names.has(normalizedSharedBudgetName(name));
}
