import { Router } from "express";
import { z } from "zod";
import { feedbackLimiter } from "../middlewares/rateLimit";

/**
 * Relays in-app feedback to the Optimum Prime CRM, tagged as Jamvi's own.
 *
 * Jamvi never stores feedback itself - there is no feedback table, and none
 * is planned. The CRM (optimum-prime-solutions-website) is where every
 * product's feedback already lands for staff to read, so this is a thin
 * server-to-server relay rather than a second inbox to build and maintain.
 *
 * Env: FEEDBACK_CRM_URL, FEEDBACK_CRM_KEY. Absent = the endpoint answers
 * "not configured" rather than silently swallowing what someone wrote.
 */
const router = Router();

const feedbackSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  // Where in the app the prompt was shown, e.g. "settings" or "random-prompt"
  // - not shown to the person, just context for whoever reads it later.
  context: z.string().trim().max(200).optional(),
  appVersion: z.string().trim().max(100).optional(),
});

router.post("/feedback", feedbackLimiter, async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid feedback", details: parsed.error.flatten() });
    return;
  }

  const url = process.env.FEEDBACK_CRM_URL;
  const key = process.env.FEEDBACK_CRM_KEY;
  if (!url || !key) {
    res.status(503).json({ error: "Feedback is not configured yet. Please try again later." });
    return;
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        product: "jamvi",
        message: parsed.data.message,
        rating: parsed.data.rating ?? null,
        submittedBy: req.user!.email ?? req.user!.id,
        appVersion: parsed.data.appVersion ?? null,
        context: parsed.data.context ?? null,
      }),
    });
    if (!upstream.ok) {
      req.log.error({ status: upstream.status }, "feedback: CRM rejected the submission");
      res.status(502).json({ error: "Could not send feedback right now. Please try again." });
      return;
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "feedback: could not reach the CRM");
    res.status(502).json({ error: "Could not send feedback right now. Please try again." });
  }
});

export default router;
