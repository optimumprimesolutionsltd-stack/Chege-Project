import { createHash, randomBytes } from "node:crypto";
import {
  db,
  groupInviteContactsTable,
  groupInvitationsTable,
  groupMembershipsTable,
  groupsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getActiveGroupId, requireSharedGroupManager } from "../lib/activeGroup";
import { EmailNotConfiguredError, sendEmail } from "../lib/email";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  role: z.enum(["admin", "member"]).default("member"),
  contactName: z.string().trim().min(1).max(80).optional(),
  saveContact: z.boolean().default(false),
});
const batchInviteSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses.").max(320)).min(1).max(50),
  role: z.enum(["admin", "member"]).default("member"),
});
const contactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

class InvitationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return randomBytes(32).toString("hex");
}

function invitationStatus(invitation: {
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
}) {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.cancelledAt) return "cancelled";
  if (invitation.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

function appUrl() {
  const configured = process.env.APP_URL?.trim();
  if (!configured) {
    throw new InvitationError("Email invitations are not configured. Set APP_URL to the public Jamvi URL.", 503);
  }
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("invalid URL");
    }
    return configured.replace(/\/+$/, "");
  } catch {
    throw new InvitationError("APP_URL must be a public HTTPS URL.", 503);
  }
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!
  ));
}

async function sendInvitationEmail(params: {
  req: Request;
  email: string;
  groupName: string;
  role: "admin" | "member";
  token: string;
}) {
  const inviteLink = `${appUrl()}/invite/${params.token}`;
  const groupName = htmlEscape(params.groupName);
  const roleLabel = params.role === "admin" ? "Admin" : "Member";
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f8f6;font-family:Arial,sans-serif;color:#183123">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
          <tr><td style="padding:32px;background:#183d28;color:#ffffff">
            <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a6e8bd">Jamvi group invitation</p>
            <h1 style="margin:8px 0 0;font-size:26px">You are invited</h1>
          </td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5">You have been invited to join <strong>${groupName}</strong> on Jamvi as a <strong>${roleLabel}</strong>.</p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#52645a">Sign in using this email address, then accept the invitation to join the shared budget.</p>
            <a href="${inviteLink}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2f8f4e;color:#ffffff;text-decoration:none;font-weight:700">Accept invitation</a>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#718077">This invitation expires in 7 days. If you were not expecting it, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  try {
    await sendEmail({
      from: process.env.INVITATION_FROM_EMAIL ?? process.env.DIGEST_FROM_EMAIL ?? "Jamvi <onboarding@resend.dev>",
      to: [params.email],
      subject: `Join ${params.groupName} on Jamvi`,
      html,
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      // A missing key is a deployment problem, not a bad request, and the
      // caller surfaces 503s as "invitations are not configured".
      throw new InvitationError(
        "Email invitations are not configured. Set RESEND_API_KEY.",
        503,
      );
    }
    throw error;
  }
}

async function getInvitationForToken(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return undefined;

  const [invitation] = await db
    .select({
      id: groupInvitationsTable.id,
      groupId: groupInvitationsTable.groupId,
      email: groupInvitationsTable.email,
      role: groupInvitationsTable.role,
      expiresAt: groupInvitationsTable.expiresAt,
      acceptedAt: groupInvitationsTable.acceptedAt,
      cancelledAt: groupInvitationsTable.cancelledAt,
      groupName: groupsTable.name,
    })
    .from(groupInvitationsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupInvitationsTable.groupId))
    .where(eq(groupInvitationsTable.tokenHash, tokenHash(token)))
    .limit(1);
  return invitation;
}

function toInvitationResponse(invitation: {
  id: number;
  email: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
}) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role as "admin" | "member",
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    cancelledAt: invitation.cancelledAt?.toISOString() ?? null,
    status: invitationStatus(invitation),
  };
}

