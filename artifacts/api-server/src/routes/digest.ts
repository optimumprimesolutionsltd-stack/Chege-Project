import { Router } from "express";
import { sendMonthlyDigest, previousMonth } from "../lib/digest";
import { logger } from "../lib/logger";
import { z } from "zod";
import { getActiveGroupId } from "../lib/activeGroup";

const router = Router();

/**
 * POST /api/digest/send
 * Manually trigger the monthly digest (authenticated members only).
 * Body (optional): { month: number, year: number }
 * Omit body to default to the previous calendar month.
 * The group is resolved from the authenticated session — never from client input.
 */
router.post("/digest/send", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;

  const bodySchema = z.object({
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    /** Pass force:true to resend even if a digest was already sent this month */
    force: z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const prev = previousMonth();
  const month = parsed.data.month ?? prev.month;
  const year = parsed.data.year ?? prev.year;

  try {
    const result = await sendMonthlyDigest(month, year, { force: parsed.data.force, groupId });
    res.json({ ok: true, emailId: result.id, to: result.to, skipped: result.skipped, month, year });
  } catch (err) {
    logger.error({ err }, "Failed to send digest");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
