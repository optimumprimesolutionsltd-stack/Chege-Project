import { type NextFunction, type Request, type Response } from 'express';
import * as oidc from 'openid-client';

import {
  clearSession,
  getOidcConfig,
  getSession,
  getSessionId,
  touchSession,
  updateSession,
  type AuthUser,
  type SessionData,
} from '../lib/auth';

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
      group?: {
        id: number;
        role: "owner" | "admin" | "member" | "viewer";
        isPrivate: boolean;
      };
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

/**
 * Renews the sign-in provider's access token when it has run out, when it can.
 *
 * Jamvi never uses that token after sign-in - it only proved who the person
 * was - and the Jamvi session has its own life (SESSION_TTL, renewed as it is
 * used). So a token that cannot be renewed is no reason to end the session.
 * It used to be: an hour after a Google sign-in, the first request with no
 * refresh token, or one Google hiccup while a statement import sent thousands
 * of requests, deleted the session and signed the person out mid-import.
 */
async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return session;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return session;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request['isAuthenticated'];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  // Seven days from the last use, not from sign-in.
  void touchSession(sid);

  req.user = refreshed.user;
  next();
}
