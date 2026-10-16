import { Router } from "express";
import { correctionsLimiter } from "../middlewares/rateLimit";
import { cleanCorrections, recordCorrections } from "../lib/import-corrections";
import { logger } from "../lib/logger";

/**
 * The M-Pesa import's corrections, sent after a save (lib/import-corrections).
 * Signed in to send, but nothing about who sent them is kept.
 */
const router = Router();

router.post("/mpesa/corrections", correctionsLimiter, async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = cleanCorrections((req.body as { corrections?: unknown } | undefined)?.corrections);
  try {
    res.json({ kept: await recordCorrections(rows) });
  } catch (err) {
    // Never in the way of the person's own work.
    logger.warn({ err }, "Could not keep import corrections");
    res.json({ kept: 0 });
  }
});

export default router;
