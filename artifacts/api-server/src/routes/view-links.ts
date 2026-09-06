/**
 * View-only join links.
 *
 * A chama has one treasurer and forty people who want to know the balance.
 * Charging all forty to look is what stops the treasurer inviting them at all,
 * so this link grants a role that reads everything, records nothing, and never
 * meets a paywall.
 *
 * On privacy: the link is not a public page. It grants access to a signed-in
 * Jamvi account, so a URL forwarded into a WhatsApp group is not a permanent
 * window into the chama's finances for anyone who ever received it. What the
 * owner gets in exchange is a list of who actually has access, and the ability
 * to revoke it. A group's money is not something to make world-readable on the
 * strength of a hard-to-guess URL.
 *
 * Kept in its own file rather than folded into invite-links.ts because those
 * responses are validated against a generated contract whose role enum is
 * ['admin','member']. Returning "viewer" through them would throw at the
 * parse. These endpoints answer with hand-written JSON instead, and the member
 * link flow is left exactly as it was.
 */

import { createHash, randomBytes } from "node:crypto";
import { db, groupInviteLinksTable, groupMembershipsTable, groupsTable, GROUP_ROLE } from "@workspace/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getActiveGroupId, requireSharedGroupManager, setActiveWorkspaceCookie } from "../lib/activeGroup";
import { inheritedMonthlyTarget } from "../lib/contribution-targets";
import { hashPassword, verifyPassword } from "../lib/auth-password";
import { rateLimit } from "../middlewares/rateLimit";

const VIEW_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const viewLinksRouter: IRouter = Router();
export const publicViewLinksRouter: IRouter = Router();

const linkHash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Guessing attempts against one link.
 *
 * A passphrase people can say out loud is a short one, so the link has to be
 * the thing that resists guessing rather than the passphrase. Counted per
 * token and only on failures, so the members legitimately joining a chama on
 * meeting day never spend each other's allowance.
 */
const viewLinkAttemptLimiter = rateLimit({
  name: "view-link-accept",
  windowMs: 15 * 60 * 1000,
  max: 10,
  countsAgainstLimit: (status) => status >= 400,
  message: "Too many attempts on this link. Wait a few minutes and try again.",
  keyFor: (req) => (typeof req.params.token === "string" ? req.params.token : null),
});

function readToken(rawToken: string | string[] | undefined) {
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  return token && /^[a-f0-9]{64}$/i.test(token) ? token : undefined;
}

async function activeLink(token: string) {
  const [link] = await db
    .select({
      id: groupInviteLinksTable.id,
      groupId: groupInviteLinksTable.groupId,
      groupName: groupsTable.name,
      createdByUserId: groupInviteLinksTable.createdByUserId,
      expiresAt: groupInviteLinksTable.expiresAt,
      revokedAt: groupInviteLinksTable.revokedAt,
      passphraseHash: groupInviteLinksTable.passphraseHash,
      privateOwnerUserId: groupsTable.privateOwnerUserId,
    })
    .from(groupInviteLinksTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupInviteLinksTable.groupId))
    .where(and(
      eq(groupInviteLinksTable.tokenHash, linkHash(token)),
      eq(groupInviteLinksTable.role, GROUP_ROLE.VIEWER),
    ))
    .limit(1);

  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now() || link.privateOwnerUserId) {
    return undefined;
  }
  return link;
}

/** What the recipient is being offered, before they decide to sign in. Names
 *  the budget and nothing else: no figures reach an unauthenticated caller. */
publicViewLinksRouter.get("/group-view-links/accept/:token", async (req, res): Promise<void> => {
  const token = readToken(req.params.token);
  const link = token ? await activeLink(token) : undefined;
  if (!link) {
    res.status(410).json({ error: "This view link is no longer available." });
    return;
  }
  res.json({
    groupName: link.groupName,
    role: GROUP_ROLE.VIEWER,
    expiresAt: link.expiresAt.toISOString(),
    passphraseRequired: link.passphraseHash !== null,
  });
});

