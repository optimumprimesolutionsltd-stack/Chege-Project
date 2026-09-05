import { Router } from "express";
import {
  listSelectablePackages,
  resolveMemberEntitlements,
} from "../lib/subscription-catalog";

export const publicSubscriptionPlansRouter = Router();
export const subscriptionPlansRouter = Router();

publicSubscriptionPlansRouter.get("/subscription-plans", async (req, res): Promise<void> => {
  try {
    res.json({ packages: await listSelectablePackages() });
  } catch (error) {
    req.log.error({ err: error }, "Could not list subscription packages");
    res.status(500).json({ error: "Could not load Jamvi packages." });
  }
});

subscriptionPlansRouter.get("/subscription-plans/entitlements", async (req, res): Promise<void> => {
  try {
    res.json({ member: await resolveMemberEntitlements(req.user!.id) });
  } catch (error) {
    req.log.error({ err: error, userId: req.user?.id }, "Could not resolve subscription entitlements");
    res.status(500).json({ error: "Could not load package entitlements." });
  }
});