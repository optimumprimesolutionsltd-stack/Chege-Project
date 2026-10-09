import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { isStandardKey, linkStandardCategory, standardCategories, standardCategoriesReady } from "../lib/standard-categories";

const router = Router();

/** This budget's common category for each kind of payee Jamvi knows (lib/standard-categories). */
router.get("/standard-categories", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: standardCategoriesReady(), links: await standardCategories(groupId) });
});

const linkSchema = z.object({ key: z.string().refine(isStandardKey), categoryId: z.number().int().positive() });

/** Remembers one of this budget's categories as its common one for a kind of payee. */
router.put("/standard-categories", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!standardCategoriesReady()) {
    res.status(503).json({ error: "Common categories cannot be set yet. Try again in a minute." });
    return;
  }
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Say which kind of payee and which category." });
    return;
  }
  if (!(await linkStandardCategory(groupId, parsed.data.key, parsed.data.categoryId))) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json({ key: parsed.data.key, categoryId: parsed.data.categoryId });
});

export default router;
