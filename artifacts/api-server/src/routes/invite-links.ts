import { createHash, randomBytes } from "node:crypto";
import {
  AcceptGroupInviteLinkResponse,
  CreateGroupInviteLinkResponse,
  GetGroupInviteLinkPreviewResponse,
  GetGroupInviteLinksResponse,
  RevokeGroupInviteLinkResponse,
} from "@workspace/api-zod";
import {
  db,
  groupInviteLinksTable,
  groupMembershipsTable,
  groupsTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Router } from "express";
import {
  getActiveGroupId,
  requireSharedGroupManager,
  setActiveWorkspaceCookie,
} from "../lib/activeGroup";

const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function linkHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return randomBytes(32).toString("hex");
}

function linkStatus(link: { expiresAt: Date; revokedAt: Date | null }) {
  if (link.revokedAt) return "revoked" as const;
  if (link.expiresAt.getTime() <= Date.now()) return "expired" as const;
  return "active" as const;
}

function toLinkResponse(link: {
  id: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: link.id,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    status: linkStatus(link),
  };
}

function readToken(rawToken: string | string[] | undefined) {
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  return token && /^[a-f0-9]{64}$/i.test(token) ? token : undefined;
}

export const publicInviteLinksRouter = Router();
export const inviteLinksRouter = Router();

publicInviteLinksRouter.get("/group-invite-links/accept/:token", async (req, res): Promise<void> => {
  const token = readToken(req.params.token);
  if (!token) {
    res.status(404).json({ error: "Join link not found." });
    return;
  }

  const [link] = await db
    .select({
      expiresAt: groupInviteLinksTable.expiresAt,
      revokedAt: groupInviteLinksTable.revokedAt,
      groupName: groupsTable.name,
      isPrivate: groupsTable.privateOwnerUserId,
    })
    .from(groupInviteLinksTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupInviteLinksTable.groupId))
    .where(eq(groupInviteLinksTable.tokenHash, linkHash(token)))
    .limit(1);

  if (!link || link.isPrivate || linkStatus(link) !== "active") {
    res.status(410).json({ error: "This private join link is no longer available." });
    return;
  }

  res.json(GetGroupInviteLinkPreviewResponse.parse({
    groupName: link.groupName,
    role: "member",
    expiresAt: link.expiresAt.toISOString(),
  }));
});

publicInviteLinksRouter.post("/group-invite-links/accept/:token", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in before joining this group." });
    return;
  }

  const token = readToken(req.params.token);
  if (!token) {
    res.status(404).json({ error: "Join link not found." });
    return;
  }

  try {
    const accepted = await db.transaction(async (tx) => {
      const [link] = await tx
        .select()
        .from(groupInviteLinksTable)
        .where(eq(groupInviteLinksTable.tokenHash, linkHash(token)))
        .for("update")
        .limit(1);
      if (!link || linkStatus(link) !== "active") {
        throw new Error("unavailable-link");
      }

      const [group] = await tx
        .select({
          id: groupsTable.id,
          name: groupsTable.name,
          privateOwnerUserId: groupsTable.privateOwnerUserId,
        })
        .from(groupsTable)
        .where(eq(groupsTable.id, link.groupId))
        .for("update")
        .limit(1);
      if (!group || group.privateOwnerUserId) {
        throw new Error("unavailable-link");
      }

      const [existingMembership] = await tx
        .select({ userId: groupMembershipsTable.userId })
        .from(groupMembershipsTable)
        .where(and(
          eq(groupMembershipsTable.groupId, group.id),
          eq(groupMembershipsTable.userId, req.user!.id),
        ))
        .limit(1);
      if (!existingMembership) {
        await tx.insert(groupMembershipsTable).values({
          groupId: group.id,
          userId: req.user!.id,
          role: "member",
          addedByUserId: link.createdByUserId,
        });
      }

      return { groupId: group.id, groupName: group.name, expiresAt: link.expiresAt };
    });

    setActiveWorkspaceCookie(res, accepted.groupId);
    res.json(AcceptGroupInviteLinkResponse.parse({
      groupName: accepted.groupName,
      role: "member",
      expiresAt: accepted.expiresAt.toISOString(),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "unavailable-link") {
      res.status(410).json({ error: "This private join link is no longer available." });
      return;
    }
    req.log.error(error, "Could not accept private group join link");
    res.status(500).json({ error: "Could not join this group. Please try again." });
  }
});

inviteLinksRouter.get("/group-invite-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const links = await db
    .select()
    .from(groupInviteLinksTable)
    .where(eq(groupInviteLinksTable.groupId, groupId))
    .orderBy(desc(groupInviteLinksTable.createdAt));
  res.json(GetGroupInviteLinksResponse.parse(links.map(toLinkResponse)));
});

inviteLinksRouter.post("/group-invite-links", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const token = createToken();
  const expiresAt = new Date(Date.now() + INVITE_LINK_TTL_MS);
  const link = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groupsTable.id, privateOwnerUserId: groupsTable.privateOwnerUserId })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .for("update")
      .limit(1);
    if (!group || group.privateOwnerUserId) throw new Error("missing-shared-group");

    // A group has one active private link at a time. Creating a new one resets
    // access immediately, just like resetting a WhatsApp invite link.
    await tx
      .update(groupInviteLinksTable)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(groupInviteLinksTable.groupId, groupId),
        isNull(groupInviteLinksTable.revokedAt),
        gt(groupInviteLinksTable.expiresAt, new Date()),
      ));

    const [created] = await tx
      .insert(groupInviteLinksTable)
      .values({
        groupId,
        tokenHash: linkHash(token),
        createdByUserId: req.user!.id,
        expiresAt,
      })
      .returning();
    if (!created) throw new Error("could-not-create-link");
    return created;
  });

  res.status(201).json(CreateGroupInviteLinkResponse.parse({
    ...toLinkResponse(link),
    token,
  }));
});

inviteLinksRouter.delete("/group-invite-links/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid join link." });
    return;
  }

  const [link] = await db
    .select()
    .from(groupInviteLinksTable)
    .where(and(
      eq(groupInviteLinksTable.id, id),
      eq(groupInviteLinksTable.groupId, groupId),
    ))
    .limit(1);
  if (!link) {
    res.status(404).json({ error: "Join link not found." });
    return;
  }

  const [revoked] = await db
    .update(groupInviteLinksTable)
    .set({ revokedAt: link.revokedAt ?? new Date() })
    .where(eq(groupInviteLinksTable.id, id))
    .returning();
  res.json(RevokeGroupInviteLinkResponse.parse(toLinkResponse(revoked)));
});
