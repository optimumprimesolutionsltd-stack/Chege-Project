import { Router } from "express";
import { z } from "zod";
import { getActiveGroupId, requireGroupManager } from "../lib/activeGroup";
import { businessAccounts, businessAccountsReady, setAccountPurpose } from "../lib/business-accounts";

const router = Router();

/** Which of this budget's accounts are the business's (lib/business-accounts). */
router.get("/business-accounts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  const accounts = await businessAccounts(groupId);
  res.json({ ready: businessAccountsReady(), accountIds: accounts.map((row) => row.accountId), accounts });
});

const purposeSchema = z.object({ business: z.boolean(), incomeSourceId: z.number().int().positive().nullable().optional() });

/** Business or personal, for one account. */
router.put("/business-accounts/:accountId", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireGroupManager(req, res)) return;
  if (!businessAccountsReady()) {
    res.status(503).json({ error: "Business accounts cannot be set yet. Try again in a minute." });
    return;
  }
  const accountId = Number(req.params.accountId);
  const parsed = purposeSchema.safeParse(req.body);
  if (!Number.isInteger(accountId) || accountId <= 0 || !parsed.success) {
    res.status(400).json({ error: "Say whether the account is the business's." });
    return;
  }
  const changed = await setAccountPurpose(groupId, accountId, parsed.data.business, parsed.data.incomeSourceId ?? null);
  if (!changed) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({ accountId, business: parsed.data.business, incomeSourceId: parsed.data.incomeSourceId ?? null });
});

export default router;
