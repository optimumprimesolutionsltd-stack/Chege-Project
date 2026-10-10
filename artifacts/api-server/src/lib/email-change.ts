/**
 * Moving an account to a different email address.
 *
 * Everything a person has - their Personal budget, every group, their
 * subscription - hangs off their user id, never their email, so changing the
 * address is one column. The care is all around it:
 *
 * - The new address proves itself. A 6-digit code goes to the NEW inbox, and
 *   the change only happens once that code comes back, so nobody can move an
 *   account to an address they cannot read.
 * - Nobody is locked out. An account made with Google has no password, and
 *   the new address may not be a Google account; such an account sets a
 *   password in the same step, so it can always sign in with the new address.
 * - The old address lets go. Google sign-in finds an account by email and,
 *   failing that, by the id Google gave it when it was created - which would
 *   quietly pull a Google-made account straight back to its old address the
 *   next time it signed in that way. A "moved away from" record stops that:
 *   signing in with the old address afterwards starts a fresh account instead
 *   (routes/auth.ts upsertUser).
 *
 * Codes and records live in account_deletion_codes, which already carries
 * account, group and year deletion codes the same way: every hash is scoped
 * to its purpose (and here to the new address), so one can never be spent as
 * another. Nothing ever purges that table, which is what lets the moved-away
 * record stand. No migration was needed - migrations here do not run on
 * deploy, and a sign-in path that read a table not yet created would fail.
 */

import crypto from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { accountDeletionCodesTable, db, usersTable, type User } from "@workspace/db";
import { hashPassword } from "./auth";
import { EmailNotConfiguredError, sendEmail } from "./email";
import { logger } from "./logger";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export class EmailChangeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase("en-US");

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** Bound to the address it was sent to: a code for one address cannot confirm another. */
export function hashEmailChangeCode(newEmail: string, code: string): string {
  return sha256(`email:${normalizeEmail(newEmail)}:${code}`);
}

/** The permanent record that an account no longer answers to this address. */
export function movedAwayHash(oldEmail: string): string {
  return sha256(`moved-from:${normalizeEmail(oldEmail)}`);
}

function fromAddress(): string {
  return process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>";
}

function generateCode(): string {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

async function loadUser(userId: string): Promise<User> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new EmailChangeError(404, "Account not found.");
  return user;
}

async function addressTakenByAnotherAccount(userId: string, email: string): Promise<boolean> {
  const [other] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(sql`lower(${usersTable.email}) = ${email}`, ne(usersTable.id, userId)))
    .limit(1);
  return Boolean(other);
}

export const ADDRESS_TAKEN_MESSAGE =
  'That email already has its own Jamvi account. To move a budget to it, use "Give this budget to someone else" instead.';

/**
 * Step one: send a code to the new address. Nothing about the account changes.
 * Says whether the confirm step will also need a password.
 */
