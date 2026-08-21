import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { setBaseUrl, setAuthTokenGetter, setWorkspaceIdGetter } from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { AuthProvider, useAuth, AUTH_TOKEN_KEY } from '@/lib/auth';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace';

// Check for OTA updates and show an update prompt when one is available.
// Skipped in development (Expo Go / dev-client) where Updates is not active.
// Returns state consumed by RootLayout to render the <UpdatePrompt> overlay.
function useUpdatePrompt() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        // Pull the message from the EAS Update manifest (set via --message flag).
        // The field is present at runtime even though it is not typed on the manifest type.
        const manifest = result.manifest as Record<string, unknown> | undefined;
        const metadata = manifest?.metadata as Record<string, unknown> | undefined;
        const raw = metadata?.message;
        const message =
          typeof raw === 'string' && raw.trim()
            ? raw.trim()
            : 'A new version of Bajeti is ready with the latest improvements and fixes.';
        setUpdateMessage(message);
      } catch {
        // Network unavailable or server error — silently ignore.
      }
    })();
  }, []);

  return { updateMessage, dismiss: () => setUpdateMessage(null) };
}

// Configure API client at module level — must be before any component renders.
// Fall back to the production domain so API calls never silently fail if
// EXPO_PUBLIC_DOMAIN is absent from an OTA bundle (it is baked in at export time).
const PRODUCTION_API_BASE = 'https://delete-project.replit.app';
const domain = process.env.EXPO_PUBLIC_DOMAIN;
setBaseUrl(domain ? `https://${domain}` : PRODUCTION_API_BASE);
setAuthTokenGetter(() => SecureStore.getItemAsync(AUTH_TOKEN_KEY));
setWorkspaceIdGetter(() => AsyncStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY));

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: async (error) => {
      // When any query gets a 401, the session has expired.
      // Clear the stored token and redirect to login so the user is never
      // left staring at a form with missing fields (e.g. no PAID BY section).
      if (error instanceof ApiError && error.status === 401) {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        router.replace('/login');
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Never retry 401s — the session is gone, retrying won't help.
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});

function RootLayoutNav() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Re-fetch all data the moment the user signs in so queries that ran
  // before auth completed (with no token) get a fresh attempt.
  useEffect(() => {
    if (isAuthenticated) {
      queryClient.invalidateQueries();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.needsDisplayName) {
        router.replace('/profile-setup');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isLoading, isAuthenticated, user?.needsDisplayName]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f2217',
        }}
      >
        <ActivityIndicator size="large" color="#cf7217" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="add-expense"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.85, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const { updateMessage, dismiss } = useUpdatePrompt();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
      {/* Update prompt — rendered outside QueryClientProvider so it works even
          before the user is authenticated, and outside ErrorBoundary so a
          render error in the main tree doesn't swallow the prompt. */}
      {updateMessage && (
        <UpdatePrompt message={updateMessage} onDismiss={dismiss} />
      )}
    </SafeAreaProvider>
  );
}
