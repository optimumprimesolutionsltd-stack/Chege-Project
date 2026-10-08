import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { businessStreamIds, businessStreamsReady, setBusinessStream } from "../lib/business-streams";

const router = Router();

/** This budget's businesses: the income streams marked as one (lib/business-streams). */
router.get("/businesses", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: businessStreamsReady(), incomeSourceIds: await businessStreamIds(groupId) });
});

const flagSchema = z.object({ business: z.boolean() });

/** A business, or back to an ordinary income stream. */
router.put("/businesses/:incomeSourceId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!businessStreamsReady()) {
    res.status(503).json({ error: "Businesses cannot be set yet. Try again in a minute." });
    return;
  }
  const incomeSourceId = Number(req.params.incomeSourceId);
  const parsed = flagSchema.safeParse(req.body);
  if (!Number.isInteger(incomeSourceId) || incomeSourceId <= 0 || !parsed.success) {
    res.status(400).json({ error: "Say whether it is a business." });
    return;
  }
  if (!(await setBusinessStream(groupId, incomeSourceId, parsed.data.business))) {
    res.status(404).json({ error: "Income stream not found" });
    return;
  }
  res.json({ incomeSourceId, business: parsed.data.business });
});

export default router;
