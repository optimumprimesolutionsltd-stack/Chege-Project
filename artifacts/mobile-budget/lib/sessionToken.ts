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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Secure storage either answers - with the token, or with nothing saved - or
 * fails. A failure is not "signed out": Android's key store can refuse for a
 * moment, notably when the app has just been restarted after the phone closed
 * it in the background (opening the file picker, or the password SMS, during
 * an import). It is asked again a few times before anything is concluded.
 */
async function readStore(): Promise<{ token: string | null; failed: boolean }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token || attempt >= 1) return { token, failed: false };
    } catch {
      // Tried again below.
    }
    await pause(150 * (attempt + 1));
  }
  return { token: null, failed: true };
}

/** The token, and whether the phone could not be asked for it at all. */
export async function readSessionTokenState(): Promise<{ token: string | null; failed: boolean }> {
  if (cached) return { token: cached, failed: false };
  const state = await readStore();
  if (state.token) cached = state.token;
  return state;
}

export async function readSessionToken(): Promise<string | null> {
  return (await readSessionTokenState()).token;
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
      const { token, failed } = await readSessionTokenState();
      // The phone could not be asked: that says nothing about the session.
      if (failed) return false;
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
