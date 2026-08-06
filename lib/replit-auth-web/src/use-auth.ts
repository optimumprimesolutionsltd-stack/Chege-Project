import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const base = getBasePath();
    const url = `/api/login?returnTo=${encodeURIComponent(base)}`;
    // Navigate the top-level window so OAuth redirects aren't trapped inside
    // an iframe (e.g. Replit preview pane), which would partition sessionStorage
    // and cause "missing initial state" errors from the OIDC provider.
    (window.top ?? window).location.href = url;
  }, []);

  const logout = useCallback(() => {
    const base = getBasePath();
    const url = `/api/logout?returnTo=${encodeURIComponent(base)}`;
    (window.top ?? window).location.href = url;
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
