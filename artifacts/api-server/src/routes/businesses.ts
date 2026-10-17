import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { businessStreams, businessStreamsReady, cleanEarnsFrom, EARNS_FROM_MAX, setBusinessStream } from "../lib/business-streams";
import { findOrMakeSalaryStream, foldDuplicateSalaryStreams } from "../lib/salary-streams";
import { combineIncomeSources } from "../lib/combine-income-sources";

const router = Router();

/** This budget's businesses: the income streams marked as one (lib/business-streams). */
router.get("/businesses", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const businesses = await businessStreams(groupId);
  // Two salary streams for one business, from before it looked for yours by more than its exact name: one again.
  await foldDuplicateSalaryStreams(groupId).catch(() => 0);
  // Each business that pays a salary has its salary stream to file pay under -
  // businesses answered before the stream was made get it here - and says which
  // it is, so Money in can offer "Salary from Ujenzi" ("in money in, why cant i
  // see the option of salary?", 16 Oct 2026).
  const withSalary = await Promise.all(businesses.map(async (business) => ({
    ...business,
    salaryStreamId: business.paysSalary === true ? (await findOrMakeSalaryStream(groupId, business.id).catch(() => null))?.id ?? null : null,
  })));
  res.json({ ready: businessStreamsReady(), incomeSourceIds: businesses.map((business) => business.id), businesses: withSalary });
});

// paysSalary: "Do you pay yourself a salary from it?" - null puts it back to not asked.
// earnsFrom: its money in is sales, rent (rental income), or the person's own words.
const flagSchema = z.object({ business: z.boolean(), countsProfit: z.boolean().optional(), paysSalary: z.boolean().nullable().optional(), earnsFrom: z.string().trim().min(1).max(EARNS_FROM_MAX).transform(cleanEarnsFrom).optional() });

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
  if (!(await setBusinessStream(groupId, incomeSourceId, parsed.data.business, parsed.data.countsProfit, parsed.data.paysSalary, parsed.data.earnsFrom))) {
    res.status(404).json({ error: "Income stream not found" });
    return;
  }
  // Pays you a salary: its salary stream is there to file your pay under.
  const salaryStream = parsed.data.business && parsed.data.paysSalary === true ? await findOrMakeSalaryStream(groupId, incomeSourceId) : null;
  res.json({
    ...(salaryStream ? { salaryStream } : {}),
    incomeSourceId,
    business: parsed.data.business,
    ...(parsed.data.countsProfit === undefined ? {} : { countsProfit: parsed.data.countsProfit }),
    ...(parsed.data.paysSalary === undefined ? {} : { paysSalary: parsed.data.paysSalary }),
    ...(parsed.data.earnsFrom === undefined ? {} : { earnsFrom: parsed.data.earnsFrom }),
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
