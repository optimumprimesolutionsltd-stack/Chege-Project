import { z } from 'zod';
import { UpdateDisplayNameBody } from './display-name-schema';

const GetCurrentAuthUserResponse = z.object({
  user: z
    .object({
      id: z.string(),
      email: z.string().nullable().optional(),
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
      profileImageUrl: z.string().nullable().optional(),
      needsDisplayName: z.boolean(),
    })
    .nullable(),
});

const ExchangeMobileAuthorizationCodeBody = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  nonce: z.string().nullable().optional(),
});

const ExchangeMobileAuthorizationCodeResponse = z.object({ token: z.string() });
const LogoutMobileSessionResponse = z.object({ success: z.boolean() });
import { createHash, randomBytes } from 'node:crypto';
import { db, passwordResetTokensTable, usersTable } from '@workspace/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { verifyPhotoObject } from '../lib/photoStorage';
import { Router, type IRouter, type Request, type Response } from 'express';
import * as oidc from 'openid-client';

import {
  authorizationParams,
  buildProviderLogoutUrl,
  clearSession,
  createSession,
  deleteSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  hashPassword,
  verifyPassword,
} from '../lib/auth';
import { clearActiveWorkspaceCookie } from '../lib/activeGroup';
import { resolvePhotoUrl } from '../lib/photoStorage';
import { resolveOrigin } from '../lib/requestOrigin.js';
import { ensureTrialSubscription } from "../lib/subscription-catalog";
import { sendEmail } from '../lib/email';

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
/** A reset link is good for an hour: long enough to find the email, short
 *  enough that an old one in an inbox is not a standing key to the account. */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const router: IRouter = Router();
const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase("en-US");

async function authUserPayload(user: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  profileImageUrl: string | null;
  customProfilePhotoPath: string | null;
}) {
  let customPhotoUrl: string | null = null;
  try {
    customPhotoUrl = await resolvePhotoUrl(user.customProfilePhotoPath);
  } catch {
    // A failed image URL must not prevent an authenticated person from opening Jamvi.
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.preferredName ?? user.firstName,
    lastName: user.preferredName ? null : user.lastName,
    profileImageUrl: customPhotoUrl ?? user.profileImageUrl,
    needsDisplayName: !user.preferredName,
  };
}

function getOrigin(req: Request): string {
  return resolveOrigin(req.headers);
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OIDC_COOKIE_TTL,
  });
}

const CredentialBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});
const RegisterBody = CredentialBody.extend({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
});

function localAuthUser(user: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  profileImageUrl: string | null;
}): SessionData['user'] {
  return {
    id: user.id,
    email: user.email,
    firstName: user.preferredName ?? user.firstName,
    lastName: user.preferredName ? null : user.lastName,
    profileImageUrl: user.profileImageUrl,
    needsDisplayName: !user.preferredName,
  };
}

async function startLocalSession(res: Response, user: Parameters<typeof localAuthUser>[0]) {
  const sid = await createSession({ user: localAuthUser(user), access_token: 'local-password' });
  clearActiveWorkspaceCookie(res);
  setSessionCookie(res, sid);
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorStatus(
  value: Record<string, unknown>,
): number | string | undefined {
  if (typeof value.status === 'number' || typeof value.status === 'string') {
    return value.status;
  }
  if (
    typeof value.statusCode === 'number' ||
    typeof value.statusCode === 'string'
  ) {
    return value.statusCode;
  }
  return undefined;
}

function getSafeErrorMetadata(error: unknown) {
  if (!isRecord(error)) {
    return { errorName: typeof error };
  }

  const errorStatus = getErrorStatus(error);
  const causeStatus = isRecord(error.cause)
    ? getErrorStatus(error.cause)
    : undefined;

  return {
    errorName: error instanceof Error ? error.name : 'Error',
    errorStatus: errorStatus ?? causeStatus,
  };
}

export async function upsertUser(claims: Record<string, unknown>) {
  const rawEmail = (claims.email as string) || "";
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  const profile = {
    email,
    // Google OIDC uses given_name / family_name; fall back to first_name /
    // last_name in case a different provider uses those keys.
    firstName:
      ((claims.given_name as string) || (claims.first_name as string)) || null,
    lastName:
      ((claims.family_name as string) || (claims.last_name as string)) || null,
    profileImageUrl:
      ((claims.picture || claims.profile_image_url) as string) || null,
  };

  // Identity details can refresh on sign-in, but a person's chosen household
  // name must remain theirs, so re-login never overwrites first/last name.
  const refreshable = {
    email: profile.email,
    profileImageUrl: profile.profileImageUrl,
    updatedAt: new Date(),
  };

  // Identity is matched on email rather than the provider's `sub`. Expenses,
  // contributions, members and savings goals all store bare user id strings
  // with no foreign keys, so an account that keeps its original id keeps its
  // history — switching identity provider must not orphan those rows.
  if (email) {
    const existing = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });

    if (existing) {
      const [updated] = await db
        .update(usersTable)
        .set(refreshable)
        .where(eq(usersTable.id, existing.id))
        .returning();
      return updated;
    }
  }

  const [user] = await db
    .insert(usersTable)
    .values({ id: claims.sub as string, ...profile })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: refreshable,
    })
    .returning();
  await ensureTrialSubscription(user.id);
  return user;
}

