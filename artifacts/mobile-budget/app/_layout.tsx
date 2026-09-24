import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Platform } from 'react-native';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { FeedbackModal } from '@/components/FeedbackModal';
import { AppLoading } from '@/components/AppLoading';
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  recordAppLaunch,
  shouldShowFeedbackPrompt,
} from '@/lib/feedbackPrompt';
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
import { useEntitlements } from '@/hooks/useEntitlements';
import { readPlanChoice, shouldShowPlanChoice } from '@/lib/planChoice';
import { consumeResumePoint } from '@/lib/resumeAfterUpdate';
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
import { AppearanceProvider } from '@/hooks/useAppearance';
import { hydrateQueryClient, startPersistingQueryClient } from '@/lib/queryPersist';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  hasValidMobileWorkspaceSelection,
  isMobileBudgetChooserComplete,
  mobileBudgetEntryRedirect,
} from '@/lib/workspace';

// How long to leave between checks, so a quick switch to WhatsApp and back
// does not ask Expo about updates every few seconds.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Check for OTA updates and show an update prompt when one is available.
// Skipped in development (Expo Go / dev-client) where Updates is not active.
// Returns state consumed by RootLayout to render the <UpdatePrompt> overlay.
function useUpdatePrompt() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const lastCheckedAt = useRef(0);
  // Read inside the listener without making it a dependency, so subscribing
  // does not tear down and re-subscribe every time the message changes.
  const showing = useRef(false);
  showing.current = updateMessage !== null;

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    if (showing.current) return;
    const now = Date.now();
    if (now - lastCheckedAt.current < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheckedAt.current = now;
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
  }, []);

  useEffect(() => {
    void check();

    // Nobody force-quits a phone app. Checking only on mount meant the prompt
    // appeared solely after a genuinely cold start — so somebody who leaves
    // Jamvi open and comes back to it was never offered an update at all, and
    // published OTAs looked as though they had not shipped. Ask again whenever
    // the app returns to the foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  return { updateMessage, dismiss: () => setUpdateMessage(null) };
}

// Configure API client at module level — must be before any component renders.
// Fall back to the production API so calls never silently fail if
// EXPO_PUBLIC_DOMAIN is absent from an OTA bundle (it is baked in at export time).
//
// This value is compiled into the binary: an installed app keeps calling
// whatever host was baked in at build time, whatever the server does later.
// So it points at the custom domain, never a generated Render hostname: those
// belong to a specific service and disappear with it. Check it before every
// store release.
const PRODUCTION_API_BASE = 'https://jamvi.co.ke';
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
        // A phone loses its connection constantly: in a lift, on a matatu,
        // switching from wifi to data. One retry was not enough, and a query
        // that gave up left a screen stuck on "couldn't load, tap to retry"
        // until somebody noticed the link. A 4xx other than 401 is an answer,
        // not a blip, so it is not retried.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      // The commonest fix for a failed load on a phone is simply being back on
      // the network, or coming back to the screen. Neither should need a tap.
      refetchOnReconnect: true,
      staleTime: 30_000,
    },
  },
});

// A stable empty array for the disabled-query default. `data ?? []` would hand
// back a fresh array every render, and this value is a dependency of the
// routing effect below — a new reference each render re-fired that effect,
// which calls router.replace, which re-rendered, which… blank-screen flicker
// on every launch.
const NO_WORKSPACES: never[] = [];

