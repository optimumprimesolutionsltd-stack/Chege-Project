import crypto from 'crypto';
import { db, sessionsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { type Request, type Response } from 'express';
import * as client from 'openid-client';
import { type AuthUser } from '@workspace/api-zod';

export { type AuthUser };

export type AuthProvider = 'replit' | 'google';

const DEFAULT_ISSUER: Record<AuthProvider, string> = {
  replit: 'https://replit.com/oidc',
  google: 'https://accounts.google.com',
};

// Replit Auth only works inside a Repl, and Google only works once an OAuth
// client exists. Selecting per environment lets the Repl stay a working
// development environment while production runs on Google, both against the
// same users table.
function resolveProvider(): AuthProvider {
  const explicit = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  if (explicit === 'replit' || explicit === 'google') return explicit;
  // Every Repl has REPL_ID set, so an unconfigured Repl keeps its current
  // behaviour and anywhere else defaults to Google.
  return process.env.REPL_ID ? 'replit' : 'google';
}

export const AUTH_PROVIDER: AuthProvider = resolveProvider();
export const ISSUER_URL =
  process.env.ISSUER_URL ?? DEFAULT_ISSUER[AUTH_PROVIDER];
export const SESSION_COOKIE = 'sid';
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || expected.length !== 128) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfig) return oidcConfig;

  if (AUTH_PROVIDER === 'replit') {
    const replId = process.env.REPL_ID;
    if (!replId) {
      throw new Error(
        'REPL_ID must be set to use Replit Auth. Set AUTH_PROVIDER=google to ' +
          'sign in with Google instead.',
      );
    }
    // Replit Auth is a public client: the Repl id is the client id and there
    // is no secret, so PKCE alone secures the code exchange.
    oidcConfig = await client.discovery(new URL(ISSUER_URL), replId);
    return oidcConfig;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to sign in with ' +
        'Google.',
    );
  }
  oidcConfig = await client.discovery(
    new URL(ISSUER_URL),
    clientId,
    clientSecret,
  );
  return oidcConfig;
}

// Google only returns a refresh token when offline access is requested and
// consent is forced, and authMiddleware signs a user out when a session has no
// refresh token - so without these, Google logins would drop roughly hourly.
// Replit must not be sent a prompt value at all; forcing one there re-prompts
// for consent on every sign-in.
export function authorizationParams(): Record<string, string> {
  if (AUTH_PROVIDER === 'google') {
    return { access_type: 'offline', prompt: 'select_account consent' };
  }
  return {};
}

// Replit publishes an end_session_endpoint and expects a round trip through it.
// Google publishes none, so there is nowhere to send the browser: dropping the
// session row and cookie is the whole logout, and the person's Google session
// is deliberately left alone.
export function buildProviderLogoutUrl(
  config: client.Configuration,
  postLogoutRedirectUrl: string,
): URL | null {
  if (AUTH_PROVIDER !== 'replit') return null;
  return client.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}
