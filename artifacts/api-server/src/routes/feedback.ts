import { Router } from "express";
import { z } from "zod";
import { feedbackLimiter } from "../middlewares/rateLimit";
import { sendEmail } from "../lib/email";

/**
 * Relays in-app feedback to the Optimum Prime CRM, tagged as Jamvi's own.
 *
 * Jamvi never stores feedback itself - there is no feedback table, and none
 * is planned. The CRM (optimum-prime-solutions-website) is where every
 * product's feedback already lands for staff to read, so this is a thin
 * server-to-server relay rather than a second inbox to build and maintain.
 *
 * Env: FEEDBACK_CRM_URL, FEEDBACK_CRM_KEY. Those were never set, so every
 * piece of feedback was refused with "not configured" (seen 3 Oct 2026). Now,
 * when the CRM is not set up or does not take it, the feedback is emailed to
 * FEEDBACK_TO (default info@jamvi.co.ke) instead - the same way M-Pesa message
 * reports already reach that inbox. Only if both fail is the person told.
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

  const submittedBy = req.user!.email ?? req.user!.id;
  const url = process.env.FEEDBACK_CRM_URL;
  const key = process.env.FEEDBACK_CRM_KEY;
  if (url && key) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          product: "jamvi",
          message: parsed.data.message,
          rating: parsed.data.rating ?? null,
          submittedBy,
          appVersion: parsed.data.appVersion ?? null,
          context: parsed.data.context ?? null,
        }),
      });
      if (upstream.ok) {
        res.status(201).json({ ok: true });
        return;
      }
      req.log.error({ status: upstream.status }, "feedback: CRM rejected the submission; emailing it instead");
    } catch (error) {
      req.log.error({ err: error }, "feedback: could not reach the CRM; emailing it instead");
    }
  }

  try {
    await sendEmail(feedbackEmail({ ...parsed.data, submittedBy }));
    res.status(201).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "feedback: could not email it either");
    res.status(502).json({ error: "Could not send your feedback right now. Please try again in a moment." });
  }
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email the feedback becomes when the CRM cannot take it. */
export function feedbackEmail(feedback: { message: string; rating?: number; context?: string; appVersion?: string; submittedBy: string }) {
  const stars = feedback.rating ? `${"★".repeat(feedback.rating)}${"☆".repeat(5 - feedback.rating)} (${feedback.rating}/5)` : "No rating";
  return {
    from: process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>",
    to: [process.env.FEEDBACK_TO?.trim() || "info@jamvi.co.ke"],
    subject: `Jamvi feedback${feedback.rating ? ` - ${feedback.rating}/5` : ""} from ${feedback.submittedBy}`,
    html: [
      `<p><strong>${escapeHtml(stars)}</strong></p>`,
      `<p style="white-space:pre-wrap">${escapeHtml(feedback.message)}</p>`,
      `<p style="color:#666;font-size:12px">From ${escapeHtml(feedback.submittedBy)}`,
      feedback.context ? ` &middot; shown in ${escapeHtml(feedback.context)}` : "",
      feedback.appVersion ? ` &middot; app ${escapeHtml(feedback.appVersion)}` : "",
      "</p>",
    ].join(""),
  };
}

export default router;
