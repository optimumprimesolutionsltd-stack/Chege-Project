import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId } from "../lib/activeGroup";
import { getSessionId } from "../lib/auth";
import { logger } from "../lib/logger";
import { createJob, importSaveJobsReady, readJob, runJob, type JobItem } from "../lib/import-save-jobs";

/**
 * An M-Pesa import saved on the server (lib/import-save-jobs). Kept apart from
 * routes/mpesa-import, which reads messages and must never know who sent them;
 * a save belongs to the person who started it.
 */
const router = Router();

/** One line as the phone worked it out (lib/mpesaImport's buildPostings). */
const builtSchema = z.object({
  kind: z.enum(["deposit", "disbursement", "savings", "transfer", "other-budget"]),
  main: z.record(z.string(), z.unknown()),
  fee: z.record(z.string(), z.unknown()).nullish(),
  direction: z.enum(["in", "out"]).optional(),
  groupId: z.number().int().positive().optional(),
}).passthrough();

const saveJobSchema = z.object({
  mpesaAccountId: z.number().int().positive(),
  items: z.array(z.object({
    key: z.number().int().nonnegative(),
    built: builtSchema,
    debt: z.object({ partyId: z.number().int().positive(), kind: z.enum(["borrowed", "pay-back", "lend", "repaid"]) }).optional(),
  })).min(1).max(5_000),
});

/**
 * Saves a whole import on the server (lib/import-save-jobs), so it carries on
 * when the phone closes Jamvi. Each entry goes through the ordinary save
 * routes as this person, so nothing here can do more than they could.
 * Answers at once with the job, for the phone to ask how it is going.
 */
router.post("/mpesa/import/save-jobs", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  // The phone saves the old way until the table is there.
  if (!importSaveJobsReady()) {
    res.status(503).json({ error: "Saving on the server is not ready yet." });
    return;
  }
  const sessionId = getSessionId(req);
  if (!sessionId || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = saveJobSchema.safeParse(req.body);
  if (!parsed.success) {
    // Where it failed, never what was in it: enough to find the cause.
    logger.warn({ issues: parsed.error.issues.slice(0, 5).map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) }, "import save job refused");
    res.status(400).json({ error: "Those entries could not be read. Save them again." });
    return;
  }
  const keys = new Set(parsed.data.items.map((item) => item.key));
  if (keys.size !== parsed.data.items.length) {
    logger.warn({ items: parsed.data.items.length, keys: keys.size }, "import save job refused: repeated keys");
    res.status(400).json({ error: "Those entries could not be read. Save them again." });
    return;
  }
  // One at a time per person and budget: a second would only race the first.
  const current = await readJob(groupId, req.user.id, "current", false);
  if (current?.status === "running") {
    res.status(409).json({ error: "Your earlier save is still going.", job: current });
    return;
  }
  const id = await createJob({
    groupId,
    userId: req.user.id,
    sessionId,
    mpesaAccountId: parsed.data.mpesaAccountId,
    items: parsed.data.items as JobItem[],
  });
  void runJob(id);
  res.status(202).json({ id, status: "running", total: parsed.data.items.length, done: 0 });
});

/** The latest save of this person in this budget, how far it has got: for the bar on every screen. */
router.get("/mpesa/import/save-jobs/current", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!importSaveJobsReady() || !req.user) {
    res.json({ job: null });
    return;
  }
  res.json({ job: await readJob(groupId, req.user.id, "current", false) });
});

/** One save, with what each entry became once it is done. */
router.get("/mpesa/import/save-jobs/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const job = id.success && importSaveJobsReady() && req.user ? await readJob(groupId, req.user.id, id.data, true) : null;
  if (!job) {
    res.status(404).json({ error: "That save is not here." });
    return;
  }
  res.json(job);
});

export default router;