publicViewLinksRouter.post("/group-view-links/accept/:token", viewLinkAttemptLimiter, async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to view this budget." });
    return;
  }
  const token = readToken(req.params.token);
  const link = token ? await activeLink(token) : undefined;
  if (!link) {
    res.status(410).json({ error: "This view link is no longer available." });
    return;
  }

  if (link.passphraseHash) {
    const supplied = (req.body as { passphrase?: unknown } | undefined)?.passphrase;
    if (typeof supplied !== "string" || !verifyPassword(supplied, link.passphraseHash)) {
      // Deliberately the same answer whether the passphrase was wrong or
      // missing, and no hint about its shape.
      res.status(403).json({ error: "That passphrase does not match. Ask whoever shared the link." });
      return;
    }
  }

  const [existing] = await db
    .select({ role: groupMembershipsTable.role })
    .from(groupMembershipsTable)
    .where(and(
      eq(groupMembershipsTable.groupId, link.groupId),
      eq(groupMembershipsTable.userId, req.user.id),
    ))
    .limit(1);

  // Somebody who can already record here keeps that. A view link must never
  // quietly demote the treasurer who opened their own link to check it works.
  if (!existing) {
    await db.insert(groupMembershipsTable).values({
      groupId: link.groupId,
      userId: req.user.id,
      role: GROUP_ROLE.VIEWER,
      addedByUserId: link.createdByUserId,
      monthlyTarget: await inheritedMonthlyTarget(db, link.groupId),
    }).onConflictDoNothing();
  }

  setActiveWorkspaceCookie(res, link.groupId);
  res.json({
    groupName: link.groupName,
    role: existing?.role ?? GROUP_ROLE.VIEWER,
    expiresAt: link.expiresAt.toISOString(),
  });
});

/** The current view link, so a manager can see whether one is out there. */
viewLinksRouter.get("/group-view-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const [link] = await db
    .select({
      id: groupInviteLinksTable.id,
      createdAt: groupInviteLinksTable.createdAt,
      expiresAt: groupInviteLinksTable.expiresAt,
      passphraseHash: groupInviteLinksTable.passphraseHash,
    })
    .from(groupInviteLinksTable)
    .where(and(
      eq(groupInviteLinksTable.groupId, groupId),
      eq(groupInviteLinksTable.role, GROUP_ROLE.VIEWER),
      isNull(groupInviteLinksTable.revokedAt),
      gt(groupInviteLinksTable.expiresAt, new Date()),
    ))
    .orderBy(desc(groupInviteLinksTable.createdAt))
    .limit(1);

  // The token itself is never returned after creation - only its hash is
  // stored, which is the point. A manager who has lost the link makes a new one.
  res.json(link
    ? {
        active: true,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt.toISOString(),
        passphraseRequired: link.passphraseHash !== null,
      }
    : { active: false });
});

viewLinksRouter.post("/group-view-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const rawPassphrase = (req.body as { passphrase?: unknown } | undefined)?.passphrase;
  if (rawPassphrase !== undefined && (typeof rawPassphrase !== "string" || rawPassphrase.trim().length < 4)) {
    res.status(400).json({ error: "A passphrase needs at least 4 characters, or leave it out entirely." });
    return;
  }
  const passphrase = typeof rawPassphrase === "string" ? rawPassphrase.trim() : null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VIEW_LINK_TTL_MS);

  try {
    await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: groupsTable.id, privateOwnerUserId: groupsTable.privateOwnerUserId })
        .from(groupsTable)
        .where(eq(groupsTable.id, groupId))
        .for("update")
        .limit(1);
      // A Personal budget has nobody to share with and no members to view it.
      if (!group || group.privateOwnerUserId) throw new Error("missing-shared-group");

      // Only view links are reset. Creating one must not revoke the member
      // link the treasurer sent to their co-signatory - a separate audience,
      // and losing it silently would be the kind of bug nobody reports.
      await tx
        .update(groupInviteLinksTable)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(groupInviteLinksTable.groupId, groupId),
          eq(groupInviteLinksTable.role, GROUP_ROLE.VIEWER),
          isNull(groupInviteLinksTable.revokedAt),
          gt(groupInviteLinksTable.expiresAt, new Date()),
        ));

      await tx.insert(groupInviteLinksTable).values({
        groupId,
        tokenHash: linkHash(token),
        role: GROUP_ROLE.VIEWER,
        // Stored hashed, never in the clear. The person who set it is the only
        // one who knows it, and Jamvi cannot tell them what it was.
        passphraseHash: passphrase ? hashPassword(passphrase) : null,
        createdByUserId: req.user!.id,
        expiresAt,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "missing-shared-group") {
      res.status(400).json({ error: "Only a Shared budget can be shared for viewing." });
      return;
    }
    throw error;
  }

  res.status(201).json({
    token,
    expiresAt: expiresAt.toISOString(),
    passphraseRequired: passphrase !== null,
  });
});

/** Withdraw the link. Anyone who already joined keeps their access until they
 *  are removed from the members list - revoking a link is about who can still
 *  arrive, not about who is already here. */
viewLinksRouter.delete("/group-view-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  await db
    .update(groupInviteLinksTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(groupInviteLinksTable.groupId, groupId),
      eq(groupInviteLinksTable.role, GROUP_ROLE.VIEWER),
      isNull(groupInviteLinksTable.revokedAt),
    ));

  res.json({ success: true });
});
