import { RequestPhotoUploadBody, RequestPhotoUploadResponse } from "@workspace/api-zod";
import { Router } from "express";
import { createPhotoUpload } from "../lib/photoStorage";

const router = Router();

router.post("/storage/photos/upload-url", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestPhotoUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a JPG, PNG, or WebP image smaller than 15 MB." });
    return;
  }

  try {
    const upload = await createPhotoUpload(parsed.data.contentType, parsed.data.size);
    res.json(RequestPhotoUploadResponse.parse(upload));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not prepare your photo upload.",
    });
  }
});

export default router;