router.post('/auth/register', async (req: Request, res: Response) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Enter valid details.' });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash: hashPassword(parsed.data.password),
    preferredName: parsed.data.name,
    firstName: parsed.data.name,
  }).returning();
  await ensureTrialSubscription(user.id);
  await startLocalSession(res, user);
  res.json({ user: await authUserPayload(user) });
});

router.post('/auth/password-login', async (req: Request, res: Response) => {
  const parsed = CredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid email and password.' });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user?.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  await ensureTrialSubscription(user.id);
  await startLocalSession(res, user);
  res.json({ user: await authUserPayload(user) });
});

/**
 * Forgotten password, step one: ask for a link.
 *
 * Always answers the same way, whether or not the address has an account.
 * Saying "no such user" turns this endpoint into a way to discover who banks
 * with Jamvi, and for a money app that list is worth having.
 */
router.post('/auth/forgot-password', async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(320) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const sameAnswer = {
    message: 'If that email has a Jamvi account, a reset link is on its way.',
  };

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  // An account created through Google has no password to reset. Telling them
  // so here would leak that the address exists, so the answer is unchanged and
  // the email simply is not sent.
  if (!user?.passwordHash) {
    res.json(sameAnswer);
    return;
  }

  const token = randomBytes(32).toString('hex');
  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  // The app is mounted under /app; a bare /reset-password falls through to the
  // marketing site's catch-all and shows its 404 page.
  const base = process.env.APP_URL?.trim().replace(/\/+$/, '') || getOrigin(req);
  const link = `${base}/app/reset-password?token=${token}`;
  try {
    await sendEmail({
      from: process.env.INVITATION_FROM_EMAIL ?? process.env.DIGEST_FROM_EMAIL ?? 'Jamvi <onboarding@resend.dev>',
      to: [email],
      subject: 'Reset your Jamvi password',
      html: `<p>Hi${user.firstName ? ` ${user.firstName}` : ''},</p>`
        + `<p>Use this link to choose a new password. It works once and expires in an hour.</p>`
        + `<p><a href="${link}">Reset my password</a></p>`
        + `<p>If you did not ask for this, you can ignore this email — your password has not changed.</p>`,
    });
  } catch (error) {
    // The answer stays the same either way. A failure here is ours to see in
    // the logs, not something to report back to an unauthenticated caller.
    req.log.error({ err: error }, 'Could not send a password reset email');
  }

  res.json(sameAnswer);
});

/**
 * Forgotten password, step two: spend the link.
 *
 * The token is claimed with a conditional update, so two requests racing with
 * the same link cannot both succeed.
 */
router.post('/auth/reset-password', async (req: Request, res: Response) => {
  const parsed = z.object({
    token: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'That reset link is not valid.'),
    password: z.string().min(8, 'Use at least 8 characters.').max(200),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the link and try again.' });
    return;
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const now = new Date();

  const claimed = await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(and(
      eq(passwordResetTokensTable.tokenHash, tokenHash),
      isNull(passwordResetTokensTable.usedAt),
      gt(passwordResetTokensTable.expiresAt, now),
    ))
    .returning({ userId: passwordResetTokensTable.userId });

  if (claimed.length === 0) {
    res.status(400).json({
      error: 'That reset link has expired or has already been used. Ask for a new one.',
    });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(parsed.data.password) })
    .where(eq(usersTable.id, claimed[0].userId))
    .returning();

  // Any other outstanding link is now void: someone resetting a password they
  // fear was compromised should not leave a second working link behind.
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(and(
      eq(passwordResetTokensTable.userId, claimed[0].userId),
      isNull(passwordResetTokensTable.usedAt),
    ));

  await ensureTrialSubscription(user.id);
  await startLocalSession(res, user);
  res.json({ user: await authUserPayload(user) });
});

