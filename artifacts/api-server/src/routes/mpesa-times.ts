import { Router } from "express";
import { getActiveGroupId } from "../lib/activeGroup";
import { cleanTimes, keepMpesaTimes } from "../lib/mpesa-times";
import { logger } from "../lib/logger";

/** The time of day on M-Pesa entries, by receipt (lib/mpesa-times). */
const router = Router();

router.post("/mpesa/times", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const times = cleanTimes((req.body as { times?: unknown } | undefined)?.times);
  try {
    res.json({ filled: await keepMpesaTimes(groupId, times) });
  } catch (err) {
    // A time is a nicety: never in the way of the person's own work.
    logger.warn({ err, groupId }, "Could not keep M-Pesa times");
    res.json({ filled: 0 });
  }
});

export default router;
