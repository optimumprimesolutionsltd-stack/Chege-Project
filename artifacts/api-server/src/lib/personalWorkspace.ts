import {
  db,
  GROUP_KIND,
  GROUP_PLAN,
  groupMembershipsTable,
  groupsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Every Jamvi login identity owns one free Personal budget. The unique
 * privateOwnerUserId constraint makes this safe to call from onboarding,
 * workspace discovery, and Shared budget creation paths.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx
      .insert(groupsTable)
      .values({
        name: "Personal budget",
        kind: GROUP_KIND.PERSONAL,
        plan: GROUP_PLAN.FREE,
        privateOwnerUserId: userId,
        createdByUserId: userId,
      })
      .onConflictDoNothing();

    const [workspace] = await tx
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.privateOwnerUserId, userId))
      .limit(1);
    if (!workspace) throw new Error("Could not establish the free Personal budget.");

    await tx
      .insert(groupMembershipsTable)
      .values({
        groupId: workspace.id,
        userId,
        role: "owner",
        addedByUserId: userId,
      })
      .onConflictDoNothing();

    return workspace.id;
  });
}