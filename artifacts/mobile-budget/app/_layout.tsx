import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Platform } from 'react-native';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ImportSavingBar } from '@/components/ImportSavingBar';
import { updateNotesFrom } from '@/lib/updateNote';
import { FeedbackModal } from '@/components/FeedbackModal';
import { AppLoading } from '@/components/AppLoading';
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  recordAppLaunch,
  shouldShowFeedbackPrompt,
} from '@/lib/feedbackPrompt';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname, useSegments } from 'expo-router';
import { refreshAfterSave, refreshShownHistory } from '@/lib/refreshAfterSave';
import { useStandardLinks } from '@/hooks/useCommonCategories';
import { useRulesSync } from '@/hooks/useRulesSync';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { readPlanChoice, shouldShowPlanChoice } from '@/lib/planChoice';
import { consumeResumePoint, saveResumePoint } from '@/lib/resumeAfterUpdate';
import { forgetWhatsNew, keepWhatsNew, shouldInstallOnReturn, takeWhatsNew } from '@/lib/updateTiming';
import { backTarget, notePath } from '@/lib/lastRoute';
import { useImportProgress } from '@/lib/importProgress';
import * as Updates from 'expo-updates';
import {
  getGetWorkspacesQueryKey,
  setBaseUrl,
  setAuthTokenGetter,
  setWorkspaceIdGetter,
  useGetWorkspaces,
} from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { clearSessionToken, readSessionToken, sessionHasEnded } from '@/lib/sessionToken';
import { recordSignOut } from '@/lib/signOutReason';
import { useSharedText } from '@/lib/shareIntent';
import { looksLikeMpesa, queueSharedMessages } from '@/lib/sharedMessages';
import { AppearanceProvider } from '@/hooks/useAppearance';
import { hydrateQueryClient, startPersistingQueryClient } from '@/lib/queryPersist';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  hasValidMobileWorkspaceSelection,
  isMobileBudgetChooserComplete,
  mobileBudgetEntryRedirect,
} from '@/lib/workspace';
import { afterQuiet } from '@/lib/refreshAfterChange';

// How long to leave between checks, so a quick switch to WhatsApp and back
// does not ask Expo about updates every few seconds.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// OTA updates download quietly, then ask: Update now, or Later. Later lets it
// go in at a natural break - coming back after a while away (lib/updateTiming),
// or the next fresh start - never in the middle of what somebody is doing ("my
// issue the update removes me from my current session", 8 Oct 2026). It used to
// restart by itself when ready at a fresh start, and the "was updated" sheet
// after it closed on any tap ("appearing for a flick of a second", 8 Oct 2026).
// Skipped in development (Expo Go / dev-client) where Updates is not active.
// Returns what RootLayout shows in <UpdatePrompt>.
function useUpdatePrompt() {
  const [updateNotes, setUpdateNotes] = useState<string[] | null>(null);
  // A downloaded update waiting for Update now or Later: what is new in it.
  const [readyNotes, setReadyNotes] = useState<string[] | null>(null);
  const lastCheckedAt = useRef(0);
  const downloaded = useRef(false);
  const awaySince = useRef<number | null>(null);
  // Read inside the listener without making them dependencies.
  const pathname = usePathname();
  const where = useRef(pathname);
  where.current = pathname;
  // Where the person came from, so a screen they come back to keeps its place (lib/lastRoute).
  notePath(pathname);
  const importProgress = useImportProgress();
  const saving = useRef(false);
  saving.current = importProgress?.stage === 'saving';

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || downloaded.current) return;
    const now = Date.now();
    if (now - lastCheckedAt.current < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheckedAt.current = now;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;
      const fetched = await Updates.fetchUpdateAsync();
      const manifest = (fetched.manifest ?? result.manifest) as { id?: string } | undefined;
      // What is new, from the note published with it (see app.config.js).
      const notes = updateNotesFrom(manifest);
      await keepWhatsNew(manifest?.id, notes, AsyncStorage);
      downloaded.current = true;
      setReadyNotes(notes);
    } catch {
      // Network unavailable or server error — silently ignore.
    }
  }, []);

  useEffect(() => {
    // Just updated: say what is new, once.
    if (!__DEV__ && Updates.isEnabled) {
      void takeWhatsNew(Updates.updateId, AsyncStorage).then((notes) => { if (notes) setUpdateNotes(notes); });
    }
    void check();

    // Nobody force-quits a phone app, so checking only on a cold start meant
    // updates were rarely seen. Check whenever the app comes back to the
    // foreground, and put a downloaded update in when it comes back after a
    // while away - a fresh start for the person, so nothing is cut off.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        awaySince.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      const awayMs = awaySince.current === null ? null : Date.now() - awaySince.current;
      awaySince.current = null;
      if (shouldInstallOnReturn({ downloaded: downloaded.current, awayMs, saving: saving.current })) {
        void saveResumePoint(where.current, AsyncStorage).then(() => Updates.reloadAsync()).catch(() => {});
        return;
      }
      void check();
    });
    return () => subscription.remove();
  }, [check]);

  // Update now: back where they were after the restart, and the list it just
  // showed is not shown again.
  const updateNow = useCallback(async () => {
    try {
      await saveResumePoint(where.current, AsyncStorage);
      await forgetWhatsNew(AsyncStorage);
      await Updates.reloadAsync();
    } catch {
      setReadyNotes(null);
    }
  }, []);

  return {
    updateNotes,
    dismiss: () => setUpdateNotes(null),
    // Not while an M-Pesa import is saving: a restart would cut it off.
    readyNotes: importProgress?.stage === 'saving' ? null : readyNotes,
    updateNow,
    later: () => setReadyNotes(null),
  };
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
const API_BASE = domain ? `https://${domain}` : PRODUCTION_API_BASE;
setBaseUrl(API_BASE);
setAuthTokenGetter(readSessionToken);
setWorkspaceIdGetter(() => AsyncStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY));

