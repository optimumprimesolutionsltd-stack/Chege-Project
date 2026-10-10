/**
 * Telling somebody they now own a group.
 *
 * Handing a group over used to change a role and nothing else: the new owner
 * only found out by happening to open the group. Often the person handing it
 * over is moving to a different email of their own, or giving a chama's books
 * to the next treasurer - either way, the new owner needs to know it is theirs
 * now, and what they can do with it.
 *
 * Best-effort. Ownership has already moved by the time this runs, so a mail
 * failure is logged and never undoes it or fails the request.
 */

import { eq } from "drizzle-orm";
import { db, groupsTable, usersTable } from "@workspace/db";
import { sendEmail } from "./email";
import { logger } from "./logger";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function displayName(user: { preferredName: string | null; firstName: string | null; lastName: string | null; email: string | null }): string {
  return user.preferredName?.trim()
    || [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || user.email
    || "Another member";
}

export function composeOwnershipEmail(params: {
  newOwnerFirstName: string | null;
  previousOwnerName: string;
  groupName: string;
  appUrl: string | null;
}): { subject: string; html: string } {
  const group = escapeHtml(params.groupName);
  const link = params.appUrl ? `<p><a href="${params.appUrl}/app/">Open Jamvi</a></p>` : "";
  return {
    subject: `You now own "${params.groupName}" on Jamvi`,
    html: `<p>Hi${params.newOwnerFirstName ? ` ${escapeHtml(params.newOwnerFirstName)}` : ""},</p>`
      + `<p>${escapeHtml(params.previousOwnerName)} has made you the owner of <strong>${group}</strong>. `
      + `Everything recorded in it is unchanged.</p>`
      + `<p>As the owner you can invite and remove people, change the group's setup, and hand it on again. `
      + `If you end up the only one in it, you can make it your own Personal budget from Settings.</p>`
      + link,
  };
}

export async function notifyNewOwner(params: { groupId: number; newOwnerId: string; previousOwnerId: string }): Promise<void> {
  try {
    const [[group], [newOwner], [previous]] = await Promise.all([
      db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, params.groupId)).limit(1),
      db.select().from(usersTable).where(eq(usersTable.id, params.newOwnerId)).limit(1),
      db.select().from(usersTable).where(eq(usersTable.id, params.previousOwnerId)).limit(1),
    ]);
    if (!group || !newOwner?.email) return;
    const { subject, html } = composeOwnershipEmail({
      newOwnerFirstName: newOwner.preferredName ?? newOwner.firstName,
      previousOwnerName: previous ? displayName(previous) : "The previous owner",
      groupName: group.name,
      appUrl: process.env.APP_URL?.trim().replace(/\/+$/, "") || null,
    });
    await sendEmail({
      from: process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>",
      to: [newOwner.email],
      subject,
      html,
    });
  } catch (error) {
    logger.error({ err: error }, "Could not tell the new owner about a handed-over group");
  }
}
