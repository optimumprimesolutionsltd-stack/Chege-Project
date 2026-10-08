import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { markOwnerBusiness, ownerBusinessIds, ownerBusinessReady, unmarkOwnerBusiness } from "../lib/owner-business";

const router = Router();

/** The entries of this budget marked as money between the owner and their business (lib/owner-business). */
router.get("/owner-business", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: ownerBusinessReady(), transactionIds: await ownerBusinessIds(groupId) });
});

const markSchema = z.object({ transactionIds: z.array(z.number().int().positive()).min(1).max(5000) });

/** Mark entries as owner's drawings (money in) or money put into the business (money out). */
router.post("/owner-business", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!ownerBusinessReady()) {
    res.status(503).json({ error: "Money to and from your business cannot be marked yet. Try again in a minute." });
    return;
  }
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send the entries to mark." });
    return;
  }
  res.json({ marked: await markOwnerBusiness(groupId, parsed.data.transactionIds) });
});

/** Not business money after all: back on the list to sort out. */
router.delete("/owner-business/:transactionId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const id = Number(req.params.transactionId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Which entry?" });
    return;
  }
  const removed = await unmarkOwnerBusiness(groupId, id);
  res.status(removed ? 204 : 404).end();
});

export default router;
