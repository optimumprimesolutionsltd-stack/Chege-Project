import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { getActiveGroupId } from "../lib/activeGroup";
import { accountHasEmail, confirmYearDeletionCode, deletionConfirmation, IncorrectDeletionCodeError, requestYearDeletionCode, TYPED_CONFIRMATION } from "../lib/account-deletion";
import { nairobiToday } from "../lib/mpesa-balance";
import { deletableYear, deleteYear, pastYears } from "../lib/year-deletion";
import { accountDeletionCodeLimiter, accountDeletionConfirmLimiter } from "../middlewares/rateLimit";

/**
 * Deleting a whole past year from a Personal budget (lib/year-deletion.ts):
 * see the years and what each holds, ask for a code, then delete with it.
 */
const router = Router();

const currentYear = () => Number(nairobiToday().slice(0, 4));

/** Personal budget only: nobody else's records are in it. */
function personalOnly(req: Request, res: Response): boolean {
  if (req.group?.isPrivate) return true;
  res.status(403).json({ error: "A year can only be deleted from your own Personal budget." });
  return false;
}

function yearOf(raw: unknown, res: Response): number | null {
  const year = Number(raw);
  if (!deletableYear(year, currentYear())) {
    res.status(400).json({ error: `Only a year before ${currentYear()} can be deleted.` });
    return null;
  }
  return year;
}

router.get("/budget-years", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !personalOnly(req, res)) return;
  res.json({ currentYear: currentYear(), years: await pastYears(db, groupId, currentYear()) });
});

router.post("/budget-years/:year/delete/request-code", accountDeletionCodeLimiter, async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !personalOnly(req, res)) return;
  const year = yearOf(req.params.year, res);
  if (year === null) return;
  if (!(await accountHasEmail(req.user!.id))) {
    res.json({ sent: false, confirmWith: TYPED_CONFIRMATION });
    return;
  }
  try {
    await requestYearDeletionCode(req.user!.id, groupId, year);
    res.json({ sent: true });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not send a confirmation code." });
  }
});

router.delete("/budget-years/:year", accountDeletionConfirmLimiter, async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null || !personalOnly(req, res)) return;
  const year = yearOf(req.params.year, res);
  if (year === null) return;
  const how = await deletionConfirmation(req.user!.id, req.body);
  if ("error" in how) {
    res.status(400).json({ error: how.error });
    return;
  }
  try {
    if (how.kind === "code") await confirmYearDeletionCode(req.user!.id, groupId, year, how.code);
  } catch (error) {
    if (error instanceof IncorrectDeletionCodeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  const deleted = await db.transaction((tx) => deleteYear(tx, groupId, year));
  res.json({ year, deleted });
});

export default router;