function RootLayoutNav() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const currentRoute = segments[0];
  const isTabsRoute = segments[0] === '(tabs)';
  const isTabsHome = isTabsRoute && segments.length === 1;
  const allowWebExitRef = useRef(false);
  const [checkingChooser, setCheckingChooser] = useState(true);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const feedbackCheckedRef = useRef(false);

  // Landing on Home, authenticated, is the one moment guaranteed not to
  // interrupt something the person was in the middle of — never mid-onboarding,
  // mid-expense, or mid-anything else. Checked once per cold start: a launch
  // is the process starting, not every time Home happens to be visited again
  // in the same session.
  useEffect(() => {
    if (!isAuthenticated || !isTabsHome || feedbackCheckedRef.current) return;
    feedbackCheckedRef.current = true;
    void (async () => {
      const launchCount = await recordAppLaunch(AsyncStorage);
      if (await shouldShowFeedbackPrompt(launchCount, AsyncStorage)) {
        setFeedbackPromptOpen(true);
      }
    })();
  }, [isAuthenticated, isTabsHome]);
  const {
    data: workspaces = NO_WORKSPACES,
    isLoading: loadingWorkspaces,
  } = useGetWorkspaces({
    query: {
      queryKey: getGetWorkspacesQueryKey(),
      enabled: isAuthenticated && !!user?.id && !user?.needsDisplayName,
    },
  });

  // An update restarts the app on Home. If somebody accepted it from another
  // screen, that screen was noted just before the restart: go back to it once
  // the app has settled on Home, instead of making them find their way again.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || checkingChooser || !isTabsHome || resumedRef.current) return;
    resumedRef.current = true;
    void consumeResumePoint(AsyncStorage).then((route) => {
      if (route) router.push(route as never);
    });
  }, [isAuthenticated, checkingChooser, isTabsHome]);

  // Jamvi is paid: somebody still on the free trial who has never said what
  // they intend is stopped once, on landing in the app proper, by a screen
  // that asks. Never mid-onboarding — only once they reach the tabs.
  const { data: entitlements } = useEntitlements();
  useEffect(() => {
    if (!isAuthenticated || !user?.id || user.needsDisplayName || !isTabsRoute) return;
    let active = true;
    void readPlanChoice(user.id, AsyncStorage).then((choice) => {
      if (active && shouldShowPlanChoice(entitlements, choice)) router.replace('/plan-choice');
    }).catch(() => {});
    return () => { active = false; };
  }, [isAuthenticated, user?.id, user?.needsDisplayName, isTabsRoute, entitlements]);

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

  // The entry decision is made once per signed-in session. After it resolves,
  // a query settling or a route change must NOT re-show the spinner or re-run
  // the check — that toggling is what strobed the screen over the content.
  const entryResolvedRef = useRef(false);
  useEffect(() => {
    entryResolvedRef.current = false;
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    let active = true;
    const go = (destination: string, atRoute: string) => {
      if (currentRoute !== atRoute) router.replace(destination);
    };

    if (isLoading) {
      setCheckingChooser(true);
      return () => { active = false; };
    }
    if (!isAuthenticated) {
      entryResolvedRef.current = true;
      setCheckingChooser(false);
      go('/login', 'login');
      return () => { active = false; };
    }
    if (user?.needsDisplayName) {
      entryResolvedRef.current = true;
      setCheckingChooser(false);
      go('/profile-setup', 'profile-setup');
      return () => { active = false; };
    }
    if (!user?.id) return () => { active = false; };

    // Already decided where this session lands. Keep the spinner down and do
    // nothing else — no re-check, no redirect.
    if (entryResolvedRef.current) {
      setCheckingChooser(false);
      return () => { active = false; };
    }
    if (loadingWorkspaces) {
      setCheckingChooser(true);
      return () => { active = false; };
    }

    setCheckingChooser(true);
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
        if (destination && destination !== `/${currentRoute}`) router.replace(destination);
      })
      .catch(() => {
        // A storage read failing must not leave the app stuck on the spinner.
      })
      .finally(() => {
        if (active) {
          entryResolvedRef.current = true;
          setCheckingChooser(false);
        }
      });
    return () => { active = false; };
    // `workspaces.length` rather than `workspaces`: a fresh array reference on
    // every render (query refetch, structural-sharing miss) must not re-fire
    // this effect. The count is enough to know the list is ready.
  }, [isLoading, isAuthenticated, user?.id, user?.needsDisplayName, currentRoute, loadingWorkspaces, workspaces.length]);

  if (isLoading || checkingChooser) {
    return <AppLoading />;
  }

  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
        <Stack.Screen name="budget-chooser" options={{ gestureEnabled: false }} />
        <Stack.Screen name="plan-choice" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="add-expense"
        options={{
          presentation: 'formSheet',
          // Opens full height. At 0.85 the form is taller than the sheet, so
          // its first fields — the date and the amount's own label — sat above
          // the visible area with the sheet's own drag competing for the
          // gesture that would bring them back. A form is not a peek.
          sheetAllowedDetents: [1],
          sheetGrabberVisible: true,
          // iOS defaults this to true: reaching either edge of the content
          // hands the drag to the sheet, which expands it a detent instead of
          // letting the ScrollView keep scrolling — felt like scrolling had
          // stopped working. The content already scrolls fine on its own.
          sheetExpandsWhenScrolledToEdge: false,
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="record-contributions"
        options={{
          presentation: 'formSheet',
          // Full height, for the same reason as the expense form: these are
          // forms taller than a partial sheet, and a partial sheet hides their
          // first fields behind a drag that fights the scroll.
          sheetAllowedDetents: [1],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="contribution-plan"
        options={{
          presentation: 'formSheet',
          // Full height, for the same reason as the expense form: these are
          // forms taller than a partial sheet, and a partial sheet hides their
          // first fields behind a drag that fights the scroll.
          sheetAllowedDetents: [1],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="spending-by-item" options={{ headerShown: false }} />
      <Stack.Screen name="expense-ledger" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="delete-account-code" options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
    <FeedbackModal
      visible={feedbackPromptOpen}
      context="random-prompt"
      onSubmitted={() => void markFeedbackSubmitted(AsyncStorage)}
      onClose={() => {
        void markFeedbackPromptShown(AsyncStorage);
        setFeedbackPromptOpen(false);
      }}
    />
    </>
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

  // Restore the last query results before the first screen mounts so it can
  // paint from cache instead of a spinner. Bounded by one AsyncStorage read,
  // so it gates startup no longer than the fonts already do.
  const [cacheReady, setCacheReady] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    hydrateQueryClient(queryClient).finally(() => {
      stop = startPersistingQueryClient(queryClient);
      setCacheReady(true);
    });
    return () => stop?.();
  }, []);

  const ready = (fontsLoaded || fontError) && cacheReady;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return <AppLoading />;

  return (
    <SafeAreaProvider>
      <AppearanceProvider>
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
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
