import { Router } from "express";
import { z } from "zod";
import { parseMpesaMessage } from "../lib/mpesa-parser/parser";

const router = Router();
const parseMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(20_000, "Message is too long."),
});

router.post("/parse", (req, res): void => {
  const parsed = parseMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide an anonymized M-Pesa message under 20,000 characters." });
    return;
  }

  // Deliberately do not log the request body: raw messages can contain private data.
  res.json(parseMpesaMessage(parsed.data.message));
});

export default router;