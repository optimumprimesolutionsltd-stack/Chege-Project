import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { businessStreams, businessStreamsReady, setBusinessStream } from "../lib/business-streams";
import { combineIncomeSources } from "../lib/combine-income-sources";

const router = Router();

/** This budget's businesses: the income streams marked as one (lib/business-streams). */
router.get("/businesses", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const businesses = await businessStreams(groupId);
  res.json({ ready: businessStreamsReady(), incomeSourceIds: businesses.map((business) => business.id), businesses });
});

// paysSalary: "Do you pay yourself a salary from it?" - null puts it back to not asked.
const flagSchema = z.object({ business: z.boolean(), countsProfit: z.boolean().optional(), paysSalary: z.boolean().nullable().optional() });

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
  if (!(await setBusinessStream(groupId, incomeSourceId, parsed.data.business, parsed.data.countsProfit, parsed.data.paysSalary))) {
    res.status(404).json({ error: "Income stream not found" });
    return;
  }
  res.json({
    incomeSourceId,
    business: parsed.data.business,
    ...(parsed.data.countsProfit === undefined ? {} : { countsProfit: parsed.data.countsProfit }),
    ...(parsed.data.paysSalary === undefined ? {} : { paysSalary: parsed.data.paysSalary }),
  });
});

const combineSchema = z.object({ incomeSourceId: z.number().int().positive() });

/**
 * An income stream that is this business's money (Rental income and the
 * business that collects the rent): everything under it moves to the
 * business and the stream goes (lib/combine-income-sources).
 */
router.post("/businesses/:incomeSourceId/combine", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  const intoId = Number(req.params.incomeSourceId);
  const parsed = combineSchema.safeParse(req.body);
  if (!Number.isInteger(intoId) || intoId <= 0 || !parsed.success) {
    res.status(400).json({ error: "Say which income stream to combine into this business." });
    return;
  }
  const result = await combineIncomeSources(groupId, parsed.data.incomeSourceId, intoId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, moved: result.moved });
});

export default router;
