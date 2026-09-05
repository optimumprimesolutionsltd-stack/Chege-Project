import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { updateDisplayName, updateProfilePhoto, type AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  login: () => void;
  logout: () => void;
  retry: () => void;
  /**
   * Take up a session that has just been created by signing in with an email
   * and password, without reloading the page.
   *
   * The endpoint that created the session already answered with the user, so
   * there is nothing left to ask the server. Reloading instead would re-parse
   * the whole application bundle and re-request /api/auth/user for an answer
   * we are holding - seconds of waiting, on the slowest connections, to learn
   * something already known.
   */
  adoptSession: (user: AuthUser) => void;
  saveDisplayName: (name: string) => Promise<void>;
  saveProfilePhoto: (photoPath: string | null) => Promise<void>;
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}

export const PUBLIC_HOME_PATH = '/';

export function getAuthDonePath(basePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  return base ? `${base}/auth-done` : '/auth-done';
}

export function getLogoutReturnPath(): string {
  return PUBLIC_HOME_PATH;
}

export function getLogoutUrl(): string {
  return `/api/logout?returnTo=${encodeURIComponent(getLogoutReturnPath())}`;
}

let authRequest: Promise<AuthUser | null> | null = null;

function getCurrentUser(): Promise<AuthUser | null> {
  if (!authRequest) {
    authRequest = fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => data.user ?? null)
      .catch((error) => {
        authRequest = null;
        throw error;
      });
  }
  return authRequest;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    getCurrentUser()
      .then((nextUser) => {
        if (!cancelled) {
          setUser(nextUser);
          setIsLoading(false);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setUser(null);
          setError(nextError instanceof Error ? nextError : new Error('Could not check your account.'));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const login = useCallback(() => {
    const base = getBasePath();
    // Use a dedicated close page so the popup auto-closes after auth completes.
    const returnTo = getAuthDonePath(base);
    const url = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;

    // Open login in a popup so the OAuth redirect runs in a real top-level
    // window. This avoids the "missing initial state" / sessionStorage
    // partitioning error that occurs when the flow runs inside an iframe.
    const popup = window.open(url, 'auth-popup', 'width=520,height=640,left=200,top=100');
    if (!popup) {
      // Popup blocked — fall back to top-level navigation.
      (window.top ?? window).location.href = url;
      return;
    }

    // Listen for the auth-done page's postMessage.
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'auth_complete') {
        cleanup();
        window.location.reload();
      }
    };
    // Also poll in case postMessage is blocked (e.g. popup already closed).
    const interval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        window.location.reload();
      }
    }, 500);

    function cleanup() {
      clearInterval(interval);
      window.removeEventListener('message', onMessage);
    }
    window.addEventListener('message', onMessage);
  }, []);

  const logout = useCallback(() => {
    // Leaving the authenticated app should take the person back to Jamvi's
    // public homepage, not reopen the last in-app screen.
    (window.top ?? window).location.href = getLogoutUrl();
  }, []);

  const retry = useCallback(() => {
    // A cached rejection clears itself, but a cached "nobody is signed in"
    // does not, so retry alone would keep re-reading the same answer.
    authRequest = null;
    setRetryCount((count) => count + 1);
  }, []);

  const adoptSession = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    // The module-level cache is what a page reload used to clear. Seeding it
    // keeps the next reader - a remount, or anything calling getCurrentUser -
    // from resolving to the signed-out answer it happens to be holding.
    authRequest = Promise.resolve(nextUser);
  }, []);

  const saveDisplayName = useCallback(async (name: string) => {
    const response = await updateDisplayName({ name });
    if (!response.user) {
      throw new Error('Could not save your name.');
    }
    setUser(response.user);
    authRequest = Promise.resolve(response.user);
  }, []);

  const saveProfilePhoto = useCallback(async (photoPath: string | null) => {
    const response = await updateProfilePhoto({ photoPath });
    if (!response.user) {
      throw new Error('Could not save your photo.');
    }
    setUser(response.user);
    authRequest = Promise.resolve(response.user);
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    retry,
    adoptSession,
    saveDisplayName,
    saveProfilePhoto,
  }), [user, isLoading, error, login, logout, retry, adoptSession, saveDisplayName, saveProfilePhoto]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return auth;
}