export async function requestEmailChangeCode(
  userId: string,
  rawEmail: string,
  now: Date = new Date(),
): Promise<{ needsPassword: boolean }> {
  const newEmail = normalizeEmail(rawEmail);
  const user = await loadUser(userId);
  if (user.email && normalizeEmail(user.email) === newEmail) {
    throw new EmailChangeError(400, "That is already your email.");
  }
  if (await addressTakenByAnotherAccount(userId, newEmail)) {
    throw new EmailChangeError(409, ADDRESS_TAKEN_MESSAGE);
  }

  const code = generateCode();
  await db.insert(accountDeletionCodesTable).values({
    userId,
    codeHash: hashEmailChangeCode(newEmail, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });

  try {
    await sendEmail({
      from: fromAddress(),
      to: [newEmail],
      subject: "Your Jamvi email-change code",
      html: `<p>Hi${user.firstName ? ` ${user.firstName}` : ""},</p>`
        + `<p>Use this code to move your Jamvi account to this email address:</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>`
        + `<p>It expires in 10 minutes. If you did not ask for this, ignore this message — nothing changes without the code.</p>`,
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      logger.error("Could not send an email-change code: no mailer is configured");
    } else {
      logger.error({ err: error }, "Could not send an email-change code");
    }
    throw new EmailChangeError(502, "Could not send a code to that address. Check it and try again shortly.");
  }

  return { needsPassword: !user.passwordHash };
}

/**
 * Step two: spend the code and move the account. The password, when the
 * account has none, is checked before the code is spent, so a short password
 * does not cost the person their code.
 */
export async function confirmEmailChange(
  userId: string,
  input: { email: string; code: string; password?: string | null },
  now: Date = new Date(),
): Promise<User> {
  const newEmail = normalizeEmail(input.email);
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) throw new EmailChangeError(400, "Enter the 6-digit code we emailed to your new address.");

  const [pending] = await db
    .select({ id: accountDeletionCodesTable.id, codeHash: accountDeletionCodesTable.codeHash })
    .from(accountDeletionCodesTable)
    .where(and(
      eq(accountDeletionCodesTable.userId, userId),
      isNull(accountDeletionCodesTable.usedAt),
      gt(accountDeletionCodesTable.expiresAt, now),
    ))
    .orderBy(desc(accountDeletionCodesTable.createdAt))
    .limit(1);
  if (!pending || pending.codeHash !== hashEmailChangeCode(newEmail, code)) {
    throw new EmailChangeError(400, "That code is incorrect or has expired.");
  }

  const user = await loadUser(userId);
  const password = input.password ?? "";
  if (!user.passwordHash && password.length < MIN_PASSWORD_LENGTH) {
    throw new EmailChangeError(400, `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters, so you can sign in with your new email.`);
  }
  if (await addressTakenByAnotherAccount(userId, newEmail)) {
    throw new EmailChangeError(409, ADDRESS_TAKEN_MESSAGE);
  }

  const oldEmail = user.email;
  let updated: User;
  try {
    updated = await db.transaction(async (tx) => {
      await tx.update(accountDeletionCodesTable).set({ usedAt: now }).where(eq(accountDeletionCodesTable.id, pending.id));
      const [row] = await tx
        .update(usersTable)
        .set({
          email: newEmail,
          ...(user.passwordHash ? {} : { passwordHash: hashPassword(password) }),
          updatedAt: now,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      if (oldEmail) {
        await tx.insert(accountDeletionCodesTable).values({
          userId,
          codeHash: movedAwayHash(oldEmail),
          expiresAt: now,
          usedAt: now,
        });
      }
      return row;
    });
  } catch (error) {
    // Two accounts racing for the same address: the unique index decides.
    if ((error as { code?: string })?.code === "23505") throw new EmailChangeError(409, ADDRESS_TAKEN_MESSAGE);
    throw error;
  }

  if (oldEmail) {
    try {
      await sendEmail({
        from: fromAddress(),
        to: [oldEmail],
        subject: "Your Jamvi account has a new email",
        html: `<p>Hi${user.firstName ? ` ${user.firstName}` : ""},</p>`
          + `<p>Your Jamvi account now signs in with <strong>${newEmail}</strong> instead of this address. `
          + `Everything in it moved with it.</p>`
          + `<p>If you did not do this, reply to this email straight away.</p>`,
      });
    } catch (error) {
      // A courtesy notice; the change itself has already happened.
      logger.error({ err: error }, "Could not send the email-changed notice to the old address");
    }
  }

  return updated;
}

/**
 * Whether this account has moved away from this address. Read on every Google
 * sign-in, so it never throws: on any failure it answers no, which is exactly
 * how sign-in behaved before email changes existed.
 */
export async function hasMovedAwayFrom(userId: string, email: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: accountDeletionCodesTable.id })
      .from(accountDeletionCodesTable)
      .where(and(
        eq(accountDeletionCodesTable.userId, userId),
        eq(accountDeletionCodesTable.codeHash, movedAwayHash(email)),
      ))
      .limit(1);
    return Boolean(row);
  } catch (error) {
    logger.error({ err: error }, "Could not check for a moved-away email; signing in as before");
    return false;
  }
}
