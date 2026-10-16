import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, groupMembershipsTable, groupsTable } from "@workspace/db";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import {
  cleanLineNumber,
  GROUP_MPESA_SOURCES,
  groupMpesaSource,
  groupMpesaSourceReady,
  setGroupMpesaSource,
} from "../lib/group-mpesa-source";

/** Which M-Pesa a shared group uses (lib/group-mpesa-source). */
const router = Router();

router.get("/group/mpesa-source", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: groupMpesaSourceReady(), ...(await groupMpesaSource(groupId)) });
});

const sourceSchema = z.object({
  source: z.enum(GROUP_MPESA_SOURCES),
  lineNumber: z.string().max(40).nullable().optional(),
  treasurerUserId: z.string().min(1).nullable().optional(),
});

router.put("/group/mpesa-source", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!groupMpesaSourceReady()) {
    res.status(503).json({ error: "This cannot be set yet. Try again in a minute." });
    return;
  }
  const [group] = await db.select({ privateOwner: groupsTable.privateOwnerUserId }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
  if (!group || group.privateOwner !== null) {
    res.status(400).json({ error: "A Personal budget's M-Pesa is always your own." });
    return;
  }
  const parsed = sourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Say which M-Pesa this group uses." });
    return;
  }
  const { source } = parsed.data;
  // Only the treasurer's line names a member, and it must be one of this group's.
  let treasurerUserId: string | null = null;
  if (source === "treasurer_line") {
    treasurerUserId = parsed.data.treasurerUserId ?? req.user!.id;
    const [member] = await db
      .select({ userId: groupMembershipsTable.userId })
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.userId, treasurerUserId)))
      .limit(1);
    if (!member) {
      res.status(400).json({ error: "The treasurer must be a member of this group." });
      return;
    }
  }
  const lineNumber = source === "bank" || source === "none" ? null : cleanLineNumber(parsed.data.lineNumber);
  await setGroupMpesaSource(groupId, { source, lineNumber, treasurerUserId });
  res.json({ ready: true, source, lineNumber, treasurerUserId });
});

export default router;
