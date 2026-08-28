import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, View } from 'react-native';
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
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import {
  getGetWorkspacesQueryKey,
  setBaseUrl,
  setAuthTokenGetter,
  setWorkspaceIdGetter,
  useGetWorkspaces,
} from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { AuthProvider, useAuth, AUTH_TOKEN_KEY } from '@/lib/auth';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  hasValidMobileWorkspaceSelection,
  isMobileBudgetChooserComplete,
  mobileBudgetEntryRedirect,
} from '@/lib/workspace';

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
            : 'A new version of Jamvi is ready with the latest improvements and fixes.';
        setUpdateMessage(message);
      } catch {
        // Network unavailable or server error — silently ignore.
      }
    })();
  }, []);

  return { updateMessage, dismiss: () => setUpdateMessage(null) };
}

// Configure API client at module level — must be before any component renders.
// Fall back to the production API so calls never silently fail if
// EXPO_PUBLIC_DOMAIN is absent from an OTA bundle (it is baked in at export time).
//
// This value is compiled into the binary: an installed app keeps calling
// whatever host was baked in at build time, whatever the server does later. It
// pointed at the Replit deployment, which is being retired — an APK built from
// that would have broken the day it was deleted, with no fix but a store
// update. Check it before every store release.
const PRODUCTION_API_BASE = 'https://jamvi-api.onrender.com';
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
  const segments = useSegments();
  const currentRoute = segments[0];
  const isTabsRoute = segments[0] === '(tabs)';
  const isTabsHome = isTabsRoute && segments.length === 1;
  const allowWebExitRef = useRef(false);
  const [checkingChooser, setCheckingChooser] = useState(true);
  const {
    data: workspaces = [],
    isLoading: loadingWorkspaces,
  } = useGetWorkspaces({
    query: {
      queryKey: getGetWorkspacesQueryKey(),
      enabled: isAuthenticated && !!user?.id && !user?.needsDisplayName,
    },
  });

  // Keep Android's hardware back action inside Jamvi. A back press from a
  // tab returns to the beginning instead of closing the app unexpectedly;
  // a second press from Home requires an explicit exit choice.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isAuthenticated || !isTabsRoute) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isTabsHome) {
        router.replace('/(tabs)');
        return true;
      }

      Alert.alert(
        'You’re at Home',
        'This is the beginning of Jamvi.',
        [
          { text: 'Stay in Jamvi', style: 'cancel' },
          { text: 'Exit Jamvi', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
      );
      return true;
    });

    return () => subscription.remove();
  }, [isAuthenticated, isTabsHome, isTabsRoute]);

  // Expo web runs inside the phone browser, so React Native's BackHandler is
  // not involved. Keep browser Back inside the app and ask before leaving
  // Jamvi from its Home screen.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isAuthenticated || !isTabsRoute || typeof window === 'undefined') return;

    const homeUrl = window.location.href;
    const guardState = { ...(window.history.state ?? {}), jamviHomeGuard: true };
    window.history.pushState(guardState, '', homeUrl);

    const handlePopState = () => {
      if (allowWebExitRef.current) {
        allowWebExitRef.current = false;
        return;
      }

      if (!isTabsHome) {
        router.replace('/(tabs)');
        return;
      }

      const leave = window.confirm(
        'You are at the beginning of Jamvi. Do you want to leave the application?',
      );
      if (leave) {
        allowWebExitRef.current = true;
        window.history.back();
        return;
      }
      window.history.pushState(guardState, '', homeUrl);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated, isTabsHome, isTabsRoute]);

  // Re-fetch all data the moment the user signs in so queries that ran
  // before auth completed (with no token) get a fresh attempt.
  useEffect(() => {
    if (isAuthenticated) {
      queryClient.invalidateQueries();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    if (isLoading) {
      setCheckingChooser(true);
      return () => { active = false; };
    }
    if (!isAuthenticated) {
      setCheckingChooser(false);
      router.replace('/login');
      return () => { active = false; };
    }
    if (user?.needsDisplayName) {
      setCheckingChooser(false);
      router.replace('/profile-setup');
      return () => { active = false; };
    }
    if (!user?.id) return () => { active = false; };

    setCheckingChooser(true);
    if (loadingWorkspaces) return () => { active = false; };
    void Promise.all([
      isMobileBudgetChooserComplete({ userId: user.id, storage: AsyncStorage }),
      hasValidMobileWorkspaceSelection({ storage: AsyncStorage, workspaces }),
    ])
      .then(([chooserComplete, hasValidSelection]) => {
        if (!active) return;
        const destination = mobileBudgetEntryRedirect({
          chooserComplete: chooserComplete && hasValidSelection,
          currentRoute,
        });
        if (destination) router.replace(destination);
      })
      .finally(() => {
        if (active) setCheckingChooser(false);
      });
    return () => { active = false; };
  }, [isLoading, isAuthenticated, user?.id, user?.needsDisplayName, currentRoute, loadingWorkspaces, workspaces]);

  if (isLoading || checkingChooser) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#011C4E',
        }}
      >
        <ActivityIndicator size="large" color="#FDBB0A" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
        <Stack.Screen name="budget-chooser" options={{ gestureEnabled: false }} />
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
