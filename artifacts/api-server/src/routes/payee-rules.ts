import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { changePayeeRules, cleanRules, loadPayeeRules, MAX_KEY, MAX_RULES, payeeRulesReady, replacePayeeRules } from "../lib/payee-rules";

const router = Router();

/** What this budget taught Jamvi about payees (lib/payee-rules). `ready` false: keep them on the phone for now. */
router.get("/payee-rules", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  res.json({ ready: payeeRulesReady(), rules: await loadPayeeRules(groupId) });
});

const changeSchema = z.object({
  set: z.record(z.string(), z.string()).default({}),
  remove: z.array(z.string().max(MAX_KEY)).max(MAX_RULES).default([]),
});

/** Some rules set, some removed - what one save on the phone changed. Owners and admins, who file the money. */
router.patch("/payee-rules", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!payeeRulesReady()) {
    res.status(503).json({ error: "Payee rules cannot be saved yet. Try again in a minute." });
    return;
  }
  const parsed = changeSchema.safeParse(req.body);
  const set = parsed.success ? cleanRules(parsed.data.set) : {};
  if (!parsed.success || Object.keys(set).length > MAX_RULES) {
    res.status(400).json({ error: "Those rules could not be read." });
    return;
  }
  await changePayeeRules(groupId, set, parsed.data.remove.map((key) => key.trim()).filter(Boolean));
  res.json({ rules: await loadPayeeRules(groupId) });
});

/** Every rule at once: the phone's own copy, sent when it saved while offline. */
router.put("/payee-rules", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!payeeRulesReady()) {
    res.status(503).json({ error: "Payee rules cannot be saved yet. Try again in a minute." });
    return;
  }
  const rules = cleanRules((req.body as { rules?: unknown } | undefined)?.rules);
  if (Object.keys(rules).length > MAX_RULES) {
    res.status(400).json({ error: "Too many rules." });
    return;
  }
  await replacePayeeRules(groupId, rules);
  res.json({ rules: await loadPayeeRules(groupId) });
});

export default router;
