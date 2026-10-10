import { Router } from "express";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { budgetKnowledgeReady, isKnowledgeKind, loadKnowledge, MAX_DOC_BYTES, saveKnowledge } from "../lib/budget-knowledge";

const router = Router();

/** Every document this budget taught Jamvi (lib/budget-knowledge). `ready` false: keep them on the phone. */
router.get("/knowledge", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: budgetKnowledgeReady(), docs: await loadKnowledge(groupId) });
});

/** One document, whole. Owners and admins, who file the money. */
router.put("/knowledge/:kind", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!budgetKnowledgeReady()) {
    res.status(503).json({ error: "This cannot be saved yet. Try again in a minute." });
    return;
  }
  const kind = String(req.params.kind);
  const doc = (req.body as { doc?: unknown } | undefined)?.doc;
  if (!isKnowledgeKind(kind) || doc === undefined || doc === null || typeof doc !== "object") {
    res.status(400).json({ error: "That could not be read." });
    return;
  }
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
    res.status(413).json({ error: "Too much to keep." });
    return;
  }
  await saveKnowledge(groupId, kind, doc);
  res.json({ kind, doc });
});

export default router;
