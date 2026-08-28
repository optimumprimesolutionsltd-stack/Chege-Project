import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { AuthUser } from '@workspace/api-client-react';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace';

WebBrowser.maybeCompleteAuthSession();

export const AUTH_TOKEN_KEY = 'auth_session_token';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  saveDisplayName: (name: string) => Promise<void>;
  saveProfilePhoto: (photoPath: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  saveDisplayName: async () => {},
  saveProfilePhoto: async () => {},
});

// Compiled into the binary: an installed app calls whatever host was baked in
// at build time, regardless of what the server does afterwards. This pointed at
// the Replit deployment, which is being retired - an APK carrying it would have
// stopped signing anyone in the day that deployment was deleted, recoverable
// only by a store update. Verify before every release.
const PRODUCTION_API = 'https://jamvi.co.ke';

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return PRODUCTION_API;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        // Keep the last selection across cold starts. RootLayout verifies this
        // preference against the freshly loaded membership list before any
        // financial screen renders, while explicit logout clears it below.
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

  // Handle cold-start deep link (app opened directly from mobile-budget:// URL)
  useEffect(() => {
    const handleUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      if (parsed.hostname === 'auth' && parsed.queryParams?.token) {
        const token = parsed.queryParams.token as string;
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
        setIsLoading(true);
        await fetchUser();
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
  }, [fetchUser]);

  const login = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      console.error('API base URL not configured');
      return;
    }

    // openAuthSessionAsync uses Chrome Custom Tabs on Android — it handles the
    // redirect back to the app internally so no "Open with…" disambiguation
    // dialog appears. The result URL is returned directly.
    const result = await WebBrowser.openAuthSessionAsync(
      `${apiBase}/api/mobile-login`,
      'mobile-budget://',
      { showInRecents: false },
    );

    if (result.type === 'success' && result.url) {
      const parsed = Linking.parse(result.url);
      if (parsed.hostname === 'auth' && parsed.queryParams?.token) {
        const token = parsed.queryParams.token as string;
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
        setIsLoading(true);
        await fetchUser();
      }
    }
  }, [fetchUser]);

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
      await AsyncStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      setUser(null);
    }
  }, []);

  const saveDisplayName = useCallback(async (name: string) => {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (!token) throw new Error('Your sign-in session has expired.');

    const response = await fetch(`${getApiBaseUrl()}/api/auth/display-name`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Could not save your name.');
    }

    const data = await response.json();
    setUser(data.user as AuthUser);
  }, []);

  const saveProfilePhoto = useCallback(async (photoPath: string | null) => {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (!token) throw new Error('Your sign-in session has expired.');

    const response = await fetch(`${getApiBaseUrl()}/api/auth/profile-photo`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ photoPath }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || 'Could not save your photo.');
    }
    const data = await response.json();
    setUser(data.user as AuthUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, saveDisplayName, saveProfilePhoto }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
