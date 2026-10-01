import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'auth_session_token';

/**
 * The one place the sign-in token is read, written and removed.
 *
 * Every API request asks for the token. It used to read secure storage each
 * time, and a long statement import sends thousands of requests: one read that
 * came back empty sent a request unsigned, the server answered 401, and the
 * app treated that as the session ending - signing the person out mid-import.
 * The token is now kept in memory after the first read, and an empty read is
 * tried once more before it is believed.
 */
let cached: string | null = null;

async function readStore(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function readSessionToken(): Promise<string | null> {
  if (cached) return cached;
  const token = (await readStore()) ?? (await readStore());
  if (token) cached = token;
  return token;
}

export async function writeSessionToken(token: string): Promise<void> {
  cached = token;
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

let checking: Promise<boolean> | null = null;

/**
 * Asks the server whether the session has really gone. One 401 from one
 * request is not proof - it may have been sent without the token - so the
 * person is signed out only when the session check itself finds no user.
 * A failed or unreachable check keeps them signed in. Concurrent 401s share
 * one check.
 */
export function sessionHasEnded(apiBase: string): Promise<boolean> {
  checking ??= (async () => {
    try {
      const token = await readSessionToken();
      if (!token) return true;
      const res = await fetch(`${apiBase}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return true;
      if (!res.ok) return false;
      // Signed out, the server answers 200 with { user: null }.
      const body = (await res.json()) as { user?: unknown };
      return body?.user == null;
    } catch {
      return false;
    } finally {
      checking = null;
    }
  })();
  return checking;
}

/** Tests only. */
export function __resetSessionTokenForTests(): void {
  cached = null;
  checking = null;
}
