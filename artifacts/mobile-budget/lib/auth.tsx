import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { AuthUser } from '@workspace/api-client-react';

WebBrowser.maybeCompleteAuthSession();

export const AUTH_TOKEN_KEY = 'auth_session_token';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loginResolveRef = useRef<(() => void) | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        setUser(null);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      if (data.user) {
        setUser(data.user as AuthUser);
      } else {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Listen for deep link callbacks: mobile-budget://auth?token=SESSION_TOKEN
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      if (parsed.path === 'auth' && parsed.queryParams?.token) {
        const token = parsed.queryParams.token as string;
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
        // Dismiss the browser
        await WebBrowser.dismissBrowserAsync().catch(() => {});
        // Resolve the pending login promise
        if (loginResolveRef.current) {
          loginResolveRef.current();
          loginResolveRef.current = null;
        }
        setIsLoading(true);
        await fetchUser();
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // Also check the initial URL in case the app was cold-started from the deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, [fetchUser]);

  const login = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      console.error('API base URL not configured');
      return;
    }

    await new Promise<void>((resolve) => {
      loginResolveRef.current = resolve;
      WebBrowser.openBrowserAsync(`${apiBase}/api/mobile-login`, {
        showTitle: false,
        enableDefaultShareMenuItem: false,
      }).then(() => {
        // Browser was dismissed (user closed it manually)
        if (loginResolveRef.current) {
          loginResolveRef.current();
          loginResolveRef.current = null;
        }
      });
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/mobile-auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // swallow
    } finally {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
