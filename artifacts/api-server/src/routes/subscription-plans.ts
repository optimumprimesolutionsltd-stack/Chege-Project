import { Router } from "express";
import {
  listSelectablePackages,
  resolveGroupEntitlements,
  resolveUserEntitlements,
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
    res.json({
      personal: resolveUserEntitlements(),
      shared: req.group && !req.group.isPrivate
        ? await resolveGroupEntitlements(req.group.id)
        : null,
    });
  } catch (error) {
    req.log.error({ err: error, groupId: req.group?.id }, "Could not resolve subscription entitlements");
    res.status(500).json({ error: "Could not load package entitlements." });
  }
});