SplashScreen.preventAutoHideAsync();

// Any change made anywhere refreshes what every screen is showing. Screens each
// listed the queries they thought a change touched, and the lists drifted:
// renaming an income source on a deposit reached the bank but not Reports, which
// kept showing the old name. Everything is still refreshed, but the whole-history
// lists only when a screen showing one is in view (lib/refreshAfterSave): tab
// screens stay mounted, so refetching everything reloaded every tab's history
// after every save.
const refreshEverything = afterQuiet(() => refreshAfterSave(queryClient));

const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({ onSuccess: () => refreshEverything() }),
  queryCache: new QueryCache({
    onError: async (error) => {
      // A 401 may mean the session has ended - then clear the token and go to
      // sign-in, so nobody is left on a form with missing fields (e.g. no PAID
      // BY section). But one 401 is not proof: during a long statement import
      // a single request sent without its token signed people out. The server
      // is asked first, and only a session it no longer knows ends here.
      if (error instanceof ApiError && error.status === 401 && (await sessionHasEnded(API_BASE))) {
        await recordSignOut('request-401-confirmed');
        await clearSessionToken();
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
        // Two quick tries rather than three slow ones: 1 s, 2 s and 4 s apart
        // kept a screen on its spinner for about seven seconds before it said
        // anything (lag audit, 7 Oct 2026). A dropped connection is still
        // covered by refetchOnReconnect below.
        return failureCount < 2;
      },
      retryDelay: (attempt) => (attempt === 0 ? 800 : 1_500),
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

  // A history a save left out of date is fetched again when its screen comes
  // into view (lib/refreshAfterSave). Keyed by the route as text, so it fires
  // on a move between screens and never because of a re-render.
  const routeKey = segments.join('/');
  useEffect(() => {
    refreshShownHistory(queryClient);
  }, [routeKey]);

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
    data: workspaceList,
    isLoading: loadingWorkspaces,
    isError: workspacesFailed,
    isPaused: workspacesPaused,
  } = useGetWorkspaces({
    query: {
      queryKey: getGetWorkspacesQueryKey(),
      enabled: isAuthenticated && !!user?.id && !user?.needsDisplayName,
    },
  });

  // The budget's common category for each kind of payee Jamvi knows (lib/commonCategories).
  useStandardLinks(isAuthenticated && !!user?.id && !user?.needsDisplayName);
  // What Jamvi was taught about payees, kept on the server for every phone and the web.
  useRulesSync(isAuthenticated && !!user?.id && !user?.needsDisplayName);

  const workspaces = workspaceList ?? NO_WORKSPACES;
  // Could not be fetched at all: unknown, not empty. See hasValidMobileWorkspaceSelection.
  // Paused is the same thing: offline, React Query holds the request back
  // without failing it, and the list was read as empty.
  const workspacesUnknown = workspaceList === undefined && (workspacesFailed || workspacesPaused);

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

  // Messages shared to Jamvi from another app (Android's Share button) open
  // the paste screen with them read, once the person is signed in and settled.
  // Anything that is not an M-Pesa message is ignored rather than opened for.
  const { text: sharedText, clear: clearSharedText } = useSharedText();
  useEffect(() => {
    if (!sharedText || !isAuthenticated || checkingChooser) return;
    clearSharedText();
    if (!looksLikeMpesa(sharedText)) {
      Alert.alert('Not an M-Pesa message', 'Share M-Pesa messages to Jamvi and it will turn them into entries.');
      return;
    }
    queueSharedMessages(sharedText);
    router.navigate('/mpesa-import');
  }, [sharedText, isAuthenticated, checkingChooser, clearSharedText]);

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

  // Keep Android's hardware back action inside Jamvi. A back press from a tab
  // goes to the tab visited before it, where it was left (lib/lastRoute) - it
  // used to always go to Home and start it over. With nowhere left to go back
  // to, leaving Jamvi needs an explicit choice.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isAuthenticated || !isTabsRoute) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const target = backTarget();
      if (target) {
        router.navigate(target as never);
        return true;
      }
      if (!isTabsHome) {
        router.navigate('/(tabs)' as never);
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

      const target = backTarget();
      if (target) {
        window.history.pushState(guardState, '', homeUrl);
        router.navigate(target as never);
        return;
      }
      if (!isTabsHome) {
        router.navigate('/(tabs)' as never);
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
      hasValidMobileWorkspaceSelection({ storage: AsyncStorage, workspaces: workspacesUnknown ? null : workspaces }),
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
  }, [isLoading, isAuthenticated, user?.id, user?.needsDisplayName, currentRoute, loadingWorkspaces, workspaces.length, workspacesUnknown]);

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
      <Stack.Screen name="income-ledger" options={{ headerShown: false }} />
      <Stack.Screen name="expense-ledger" options={{ headerShown: false }} />
      <Stack.Screen name="budget-report" options={{ headerShown: false }} />
      <Stack.Screen name="year-report" options={{ headerShown: false }} />
      <Stack.Screen name="budget-plan" options={{ headerShown: false }} />
      <Stack.Screen name="sort-entries" options={{ headerShown: false }} />
      <Stack.Screen name="teach-jamvi" options={{ headerShown: false }} />
      <Stack.Screen name="possible-duplicates" options={{ headerShown: false }} />
      <Stack.Screen name="mpesa-difference" options={{ headerShown: false }} />
      <Stack.Screen name="business" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="delete-account-code" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="delete-group-code" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="delete-year" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="budget-handover" options={{ headerShown: false }} />
      <Stack.Screen name="change-email" options={{ headerShown: false }} />
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
  const { updateNotes, dismiss, readyNotes, updateNow, later } = useUpdatePrompt();
  // The redesign's faces, loaded under the family names every screen already
  // uses, so the whole app changes typeface without touching each style:
  // Atkinson Hyperlegible for reading text (it holds up on cheap screens) and
  // Bricolage Grotesque for the bold weight, which carries titles and figures.
  // Bundled assets, so this ships as an over-the-air update.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('../assets/fonts/AtkinsonHyperlegible_400Regular.ttf'),
    Inter_500Medium: require('../assets/fonts/AtkinsonHyperlegible_400Regular.ttf'),
    Inter_600SemiBold: require('../assets/fonts/AtkinsonHyperlegible_700Bold.ttf'),
    Inter_700Bold: require('../assets/fonts/BricolageGrotesque_700Bold.ttf'),
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
                  {/* An M-Pesa import saving, or just saved, seen from any screen. */}
                  <ImportSavingBar />
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
        {/* Update prompt — rendered outside QueryClientProvider so it works even
            before the user is authenticated, and outside ErrorBoundary so a
            render error in the main tree doesn't swallow the prompt. */}
        {/* What the update just installed stays until Got it; a newer one that
            arrives meanwhile is offered after it, not in its place ("Jamvi was
            updated" vanished when the next download finished, 8 Oct 2026). */}
        {updateNotes ? (
          <UpdatePrompt key="done" kind="done" notes={updateNotes} onDismiss={dismiss} />
        ) : readyNotes ? (
          <UpdatePrompt key="ready" kind="ready" notes={readyNotes} onUpdate={updateNow} onDismiss={later} />
        ) : null}
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