async function createAndSendInvitation(params: {
  req: Request;
  groupId: number;
  email: string;
  role: "admin" | "member";
  contactName?: string;
  saveContact?: boolean;
}) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const created = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groupsTable.id, name: groupsTable.name })
      .from(groupsTable)
      .where(eq(groupsTable.id, params.groupId))
      .for("update");
    if (!group) throw new InvitationError("Group not found.", 404);

    const [knownUser] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${params.email}`)
      .limit(1);
    if (knownUser) {
      const [existingMember] = await tx
        .select({ userId: groupMembershipsTable.userId })
        .from(groupMembershipsTable)
        .where(and(eq(groupMembershipsTable.groupId, params.groupId), eq(groupMembershipsTable.userId, knownUser.id)))
        .limit(1);
      if (existingMember) throw new InvitationError("This person is already a member of the group.", 409);
    }

    const now = new Date();
    const existingInvitationRows = await tx
      .select({ id: groupInvitationsTable.id })
      .from(groupInvitationsTable)
      .where(and(
        eq(groupInvitationsTable.groupId, params.groupId),
        eq(groupInvitationsTable.email, params.email),
        isNull(groupInvitationsTable.acceptedAt),
        isNull(groupInvitationsTable.cancelledAt),
        gt(groupInvitationsTable.expiresAt, now),
      ))
      .limit(1);
    if (existingInvitationRows[0]) throw new InvitationError("There is already a pending invitation for this email.", 409);

    const [invitation] = await tx
      .insert(groupInvitationsTable)
      .values({
        groupId: params.groupId,
        email: params.email,
        role: params.role,
        tokenHash: tokenHash(token),
        createdByUserId: params.req.user!.id,
        expiresAt,
      })
      .returning();
    if (params.saveContact && params.contactName) {
      await tx
        .insert(groupInviteContactsTable)
        .values({
          groupId: params.groupId,
          name: params.contactName,
          email: params.email,
          role: params.role,
          createdByUserId: params.req.user!.id,
        })
        .onConflictDoUpdate({
          target: [groupInviteContactsTable.groupId, groupInviteContactsTable.email],
          set: { name: params.contactName, role: params.role, updatedAt: new Date() },
        });
    }
    return { invitation, groupName: group.name };
  });

  try {
    await sendInvitationEmail({
      req: params.req,
      email: params.email,
      groupName: created.groupName,
      role: params.role,
      token,
    });
  } catch (error) {
    await db.delete(groupInvitationsTable).where(eq(groupInvitationsTable.id, created.invitation.id));
    throw error;
  }

  return toInvitationResponse(created.invitation);
}

export const publicInvitationsRouter = Router();
export const invitationsRouter = Router();

publicInvitationsRouter.get("/group-invitations/accept/:token", async (req, res): Promise<void> => {
  const invitation = await getInvitationForToken(req.params.token);
  if (!invitation) {
    res.status(404).json({ error: "Invitation not found." });
    return;
  }

  const status = invitationStatus(invitation);
  if (status !== "pending") {
    res.status(410).json({ error: `This invitation is ${status}.` });
    return;
  }

  res.json({
    groupName: invitation.groupName,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  });
});

publicInvitationsRouter.post("/group-invitations/accept/:token", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in before accepting this invitation." });
    return;
  }

  const token = req.params.token;
  const hash = tokenHash(token);
  try {
    const [tokenRecord] = await db
      .select({ groupId: groupInvitationsTable.groupId })
      .from(groupInvitationsTable)
      .where(eq(groupInvitationsTable.tokenHash, hash))
      .limit(1);
    if (!tokenRecord) throw new InvitationError("Invitation not found.", 404);

    const accepted = await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: groupsTable.id, name: groupsTable.name })
        .from(groupsTable)
        .where(eq(groupsTable.id, tokenRecord.groupId))
        .for("update");
      if (!group) throw new InvitationError("Invitation not found.", 404);

      const [invitation] = await tx
        .select()
        .from(groupInvitationsTable)
        .where(eq(groupInvitationsTable.tokenHash, hash))
        .for("update");
      if (!invitation) throw new InvitationError("Invitation not found.", 404);
      if (invitation.acceptedAt) throw new InvitationError("This invitation has already been accepted.", 409);
      if (invitation.cancelledAt) throw new InvitationError("This invitation was cancelled.", 410);
      if (invitation.expiresAt.getTime() <= Date.now()) throw new InvitationError("This invitation has expired.", 410);

      const [user] = await tx
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id))
        .limit(1);
      const signedInEmail = user?.email?.trim().toLowerCase();
      if (!signedInEmail || signedInEmail !== invitation.email) {
        throw new InvitationError("Sign in with the email address that received this invitation.", 403);
      }

      const [existingMembership] = await tx
        .select({ userId: groupMembershipsTable.userId })
        .from(groupMembershipsTable)
        .where(and(
          eq(groupMembershipsTable.groupId, invitation.groupId),
          eq(groupMembershipsTable.userId, req.user!.id),
        ))
        .limit(1);
      if (existingMembership) throw new InvitationError("You are already a member of this group.", 409);

      await tx.insert(groupMembershipsTable).values({
        groupId: invitation.groupId,
        userId: req.user!.id,
        role: invitation.role,
        addedByUserId: invitation.createdByUserId,
      });
      await tx
        .update(groupInvitationsTable)
        .set({ acceptedAt: new Date() })
        .where(eq(groupInvitationsTable.id, invitation.id));

      return { groupName: group.name, role: invitation.role };
    });
    res.json(accepted);
  } catch (error) {
    if (error instanceof InvitationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error(error, "Could not accept group invitation");
    res.status(500).json({ error: "Could not accept invitation. Please try again." });
  }
});

invitationsRouter.get("/group-invitations", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const invitations = await db
    .select()
    .from(groupInvitationsTable)
    .where(eq(groupInvitationsTable.groupId, groupId))
    .orderBy(desc(groupInvitationsTable.createdAt));
  res.json(invitations.map(toInvitationResponse));
});

invitationsRouter.post("/group-invitations", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter a valid invitation." });
    return;
  }

  const { email, role, contactName, saveContact } = parsed.data;
  try {
    const invitation = await createAndSendInvitation({ req, groupId, email, role, contactName, saveContact });
    res.status(201).json(invitation);
  } catch (error) {
    if (error instanceof InvitationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error(error, "Could not create group invitation");
    res.status(500).json({ error: "Could not send invitation email. Please try again." });
  }
});

invitationsRouter.post("/group-invitations/batch", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const parsed = batchInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter valid email addresses." });
    return;
  }

  const emails = [...new Set(parsed.data.emails)];
  const sent: ReturnType<typeof toInvitationResponse>[] = [];
  const failed: { email: string; error: string }[] = [];
  for (const email of emails) {
    try {
      sent.push(await createAndSendInvitation({
        req,
        groupId,
        email,
        role: parsed.data.role,
      }));
    } catch (error) {
      failed.push({
        email,
        error: error instanceof InvitationError
          ? error.message
          : "Could not send invitation email. Please try again.",
      });
    }
  }

  res.status(201).json({ sent, failed });
});

invitationsRouter.post("/group-invitations/:id/resend", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid invitation." });
    return;
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  let priorToken: { tokenHash: string; expiresAt: Date } | undefined;
  try {
    const changed = await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: groupsTable.id, name: groupsTable.name })
        .from(groupsTable)
        .where(eq(groupsTable.id, groupId))
        .for("update");
      if (!group) throw new InvitationError("Group not found.", 404);

      const [invitation] = await tx
        .select()
        .from(groupInvitationsTable)
        .where(and(eq(groupInvitationsTable.id, id), eq(groupInvitationsTable.groupId, groupId)))
        .for("update");
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt || invitation.expiresAt.getTime() <= Date.now()) {
        throw new InvitationError("Pending invitation not found.", 404);
      }
      const [updated] = await tx
        .update(groupInvitationsTable)
        .set({ tokenHash: tokenHash(token), expiresAt })
        .where(eq(groupInvitationsTable.id, id))
        .returning();
      return { invitation, updated, groupName: group.name };
    });
    priorToken = { tokenHash: changed.invitation.tokenHash, expiresAt: changed.invitation.expiresAt };

    await sendInvitationEmail({
      req,
      email: changed.updated.email,
      groupName: changed.groupName,
      role: changed.updated.role as "admin" | "member",
      token,
    });
    res.json(toInvitationResponse(changed.updated));
  } catch (error) {
    // A failed email must not strand the recipient with an invalidated old link.
    const rollbackToken = priorToken;
    if (rollbackToken) {
      await db.transaction(async (tx) => {
        const [group] = await tx
          .select({ id: groupsTable.id })
          .from(groupsTable)
          .where(eq(groupsTable.id, groupId))
          .for("update");
        if (!group) return;
        const [current] = await tx
          .select()
          .from(groupInvitationsTable)
          .where(and(eq(groupInvitationsTable.id, id), eq(groupInvitationsTable.groupId, groupId)))
          .for("update");
        if (current && current.tokenHash === tokenHash(token) && !current.acceptedAt && !current.cancelledAt) {
          await tx
            .update(groupInvitationsTable)
            .set({ tokenHash: rollbackToken.tokenHash, expiresAt: rollbackToken.expiresAt })
            .where(eq(groupInvitationsTable.id, id));
        }
      });
    }
    if (error instanceof InvitationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error(error, "Could not resend group invitation");
    res.status(500).json({ error: "Could not resend invitation email. Please try again." });
  }
});

invitationsRouter.delete("/group-invitations/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid invitation." });
    return;
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: groupsTable.id })
        .from(groupsTable)
        .where(eq(groupsTable.id, groupId))
        .for("update");
      if (!group) throw new InvitationError("Group not found.", 404);
      const [invitation] = await tx
        .select()
        .from(groupInvitationsTable)
        .where(and(eq(groupInvitationsTable.id, id), eq(groupInvitationsTable.groupId, groupId)))
        .for("update");
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt) {
        throw new InvitationError("Pending invitation not found.", 404);
      }
      const [cancelled] = await tx
        .update(groupInvitationsTable)
        .set({ cancelledAt: new Date() })
        .where(eq(groupInvitationsTable.id, id))
        .returning();
      return cancelled;
    });
    res.json(toInvitationResponse(updated));
  } catch (error) {
    if (error instanceof InvitationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error(error, "Could not cancel group invitation");
    res.status(500).json({ error: "Could not cancel invitation. Please try again." });
  }
});

invitationsRouter.get("/group-invitation-contacts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const contacts = await db
    .select()
    .from(groupInviteContactsTable)
    .where(eq(groupInviteContactsTable.groupId, groupId))
    .orderBy(desc(groupInviteContactsTable.updatedAt));
  res.json(contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    role: contact.role,
  })));
});

invitationsRouter.post("/group-invitation-contacts", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter a valid contact." });
    return;
  }

  const [contact] = await db
    .insert(groupInviteContactsTable)
    .values({ groupId, ...parsed.data, createdByUserId: req.user!.id })
    .onConflictDoUpdate({
      target: [groupInviteContactsTable.groupId, groupInviteContactsTable.email],
      set: { name: parsed.data.name, role: parsed.data.role, updatedAt: new Date() },
    })
    .returning();
  res.status(201).json({ id: contact.id, name: contact.name, email: contact.email, role: contact.role });
});

invitationsRouter.delete("/group-invitation-contacts/:id", async (req, res): Promise<void> => {
  const groupId = getActiveGroupId(req, res);
  if (groupId === null) return;
  if (!requireSharedGroupManager(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid contact." });
    return;
  }
  const [deleted] = await db
    .delete(groupInviteContactsTable)
    .where(and(eq(groupInviteContactsTable.id, id), eq(groupInviteContactsTable.groupId, groupId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Saved contact not found." });
    return;
  }
  res.json({ success: true });
});