router.get('/auth/user', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  // Always fetch fresh user data from DB — session snapshots can be stale
  // (e.g. firstName/lastName added after the session was first created).
  const [dbUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      preferredName: usersTable.preferredName,
      profileImageUrl: usersTable.profileImageUrl,
      customProfilePhotoPath: usersTable.customProfilePhotoPath,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);
  if (!dbUser) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: await authUserPayload(dbUser),
    }),
  );
});

router.put('/auth/display-name', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = UpdateDisplayNameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid name.' });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({
      preferredName: parsed.data.name,
      // Mirror the chosen name into firstName so household activity and member
      // lists use the same friendly name without a separate lookup strategy.
      firstName: parsed.data.name,
      lastName: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.user.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(
    GetCurrentAuthUserResponse.parse({
      user: { ...(await authUserPayload(user)), needsDisplayName: false },
    }),
  );
});

router.put('/auth/profile-photo', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { UpdateProfilePhotoBody, UpdateProfilePhotoResponse } = await import('@workspace/api-zod');
  const parsed = UpdateProfilePhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Choose a valid uploaded photo.' });
    return;
  }

  if (parsed.data.photoPath) {
    try {
      await verifyPhotoObject(parsed.data.photoPath);
    } catch {
      res.status(400).json({ error: 'The uploaded photo could not be verified. Please upload it again.' });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set({ customProfilePhotoPath: parsed.data.photoPath, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(UpdateProfilePhotoResponse.parse({ user: await authUserPayload(user) }));
});

router.get('/login', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...authorizationParams(),
    state,
    nonce,
  });

  setOidcCookie(res, 'code_verifier', codeVerifier);
  setOidcCookie(res, 'nonce', nonce);
  setOidcCookie(res, 'state', state);
  setOidcCookie(res, 'return_to', returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get('/callback', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect('/api/login');
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect('/api/login');
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie('code_verifier', { path: '/' });
  res.clearCookie('nonce', { path: '/' });
  res.clearCookie('state', { path: '/' });
  res.clearCookie('return_to', { path: '/' });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect('/api/login');
    return;
  }

  const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      needsDisplayName: !dbUser.preferredName,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  // Selection is browser-session scoped. Do not assume a Personal workspace:
  // shared-only people must select one after a new web sign-in.
  clearActiveWorkspaceCookie(res);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

// Mobile login — opens in browser, redirects back to app via deep link after auth
router.get('/mobile-login', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...authorizationParams(),
    state,
    nonce,
  });

  setOidcCookie(res, 'code_verifier', codeVerifier);
  setOidcCookie(res, 'nonce', nonce);
  setOidcCookie(res, 'state', state);
  setOidcCookie(res, 'return_to', '/api/mobile-auth/complete');

  res.redirect(redirectTo.href);
});

// After successful auth, redirect to the app deep link with the session token
router.get('/mobile-auth/complete', (req: Request, res: Response) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) {
    res.status(401).send('No session found. Please try signing in again.');
    return;
  }
  res.redirect(`mobile-budget://auth?token=${encodeURIComponent(sid)}`);
});

router.get('/logout', async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;

  const sid = getSessionId(req);
  await clearSession(res, sid);
  clearActiveWorkspaceCookie(res);

  const config = await getOidcConfig();
  const providerLogout = buildProviderLogoutUrl(config, postLogoutRedirectUrl);

  res.redirect(providerLogout ? providerLogout.href : postLogoutRedirectUrl);
});

router.post(
  '/mobile-auth/token-exchange',
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required parameters' });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set('code', code);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('iss', ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: 'No claims in ID token' });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
          needsDisplayName: !dbUser.preferredName,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error(getSafeErrorMetadata(err), 'Mobile token exchange error');
      res.status(500).json({ error: 'Token exchange failed' });
    }
  },
);

router.post('/mobile-auth/logout', async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
