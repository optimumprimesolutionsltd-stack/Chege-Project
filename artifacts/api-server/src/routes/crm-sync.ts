import { Router } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  userSubscriptionsTable,
  subscriptionPlansTable,
  groupMembershipsTable,
  GROUP_ROLE,
} from "@workspace/db";

/**
 * Read-only feed for the Optimum Prime CRM's scheduled SaaS sync — mirrors
 * Mavuno HR's CRM_SYNC_KEY / GET /api/super/orgs pattern so the same Cloud
 * Function code pulls both products (see optimum-prime-solutions-website
 * functions/src/index.ts, saasSources()).
 *
 * Jamvi bills per person, not per group ("a chama of fifty is fifty current
 * members" — see lib/db/src/schema/groups.ts), so the CRM-facing "org" here
 * is a user's most recent subscription, not a group. A group only shows up
 * indirectly, as a usage signal (how many groups this person owns).
 *
 * Env: CRM_SYNC_KEY — the same secret Mavuno HR's CRM_SYNC_KEY is, or a
 * different one; the CRM calls each product with its own key
 * (JAMVI_SYNC_KEY there, matched against this CRM_SYNC_KEY here). Fails
 * closed when unset — no key configured means no bearer token can pass.
 */
export const crmSyncRouter = Router();

function hasValidSyncKey(authHeader: string | undefined): boolean {
  const expected = process.env.CRM_SYNC_KEY?.trim();
  if (!expected) return false;
  const got = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

crmSyncRouter.get("/crm/subscriptions", async (req, res): Promise<void> => {
  try {
    if (!hasValidSyncKey(req.headers.authorization)) {
      res.status(403).json({ error: "CRM sync access required" });
      return;
    }

    const rows = await db
      .select({ sub: userSubscriptionsTable, plan: subscriptionPlansTable, user: usersTable })
      .from(userSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.packageCode, subscriptionPlansTable.code))
      .innerJoin(usersTable, eq(userSubscriptionsTable.userId, usersTable.id))
      .orderBy(desc(userSubscriptionsTable.createdAt));

    // One row per user — their most recent subscription (any status), so a
    // churned or re-subscribed person shows once at their current standing
    // rather than once per historical billing period.
    const latestByUser = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!latestByUser.has(r.sub.userId)) latestByUser.set(r.sub.userId, r);
    }

    const userIds = [...latestByUser.keys()];
    const ownerCounts = userIds.length
      ? await db
          .select({ userId: groupMembershipsTable.userId, cnt: count() })
          .from(groupMembershipsTable)
          .where(and(
            inArray(groupMembershipsTable.userId, userIds),
            eq(groupMembershipsTable.role, GROUP_ROLE.OWNER),
          ))
          .groupBy(groupMembershipsTable.userId)
      : [];
    const ownedGroupsByUser = new Map(ownerCounts.map((r) => [r.userId, r.cnt]));

    const result = [...latestByUser.values()].map(({ sub, plan, user }) => {
      const name =
        user.preferredName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email ||
        "(unnamed)";
      const monthlyCents = plan.monthlyPriceKes * 100;
      const annualCents = plan.annualPriceKes * 100;
      return {
        id: sub.userId,
        name,
        slug: null,
        plan: plan.code,
        status: sub.status,
        billingCycle: sub.billingInterval === "annual" ? "annual" : "monthly",
        // Usage signal, not a seat count — how many groups this person runs.
        activeEmployees: ownedGroupsByUser.get(sub.userId) ?? 0,
        seatLimit: plan.memberLimit ?? 0,
        // No payroll concept in Jamvi; kept for shape parity with Mavuno HR.
        payrollRuns: 0,
        lastPayrollRun: null,
        monthlyCharge: monthlyCents,
        cycleCharge: sub.billingInterval === "annual" ? annualCents : monthlyCents,
        currencyCode: plan.currency,
        trialEndsAt: sub.trialEndsAt,
        createdAt: sub.createdAt,
        admins: user.email ? [{ email: user.email, name }] : [],
      };
    });

    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "crm-sync: could not list subscriptions");
    res.status(500).json({ error: "Could not list subscriptions" });
  }
});
