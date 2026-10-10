import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { categoryPlaces, categoryPlacesReady, setCategoryPlace } from "../lib/category-places";

const router = Router();

/** The categories moved to the other side of Reports' "At home vs outside" (lib/category-places). */
router.get("/category-places", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: categoryPlacesReady(), places: await categoryPlaces(groupId) });
});

// atHome: true at home (Household upkeep), false outside; null back to Jamvi's own side.
const placeSchema = z.object({ atHome: z.boolean().nullable() });

router.put("/category-places/:categoryId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!categoryPlacesReady()) {
    res.status(503).json({ error: "This cannot be saved yet. Try again in a minute." });
    return;
  }
  const categoryId = Number(req.params.categoryId);
  const parsed = placeSchema.safeParse(req.body);
  if (!Number.isInteger(categoryId) || categoryId <= 0 || !parsed.success) {
    res.status(400).json({ error: "Say whether it is spent at home." });
    return;
  }
  if (!(await setCategoryPlace(groupId, categoryId, parsed.data.atHome))) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json({ categoryId, atHome: parsed.data.atHome });
});

export default router;
