import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  TextInput,
  ScrollView as AskScroll,
  AppState,
} from 'react-native';
import { Redirect, router, useFocusEffect, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { DebtSummaryCard } from '@/components/DebtSummaryCard';
import { useColors } from '@/hooks/useColors';
import { useAutoReconcile } from '@/hooks/useAutoReconcile';
import { onScreenOnly, useOnScreen } from '@/hooks/useOnScreen';
import { useSortRecognisedOnce } from '@/hooks/useCommonCategories';
import { useApplyCovers } from '@/hooks/useApplyCovers';
import { useEntitlements } from '@/hooks/useEntitlements';
import { mayStartGroup } from '@/lib/groupStart';
import { toSortTitle } from '@/lib/entriesToSort';
import { useWaitingForYou, waitingDestination } from '@/hooks/useWaitingForYou';
import { useQuery } from '@tanstack/react-query';
import { canReadSms, newMpesaSms, newSmsTitle, parseSmsAuto, smsAutoKey } from '@/lib/mpesaSms';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import ActivityCard from '@/components/ActivityCard';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { WorkspaceSetupGuide } from '@/components/WorkspaceSetupGuide';
import { DashboardAnnouncement } from '@/components/DashboardAnnouncement';
import { HomeTip } from '@/components/HomeTip';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import { noAnswerFromServer } from '@/lib/workspace';
import { getExpenseEditHref } from '@/lib/expenseEditLink';
import {
  getGetJointAccountQueryKey,
  ApiError,
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetExpenses,
  useGetJointAccount,
  useGetGroup,
  customFetch,
} from '@workspace/api-client-react';
import { HomeAnswersCard } from '@/components/HomeAnswersCard';
import { BusinessSalaryQuestion } from '@/components/BusinessSalaryQuestion';
import { MpesaImportCard } from '@/components/MpesaImportCard';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PRIVACY_KEY = 'dashboard_privacy';

type HomeExpense = {
  id: number;
  amount: number;
  description: string;
  category?: string | null;
  categoryAllocations?: { category: string; amount: number }[];
  date: string;
  paidById?: string | null;
  paidFromBank?: boolean;
  isRecurring?: boolean;
  incomeSplits?: { userId?: string | null; fromBank: boolean }[];
};

type AskResponse = {
  answer: string;
  /** The screens whose figures the answer used, to open from it. */
  links?: Array<{ label: string; route: string }>;
  readOnly: boolean;
  workspaceScoped: boolean;
  month: number;
  year: number;
};

function isUncategorizedExpense(expense: HomeExpense) {
  return !expense.category?.trim()
    && !(expense.categoryAllocations ?? []).some((allocation) => allocation.category.trim());
}

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function shortKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

type Shortcut = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description?: string;
  color: string;
  bg: string;
  route: string;
};

const SHARED_OVERVIEW_SHORTCUTS: Shortcut[] = [
  { icon: 'bar-chart-2', label: 'Budget',        color: '#2DD4CC', bg: '#0B343B', route: '/(tabs)/budget',        description: 'Plan spending' },
  { icon: 'trending-up', label: 'Contributions', color: '#3CDD62', bg: '#0D3428', route: '/(tabs)/contributions', description: 'See money in' },
  { icon: 'file-text',   label: 'Expenses',      color: '#E9B949', bg: '#392D08', route: '/(tabs)/history',       description: 'Review spending' },
  { icon: 'target',      label: 'Goals',         color: '#6C9FE6', bg: '#0A254E', route: '/(tabs)/goals',         description: 'Track targets' },
  { icon: 'credit-card', label: 'Bank',          color: '#14776A', bg: '#0B343B', route: '/(tabs)/bank',          description: 'Manage funds' },
  { icon: 'pie-chart',   label: 'Reports',       color: '#6C9FE6', bg: '#0A254E', route: '/(tabs)/reports',       description: 'Understand trends' },
  // What you owe and are owed - loans, Fuliza, people - one tap from Home.
  { icon: 'trending-down', label: 'Debt',        color: '#F87171', bg: '#3A1212', route: '/(tabs)/debt',          description: 'What you owe' },
  { icon: 'smartphone',  label: 'M-Pesa',        color: '#3CDD62', bg: '#0D3428', route: '/mpesa-import',         description: 'Import a statement' },
];

// A Personal budget has the same areas, less the group's contributions.
const PERSONAL_OVERVIEW_SHORTCUTS: Shortcut[] = SHARED_OVERVIEW_SHORTCUTS.filter((shortcut) => shortcut.label !== 'Contributions');

// Only reachable from Home through the setup guide's one-time "Invite a
// member" step, which retires the moment setup is complete — leaving no way
// back to the invite link from here at all, on a group that goes on adding
// people long after setup is done. Owners/admins only, matching Settings'
// own GROUP ACCESS gate; a member tapping it would land on a section that
// does not exist for them.
const INVITE_SHORTCUT: Shortcut = {
  icon: 'user-plus', label: 'Invite', color: '#F97AC6', bg: '#3A0F2E',
  route: '/(tabs)/settings?openInvite=1', description: 'Add a member',
};

// Starting a group used to be reachable only from Settings. Shown only while
// the person's own trial or subscription is active (lib/groupStart).
const NEW_GROUP_SHORTCUT: Shortcut = {
  icon: 'users', label: 'New group', color: '#F59E0B', bg: '#3A2A08',
  route: '/(tabs)/settings?openCreateGroup=1', description: 'Start a chama or club',
};

import { ArrangeSheet } from '@/components/ArrangeSheet';
import { arrange, homeAreasKey, useArrangement } from '@/lib/layoutPrefs';
import { duplicatesTitle } from '@/lib/possibleDuplicates';
import { savedGroups, teachDoneKey } from '@/lib/teachJamvi';

export default function DashboardScreen() {
  const onScreen = useOnScreen();
  const live = onScreenOnly(onScreen);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isPrivate, setIsPrivate] = useState(false);

  // Load privacy preference
  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_KEY).then(v => {
      if (v === 'true') setIsPrivate(true);
    });
  }, []);

  const togglePrivacy = useCallback(() => {
    setIsPrivate(p => {
      const next = !p;
      AsyncStorage.setItem(PRIVACY_KEY, String(next));
      return next;
    });
  }, []);

  const fmt = useCallback((n?: number | null) => isPrivate ? '••••' : formatKES(n), [isPrivate]);

  // The whole account is followed only while Home is in view (hooks/useOnScreen).
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryFailure,
    refetch: refetchSummary,
  } = useGetDashboardSummary({ month, year }, live);

  const {
    data: activity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useGetDashboardActivity(undefined, live);
  const {
    data: expenses = [],
    refetch: refetchExpenses,
  } = useGetExpenses({ month, year }, live);

  // The balance and this month's money in and out, worked out by the server - no
  // entries at all (limit 0). Home used to download every entry of every account
  // to add up one month (docs/account-list-paging.md, step 3).
  const homeAccountParams = { month, year, limit: 0 };
  const {
    data: bankAccount,
    isLoading: bankAccountLoading,
    refetch: refetchBank,
  } = useGetJointAccount(homeAccountParams, { query: { queryKey: getGetJointAccountQueryKey(homeAccountParams), subscribed: onScreen } });
  const { data: group } = useGetGroup(live);
  const isSharedWorkspace = group?.isPrivate === false;

  const [refreshing, setRefreshing] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [openTurn, setOpenTurn] = useState<string | null>(null);
  // Opening a screen from an answer ("Open Reports") closes the sheet to show
  // it; coming back to Home should land back in the conversation, not leave
  // Ask Jamvi behind. The answer and thread are still held here.
  const reopenAsk = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (reopenAsk.current) {
        reopenAsk.current = false;
        setAskOpen(true);
      }
    }, []),
  );
  const [askQuery, setAskQuery] = useState('');
  const [askAnswer, setAskAnswer] = useState<(AskResponse & { question?: string }) | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // The conversation so far, for follow-ups ("and in August?"). Kept only
  // while the app is open: nothing is saved anywhere.
  const [askThread, setAskThread] = useState<Array<{ question: string; answer: string }>>([]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity(), refetchExpenses(), refetchBank()]);
    setRefreshing(false);
  }, [refetchSummary, refetchActivity, refetchExpenses, refetchBank]);

  const askJamvi = useCallback(async (value?: string) => {
    const question = (value ?? askQuery).trim();
    if (!question || asking) return;
    setAskQuery(question);
    setAskError(null);
    setAsking(true);
    // The earlier questions and answers go along, so a follow-up is understood.
    const previous = askAnswer ? [...askThread, { question: askAnswer.question ?? '', answer: askAnswer.answer }] : askThread;
    const history = previous.slice(-4).flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      { role: 'assistant' as const, content: turn.answer },
    ]).filter((turn) => turn.content);
    try {
      const response = await customFetch<AskResponse>('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, month, year, history }),
      });
      setAskThread(previous);
      setAskAnswer({ ...response, question });
      setAskQuery('');
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'Ask Jamvi could not answer right now.');
    } finally {
      setAsking(false);
    }
  }, [askQuery, asking, month, year, askAnswer, askThread]);
  const newAskConversation = useCallback(() => {
    setAskThread([]);
    setAskAnswer(null);
    setAskQuery('');
    setAskError(null);
  }, []);

  const openAskJamvi = useCallback(() => {
    setAskError(null);
    setAskOpen(true);
  }, []);

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 5), [activity]);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName = user?.firstName?.trim() || '';
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const workspaceAccentColor = colors.brandBlue;
  const workspaceIcon = (group?.icon ?? 'users') as keyof typeof Feather.glyphMap;
  const workspacePhotoUrl = isSharedWorkspace ? group?.photoUrl : user?.profileImageUrl;
  const canManageBudget = !isSharedWorkspace || group?.role === 'owner' || group?.role === 'admin';
  // Find the difference, by itself (lib/autoReconcile): the sure fixes are made
  // quietly, and only what needs the person reaches Waiting for you.
  const reconcileLeft = useAutoReconcile(group?.id, canManageBudget, onScreen);
  // Entries saved as Not sure yet to payees Jamvi knows are filed once (hooks/useCommonCategories).
  useSortRecognisedOnce(group?.id, canManageBudget);
  // What a person's money covers (Rent, then School fees, then Family support): their new payments split by it (hooks/useApplyCovers).
  useApplyCovers(group?.id, canManageBudget, onScreen);
  const canManageExpenses = !isSharedWorkspace || group?.role === 'owner' || group?.role === 'admin';
  const canManageAccess = isSharedWorkspace && (group?.role === 'owner' || group?.role === 'admin');
  // The group areas in the person's own order, per budget, hidden ones left out.
  const [areasArrangement, setAreasArrangement] = useArrangement(homeAreasKey(group?.id));
  const [arrangingAreas, setArrangingAreas] = useState(false);
  const baseShortcuts = isSharedWorkspace ? SHARED_OVERVIEW_SHORTCUTS : PERSONAL_OVERVIEW_SHORTCUTS;
  const { data: entitlements } = useEntitlements();
  // Entries saved as "Not sure", and new M-Pesa messages: the two things most
  // easily forgotten, so they lead Home (hooks/useWaitingForYou, shared with
  // the Home tab's badge). New messages are looked for each time Home is shown
  // and each time Jamvi comes back to the front.
  const { toSortCount, newSmsCount: newSms, recheckSms, toSortEntries } = useWaitingForYou();
  // Teach Jamvi your M-Pesa, offered once per budget to somebody already using
  // Jamvi whose saved Not sure entries include regulars (lib/teachJamvi):
  // "even a current user should be vetted again" (9 Oct 2026).
  const [teachDone, setTeachDone] = useState(true);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    AsyncStorage.getItem(teachDoneKey(group?.id))
      .then((value) => { if (active) setTeachDone(value === 'done'); })
      .catch(() => {});
    return () => { active = false; };
  }, [group?.id]));
  const regulars = useMemo(() => (teachDone || !toSortEntries ? [] : savedGroups(toSortEntries)), [teachDone, toSortEntries]);
  // One payment typed by hand and brought in from M-Pesa (lib/possibleDuplicates).
  const { data: duplicates } = useQuery<{ count: number }>({
    subscribed: onScreen,
    queryKey: ['possible-duplicates'],
    queryFn: () => customFetch('/api/possible-duplicates'),
    retry: false,
    staleTime: 60_000,
  });
  const duplicateCount = duplicates?.count ?? 0;
  // The Home tab carries a badge counting these. Tapping Home from another tab
  // opens Home, where they lead. Tapping it again, once Home is open, goes
  // straight to the thing to fix; with nothing waiting it returns to the top.
  const homeScrollRef = useRef<AskScroll>(null);
  const navigation = useNavigation();
  const waitingDestinationRef = useRef<string | null>(null);
  waitingDestinationRef.current = waitingDestination({ toSortCount, newSmsCount: newSms, canAct: canManageBudget });
  useEffect(() => navigation.addListener('tabPress' as never, () => {
    if (!navigation.isFocused()) return;
    const destination = waitingDestinationRef.current;
    if (destination) router.push(destination as never);
    else homeScrollRef.current?.scrollTo({ y: 0, animated: true });
  }), [navigation]);
  useFocusEffect(React.useCallback(() => { if (canReadSms()) void recheckSms(); }, [recheckSms]));
  useEffect(() => {
    if (!canReadSms()) return;
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void recheckSms(); });
    return () => subscription.remove();
  }, [recheckSms]);
  const allShortcuts = [
    ...baseShortcuts,
    ...(canManageAccess ? [INVITE_SHORTCUT] : []),
    ...(mayStartGroup(entitlements) ? [NEW_GROUP_SHORTCUT] : []),
  ].map((shortcut) => ({ ...shortcut, id: shortcut.label.toLowerCase() }));
  const overviewShortcuts = arrange(allShortcuts, areasArrangement);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const editableUncategorizedExpenses = (expenses as HomeExpense[])
    .filter(isUncategorizedExpense)
    .filter((expense) => {
      if (canManageExpenses) return true;
      if (!user?.id || expense.date.slice(0, 10) !== today || expense.paidById !== user.id) return false;
      if (expense.paidFromBank || expense.isRecurring) return false;
      return !(expense.incomeSplits ?? []).some(
        (split) => split.fromBank || (split.userId && split.userId !== user.id),
      );
    });
  // The rows of the one Waiting for you card, most urgent first: new messages
  // are the newer news, duplicates count money twice until they are settled.
  type WaitingRow = {
    testID: string;
    icon: keyof typeof Feather.glyphMap;
    color: string;
    title: string;
    hint: string;
    onPress: () => void;
  };
  const firstUncategorized = editableUncategorizedExpenses[0];
  const waitingRows: WaitingRow[] = [
    ...(reconcileLeft?.missing?.count ? [{
      testID: 'reconcile-missing-cta',
      icon: 'download' as const,
      color: colors.primary,
      title: `${reconcileLeft.missing.count} M-Pesa ${reconcileLeft.missing.count === 1 ? 'payment' : 'payments'} not in Jamvi yet`,
      hint: 'Bring them in as Not sure yet. Everything else in your M-Pesa is already in step.',
      onPress: () => router.push(`/mpesa-import?smsFrom=${reconcileLeft.missing!.from}&smsTo=${reconcileLeft.missing!.to}&notSure=1` as never),
    }] : []),
    ...(reconcileLeft?.extra ? [{
      testID: 'reconcile-extra-cta',
      icon: 'alert-circle' as const,
      color: '#D97706',
      title: `${reconcileLeft.extra} ${reconcileLeft.extra === 1 ? 'entry' : 'entries'} M-Pesa never had`,
      hint: 'Typed by hand, or saved twice? Keep or remove each one.',
      onPress: () => router.push('/mpesa-difference' as never),
    }] : []),
    ...(regulars.length > 0 && canManageBudget ? [{
      testID: 'teach-jamvi-cta',
      icon: 'zap' as const,
      color: colors.primary,
      title: `Teach Jamvi your ${regulars.length === 1 ? 'regular' : `${regulars.length} regulars`}`,
      hint: `One tap each sorts ${regulars.reduce((sum, one) => sum + one.count, 0)} Not sure entries, and files them by itself from now on.`,
      onPress: () => router.push('/teach-jamvi' as never),
    }] : []),
    ...(newSms > 0 && canManageBudget ? [{
      testID: 'new-mpesa-sms-cta',
      icon: 'message-square' as const,
      color: colors.primary,
      title: newSmsTitle(newSms),
      hint: 'Review them and save what is right. Nothing is saved until you do.',
      onPress: () => router.push('/mpesa-import?fromSms=new' as never),
    }] : []),
    ...(duplicateCount > 0 && canManageBudget ? [{
      testID: 'possible-duplicates-cta',
      icon: 'copy' as const,
      color: colors.destructive,
      title: duplicatesTitle(duplicateCount),
      hint: 'Say which are the same payment, so nothing counts twice.',
      onPress: () => router.push('/possible-duplicates' as never),
    }] : []),
    ...(toSortCount > 0 && canManageBudget ? [{
      testID: 'entries-to-sort-cta',
      icon: 'help-circle' as const,
      color: '#D97706',
      title: toSortTitle(toSortCount),
      hint: 'Say what each one was for, whenever you remember.',
      onPress: () => router.push('/sort-entries' as never),
    }] : []),
    ...(firstUncategorized ? [{
      testID: 'uncategorized-expense-cta',
      icon: 'tag' as const,
      color: '#D97706',
      title: `${editableUncategorizedExpenses.length} expense${editableUncategorizedExpenses.length === 1 ? '' : 's'} without a category`,
      hint: `Next: ${firstUncategorized.description} · KES ${formatKES(firstUncategorized.amount)}`,
      onPress: () => router.push(getExpenseEditHref(firstUncategorized) as never),
    }] : []),
  ];
  type MemberContribution = {
    userId: string;
    name: string;
    contributed: number;
    spent: number;
    target: number | null;
  };
  const memberContributions = ((summary as any)?.memberContributions ?? []) as MemberContribution[];
  const contributionColors = [colors.brandTeal, colors.brandGold, colors.brandBlue, colors.brandGreen, colors.info];

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  if (summaryError) {
    // No active workspace at all — a brand-new or just-signed-in person. Send
    // them to the chooser, where they can create a budget or accept an
    // invitation, rather than a dead "ask someone to add you" screen.
    // Or a budget this account cannot open - one left selected on this phone
    // by another account signed in before ("why does it take someone here for
    // a new account", 5 Oct 2026): choosing one is the way on, not "try again".
    const refused = summaryFailure instanceof ApiError && (summaryFailure.status === 403 || summaryFailure.status === 404);
    // No group only means no budget when the server said so. Offline the group
    // fails to load too, and that sent people to create a new budget (9 Oct
    // 2026): they get "could not load" and Try again instead.
    if ((!group && !noAnswerFromServer(summaryFailure)) || refused) {
      return <Redirect href="/budget-chooser" />;
    }
    return (
      <View style={[styles.accessContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.accessIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="home" size={25} color={colors.primary} />
          </View>
          <Text style={[styles.accessTitle, { color: colors.foreground }]}>This budget could not load</Text>
          <Text style={[styles.accessText, { color: colors.mutedForeground }]}>
            Check your connection and try again. If you have just been removed from this group, pick another budget.
          </Text>
          <Pressable
            onPress={() => { void refetchSummary(); }}
            style={[styles.accessButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.accessButtonText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/budget-chooser')} style={{ paddingVertical: 10 }}>
            <Text style={[styles.accessText, { color: colors.primary, textDecorationLine: 'underline' }]}>Choose another budget</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageScrollView ref={homeScrollRef} scroller={{ top: 12, bottom: insets.bottom + 110 }}
        style={{ backgroundColor: colors.background }}
        overScrollMode="never"
        // Which budget you are looking at should not scroll away. Index 1 is
        // the workspace card, which is why the header gradient is in two
        // pieces with the card between them rather than one block.
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
        }
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 100 : 110,
          backgroundColor: colors.background,
        }}
      >
        {/* Dark header */}
        <LinearGradient
          colors={[colors.brandNavy, '#0A3833']}
          style={[styles.header, styles.headerTopPiece, { paddingTop: topPad + 12 }]}
        >
          {/* Top row: greeting + profile */}
          <View style={styles.headerTop}>
            <View style={styles.greetingBlock}>
              {displayName ? (
                <Text>
                  <Text style={styles.greeting}>{greeting}, </Text>
                  <Text style={styles.name}>{displayName}!</Text>
                </Text>
              ) : (
                <Text style={styles.greeting}>{greeting}</Text>
              )}
            </View>
            <Pressable onPress={() => router.push('/(tabs)/settings')} hitSlop={10} accessibilityLabel="Open settings">
              <ProfileAvatar
                user={user}
                size={34}
                backgroundColor="rgba(247,250,246,0.16)"
                foregroundColor="#FBF7EC"
              />
            </Pressable>
          </View>

          {/* Utility row: privacy, Ask Jamvi, and month. Settings is the avatar
              above. Ask Jamvi was a full card further down Home (9 Oct 2026
              cleanup): a question can come up anywhere, so it sits at the top. */}
          <View style={styles.headerUtilityRow}>
            <View style={styles.utilityControls}>
              {/* Privacy toggle */}
              <Pressable onPress={togglePrivacy} hitSlop={10} style={styles.iconBtn} accessibilityLabel={isPrivate ? 'Show amounts' : 'Hide amounts'}>
                <Feather name={isPrivate ? 'eye-off' : 'eye'} size={20} color="rgba(247,250,246,0.7)" />
              </Pressable>
              <Pressable
                testID="open-ask-jamvi"
                accessibilityRole="button"
                accessibilityLabel="Ask Jamvi about this budget"
                onPress={openAskJamvi}
                hitSlop={8}
                style={({ pressed }) => [styles.askHeaderButton, { opacity: pressed ? 0.75 : 1 }]}
              >
                <Feather name="message-circle" size={15} color="#FBF7EC" />
                <Text style={styles.askHeaderButtonText}>Ask Jamvi</Text>
              </Pressable>
            </View>
            {/* Month nav */}
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                <Feather name="chevron-left" size={18} color="rgba(247,250,246,0.7)" />
              </Pressable>
              <Text style={styles.monthLabel}>{MONTHS_SHORT[month - 1]} {year}</Text>
              <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8} disabled={isCurrentMonth}>
                <Feather name="chevron-right" size={18} color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'} />
              </Pressable>
            </View>
          </View>

        </LinearGradient>

        {/* Sticky: the one line that says whose money this is. Sits on a solid
            band of the gradient's own mid colour, which is also where the two
            gradient pieces meet, so the join cannot be seen whether the card
            is resting in the header or stuck to the top of the screen. */}
        <View style={styles.workspaceIdentitySticky}>
          <View
            style={[
              styles.workspaceIdentity,
              {
                borderColor: `${workspaceAccentColor}80`,
                backgroundColor: `${workspaceAccentColor}25`,
              },
            ]}
          >
            {workspacePhotoUrl ? (
              <Image
                source={{ uri: workspacePhotoUrl }}
                style={[styles.workspaceIdentityIcon, { borderColor: workspaceAccentColor }]}
              />
            ) : (
              <View style={[styles.workspaceIdentityIcon, { backgroundColor: workspaceAccentColor }]}>
                <Feather name={workspaceIcon} size={18} color={colors.primaryForeground} />
              </View>
            )}
            <View style={styles.workspaceIdentityCopy}>
              <Text style={styles.workspaceIdentityEyebrow}>
                {isSharedWorkspace ? 'SHARED GROUP' : 'PERSONAL BUDGET'}
              </Text>
              <Text style={[styles.workspaceIdentityName, workspaceNameTextStyle(group?.nameStyle)]}>
                {group?.emoji ? `${group.emoji} ` : ''}
                {group?.name || (isSharedWorkspace ? 'Shared group' : 'Personal budget')}
              </Text>
            </View>
          </View>
        </View>

        <LinearGradient
          colors={['#0A3833', colors.brandBlue]}
          style={styles.headerRest}
        >
          {/* What is waiting for you leads Home, in one card. It was four -
              new messages, possible duplicates, Not sure, no category - each a
              full card stacked above the M-Pesa panel (9 Oct 2026 cleanup). */}
          {waitingRows.length > 0 ? (
            <View testID="home-waiting" style={[styles.waitingCard, { backgroundColor: colors.card, borderColor: '#F59E0B' }]}>
              <Text style={[styles.groupCtaEyebrow, { color: '#D97706' }]}>WAITING FOR YOU</Text>
              {waitingRows.map((row, index) => (
                <Pressable
                  key={row.testID}
                  testID={row.testID}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}. ${row.hint}`}
                  onPress={row.onPress}
                  style={({ pressed }) => [
                    styles.waitingRow,
                    index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
                    { opacity: pressed ? 0.78 : 1 },
                  ]}
                >
                  <View style={[styles.waitingIcon, { backgroundColor: `${row.color}22` }]}>
                    <Feather name={row.icon} size={17} color={row.color} />
                  </View>
                  <View style={styles.waitingCopy}>
                    <Text style={[styles.waitingTitle, { color: colors.foreground }]} numberOfLines={2}>{row.title}</Text>
                    <Text style={[styles.waitingHint, { color: colors.mutedForeground }]} numberOfLines={2}>{row.hint}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <MpesaImportCard />

          {/* Each business asked once: a salary from it, or its profit is your income (lib/businessSalary). */}
          {canManageBudget ? <View style={{ marginHorizontal: 16, marginTop: 12 }}><BusinessSalaryQuestion /></View> : null}

          <WorkspaceSetupGuide />

          {/* The three answers - how much do I have, what have I spent, am I on
              track - are the month at a glance. The ring, the Budget/Spent/Left
              strip and the Bank accounts card each said the same again. */}
          <HomeAnswersCard
            balance={bankAccount?.balance}
            spent={summary?.totalSpent}
            budget={summary?.totalBudget}
            hidden={isPrivate}
          />

          {bankAccount && bankAccount.balance < 0 && (
            <Pressable
              accessibilityRole="alert"
              testID="overview-negative-bank-balance-warning"
              onPress={() => router.push('/(tabs)/bank')}
              style={styles.negativeBankBalanceWarning}
            >
              <View style={styles.negativeBankBalanceWarningTitle}>
                <Feather name="flag" size={15} color="#b91c1c" />
                <Text style={styles.negativeBankBalanceWarningTitleText}>Bank balance is below zero</Text>
              </View>
              <Text style={styles.negativeBankBalanceWarningText}>
                {isPrivate
                  ? 'Jamvi kept the withdrawal recorded. Deposit money to clear the shortfall.'
                  : `This budget is short by KES ${shortKES(Math.abs(bankAccount.balance))}. Jamvi kept the withdrawal recorded so the shortfall stays visible.`}
              </Text>
            </Pressable>
          )}

          {!summaryLoading && summary && summary.totalBudget === 0 && (
            <View style={[styles.budgetCtaCard, { backgroundColor: colors.card, borderColor: `${colors.primary}55` }]}>
              <View style={styles.groupCtaHeader}>
                <View style={[styles.groupCtaIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="bar-chart-2" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.groupCtaEyebrow, { color: colors.primary }]}>YOUR NEXT STEP</Text>
                  <Text style={[styles.groupCtaTitle, { color: colors.foreground }]}>No budget yet</Text>
                </View>
              </View>
              <Text style={[styles.groupCtaText, { color: colors.mutedForeground }]}>
                {canManageBudget
                  ? 'Add your first budget category so you can plan spending and see what is left.'
                  : 'An owner or admin will add the budget categories for this Shared group.'}
              </Text>
              {canManageBudget ? (
                <Pressable
                  testID="home-create-first-budget"
                  accessibilityRole="button"
                  accessibilityLabel="Set up your first budget"
                  onPress={() => router.push('/(tabs)/budget')}
                  style={({ pressed }) => [
                    styles.groupCtaButton,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
                  ]}
                >
                  <Text style={[styles.groupCtaButtonText, { color: colors.primaryForeground }]}>Set up your budget</Text>
                  <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
                </Pressable>
              ) : null}
            </View>
          )}

          {isSharedWorkspace && memberContributions.length > 0 && (
            <View style={styles.contribRow}>
              {memberContributions.map((member, index) => (
                <React.Fragment key={member.userId}>
                  {index > 0 && <View style={styles.contribDivider} />}
                  <ContribBar
                    name={member.name}
                    contributed={member.contributed}
                    spent={member.spent}
                    target={member.target ?? 1}
                    color={contributionColors[index % contributionColors.length]}
                    hidden={isPrivate}
                  />
                </React.Fragment>
              ))}
            </View>
          )}
        </LinearGradient>

        <DashboardAnnouncement />

        {/* One Recent activity, in one place, for Personal and Shared alike. */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent activity</Text>
            <Pressable onPress={() => router.push('/(tabs)/history')}>
              <Text style={[styles.seeAll, { color: colors.secondary }]}>See all</Text>
            </Pressable>
          </View>

          {activityLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
          ) : recentActivity.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No activity yet this month</Text>
              <Pressable onPress={() => router.push('/add-expense')} style={[styles.emptyBtn, { borderColor: colors.primary }]}>
                <Text style={[styles.emptyBtnText, { color: colors.primary }]}>Log your first expense</Text>
              </Pressable>
            </View>
          ) : (
            recentActivity.map((item) => (
              <ActivityCard key={item.id} item={item} colors={colors} />
            ))
          )}
        </View>

        {/* Debt sits on Home with the same weight savings has. With nothing
            tracked it offers to start — once, dismissably — because the Debt
            tab only appears after a first debt exists. A viewer is never
            asked: they could not act on it. */}
        <DebtSummaryCard canTrackDebt={canManageBudget} />

        <HomeTip />

        {/* The way to every other area, at the foot of Home rather than in the
            middle of it: the tabs reach most of them already. On a Personal
            budget too: it was shown to groups only. New group is a tile here,
            which is why the Personal budget's "Shared groups" card is gone. */}
        {group && (
          <View style={[styles.overviewNavCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.overviewNavTitle, { color: colors.foreground }]}>{isSharedWorkspace ? 'Your group areas' : 'Your budget areas'}</Text>
              <Pressable onPress={() => setArrangingAreas(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Arrange your ${isSharedWorkspace ? 'group' : 'budget'} areas: reorder, hide or show them`} testID="overview-arrange" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="move" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Arrange</Text>
              </Pressable>
            </View>
            <Text style={[styles.overviewNavSubtitle, { color: colors.mutedForeground }]}>
              Tap Arrange to put them in your order or hide the ones you don't use.
            </Text>
            <View style={styles.overviewNavGrid}>
              {overviewShortcuts.map((shortcut) => (
                <Pressable
                  key={shortcut.label}
                  testID={`overview-shortcut-${shortcut.label.toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${shortcut.label}`}
                  style={({ pressed }) => [
                    styles.overviewNavButton,
                    { backgroundColor: shortcut.bg, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
                  ]}
                  onPress={() => router.push(shortcut.route as any)}
                >
                  <Feather name={shortcut.icon} size={18} color={shortcut.color} />
                  <Text style={[styles.overviewNavButtonText, { color: shortcut.color }]}>{shortcut.label}</Text>
                  <Text style={[styles.overviewNavButtonDescription, { color: colors.mutedForeground }]}>{shortcut.description}</Text>
                  <Feather name="chevron-right" size={13} color={shortcut.color} style={styles.overviewNavChevron} />
                </Pressable>
              ))}
              {/* Hidden areas are not gone: this says how many and brings them back. */}
              {overviewShortcuts.length < allShortcuts.length ? (
                <Pressable
                  testID="overview-shortcut-more"
                  accessibilityRole="button"
                  accessibilityLabel={`${allShortcuts.length - overviewShortcuts.length} more areas hidden. Open Arrange to show them.`}
                  style={({ pressed }) => [
                    styles.overviewNavButton,
                    { backgroundColor: colors.muted, borderColor: colors.border, borderStyle: 'dashed', opacity: pressed ? 0.78 : 1 },
                  ]}
                  onPress={() => setArrangingAreas(true)}
                >
                  <Feather name="plus" size={18} color={colors.primary} />
                  <Text style={[styles.overviewNavButtonText, { color: colors.primary }]}>{allShortcuts.length - overviewShortcuts.length} more</Text>
                  <Text style={[styles.overviewNavButtonDescription, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {allShortcuts.filter((shortcut) => !overviewShortcuts.some((shown) => shown.id === shortcut.id)).map((shortcut) => shortcut.label).join(', ')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <ArrangeSheet
              visible={arrangingAreas}
              title={`Arrange your ${isSharedWorkspace ? 'group' : 'budget'} areas`}
              hint={`Put them in the order you use them, and hide any you never open. Kept on this phone, for this ${isSharedWorkspace ? 'group' : 'budget'}.`}
              items={allShortcuts}
              arrangement={areasArrangement}
              onChange={setAreasArrangement}
              onClose={() => setArrangingAreas(false)}
              testID="overview-arrange-sheet"
            />
          </View>
        )}
      </PageScrollView>

      <Modal
        visible={askOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAskOpen(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.askModalOverlay}>
          <View style={[styles.askModalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.askModalHeader}>
              <View style={styles.askModalTitleRow}>
                <View style={[styles.askModalIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="search" size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.askModalTitle, { color: colors.foreground }]}>Ask Jamvi</Text>
                  <Text style={[styles.askModalSubtitle, { color: colors.mutedForeground }]}>
                    Ask about anything in this budget: spending, bank accounts, income, goals, activity, categories, or reports. Jamvi explains your numbers but cannot change records or move money.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setAskOpen(false)}
                hitSlop={8}
                accessibilityLabel="Close Ask Jamvi"
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {/* Scrolls inside the sheet, so a long answer never pushes the
                close button off the top of the screen. */}
            <AskScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              value={askQuery}
              onChangeText={setAskQuery}
              onSubmitEditing={() => void askJamvi()}
              placeholder="Ask about history, reports, goals, banks, or any ledger…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.askInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
              accessibilityLabel="Ask Jamvi a question"
              returnKeyType="send"
              maxLength={500}
              editable={!asking}
            />
            <Pressable
              testID="submit-ask-jamvi"
              accessibilityRole="button"
              accessibilityLabel="Send question to Ask Jamvi"
              onPress={() => void askJamvi()}
              disabled={!askQuery.trim() || asking}
              style={[styles.askSubmit, { backgroundColor: colors.primary, opacity: !askQuery.trim() || asking ? 0.5 : 1 }]}
            >
              {asking ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <>
                  <Feather name="send" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.askSubmitText, { color: colors.primaryForeground }]}>Ask Jamvi</Text>
                </>
              )}
            </Pressable>
            <View style={styles.askPromptList}>
              {['How did this month compare with my history?', 'How much have I spent on rent?', 'What is in each bank account?', 'Which goals need attention?', 'Who has contributed?', 'What are my highest spending categories?'].map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => void askJamvi(prompt)}
                  disabled={asking}
                  style={[styles.askPrompt, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}0D`, opacity: asking ? 0.6 : 1 }]}
                >
                  <Text style={[styles.askPromptText, { color: colors.foreground }]}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
            {askError ? (
              <Text style={[styles.askError, { color: colors.destructive }]}>{askError}</Text>
            ) : null}
            {askThread.length > 0 ? (
              <View style={{ gap: 6 }} testID="ask-jamvi-thread">
                {askThread.slice(-3).map((turn, index) => {
                  // A folded summary: tap to read it whole, tap again to fold it.
                  const key = `${index}-${turn.question}`;
                  const open = openTurn === key;
                  return (
                    <Pressable key={key} onPress={() => setOpenTurn(open ? null : key)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={`ask-jamvi-turn-${index}`} style={{ gap: 2 }}>
                      <Text style={[styles.askAnswerMeta, { color: colors.mutedForeground }]} numberOfLines={open ? undefined : 2}>You: {turn.question}</Text>
                      <Text style={[styles.askAnswerMeta, { color: colors.foreground }]} numberOfLines={open ? undefined : 3}>{turn.answer}</Text>
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{open ? 'Show less' : 'Show all'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {askAnswer ? (
              <View style={[styles.askAnswer, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}0D` }]}>
                <Text style={[styles.askAnswerLabel, { color: colors.primary }]}>JAMVI SAYS</Text>
                {askAnswer.question ? (
                  <Text style={[styles.askAnswerMeta, { color: colors.mutedForeground }]} numberOfLines={2}>You asked: {askAnswer.question}</Text>
                ) : null}
                <Text style={[styles.askAnswerText, { color: colors.foreground }]}>{askAnswer.answer}</Text>
                {(askAnswer.links ?? []).length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }} testID="ask-jamvi-links">
                    {(askAnswer.links ?? []).map((link) => (
                      <Pressable
                        key={link.route}
                        onPress={() => { reopenAsk.current = true; setAskOpen(false); router.push(link.route as never); }}
                        accessibilityRole="button"
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.primary }}
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{link.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                  <Pressable onPress={newAskConversation} accessibilityRole="button" testID="ask-jamvi-new" hitSlop={6}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>New question</Text>
                  </Pressable>
                  {/* Tucks the answer away and stays in Ask Jamvi; the X at the top is what leaves. */}
                  <Pressable onPress={() => setAskAnswer(null)} accessibilityRole="button" testID="ask-jamvi-hide-answer" hitSlop={6}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Hide answer</Text>
                  </Pressable>
                </View>
                <Text style={[styles.askAnswerMeta, { color: colors.mutedForeground }]}>
                  Read-only · {askAnswer.workspaceScoped ? 'Current budget only' : 'Unscoped'}
                </Text>
              </View>
            ) : null}
            </AskScroll>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function ContribBar({ name, contributed, spent, target, color, hidden }: {
  name: string;
  contributed: number;
  spent: number;
  target: number;
  color: string;
  hidden: boolean;
}) {
  const net = contributed - spent;
  const contributedPercent = Math.min(contributed / Math.max(target, 1), 1);
  const spentPercent = Math.min(spent / Math.max(contributed, 1), 1);
  const format = (value: number) => hidden
    ? '••••'
    : value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

  return (
    <View style={styles.contribItem}>
      <View style={styles.contribLabelRow}>
        <Text style={styles.contribName}>{name}</Text>
        <Text style={[styles.contribAmt, { color: net < 0 ? '#f87171' : color }]}>
          {hidden ? '••••' : `Net ${net >= 0 ? '+' : ''}${format(net)}`}
        </Text>
      </View>
      <View style={styles.contribTrack}>
        <View style={[styles.contribFill, { width: `${contributedPercent * 100}%` as any, backgroundColor: color, opacity: 0.35 }]} />
        <View style={[styles.contribFill, StyleSheet.absoluteFillObject, { width: `${spentPercent * contributedPercent * 100}%` as any, backgroundColor: '#ef4444' }]} />
      </View>
      <View style={styles.contribLabelRow}>
        <Text style={styles.contribSubLabel}>In: {format(contributed)}</Text>
        <Text style={styles.contribSubLabel}>Out: {format(spent)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  accessContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  accessCard: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: 'center' },
  accessIcon: { width: 54, height: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accessTitle: { marginTop: 18, fontSize: 21, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  accessText: { marginTop: 9, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  accessButton: { marginTop: 22, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  accessButtonText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  header: { paddingHorizontal: 20, paddingBottom: 20 },
  // The top piece runs into the sticky band, so it must not add space of its own.
  headerTopPiece: { paddingBottom: 0 },
  // Solid mid-gradient colour: the shade both pieces meet at, so the card
  // looks identical resting in the header and stuck to the top.
  workspaceIdentitySticky: {
    backgroundColor: '#0A3833',
    paddingHorizontal: 20,
    paddingTop: 16,
    // An edge, because the band holds still while the gradient behind it
    // scrolls. Matching the colour where the two gradient pieces meet keeps
    // the join invisible while the card is resting, but once it is pinned the
    // tone beneath it has moved on and content passes under a line that is
    // not drawn - which reads as clipped rather than deliberate.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerRest: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  greetingBlock: { flex: 1, minWidth: 0 },
  headerUtilityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  utilityControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workspaceIdentity: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 15, padding: 10, marginBottom: 16 },
  workspaceIdentityIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  workspaceIdentityCopy: { flex: 1, minWidth: 0 },
  workspaceIdentityEyebrow: { fontSize: 9, color: '#C2BBA8', fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  workspaceIdentityName: { fontSize: 16, color: '#FBF7EC', marginTop: 2 },
  iconBtn: { padding: 4 },
  askHeaderButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(247,250,246,0.28)', backgroundColor: 'rgba(247,250,246,0.08)', paddingHorizontal: 11, paddingVertical: 6 },
  askHeaderButtonText: { fontSize: 12, color: '#FBF7EC', fontFamily: 'Inter_600SemiBold' },
  greeting: { fontSize: 12, color: '#C2BBA8', fontFamily: 'Inter_400Regular' },
  name: { fontSize: 20, fontWeight: '700' as const, color: '#FBF7EC', fontFamily: 'Inter_700Bold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 13, color: '#FBF7EC', fontFamily: 'Inter_500Medium', minWidth: 56, textAlign: 'center' },

  contribRow: { flexDirection: 'row', gap: 12 },
  contribDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  contribItem: { flex: 1 },
  contribLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  contribName: { fontSize: 11, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular' },
  contribAmt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  contribTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  contribFill: { height: '100%', borderRadius: 2 },
  contribSubLabel: { fontSize: 9, color: 'rgba(247,250,246,0.4)', fontFamily: 'Inter_400Regular' },

  overviewNavCard: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 16 },
  overviewNavTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 4 },
  overviewNavSubtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 },
  overviewNavGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  overviewNavButton: { width: '47%', minWidth: 0, minHeight: 78, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 9, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, position: 'relative' },
  overviewNavButtonText: { width: '100%', maxWidth: '100%', flexShrink: 1, fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  overviewNavButtonDescription: { width: '100%', maxWidth: '100%', flexShrink: 1, fontSize: 9, lineHeight: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  overviewNavChevron: { position: 'absolute', top: 6, right: 6 },
  waitingCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  waitingIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  waitingCopy: { flex: 1, minWidth: 0 },
  waitingTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  waitingHint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 2 },
  budgetCtaCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 16 },
  groupCtaHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  groupCtaIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  groupCtaEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  groupCtaTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 3 },
  groupCtaText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 11 },
  groupCtaButton: { minHeight: 46, borderRadius: 8, paddingHorizontal: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  groupCtaButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  askModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1, 28, 78, 0.48)' },
  askModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '92%' },
  askModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  askModalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  askModalIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  askModalTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  askModalSubtitle: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  askInput: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  askSubmit: { minHeight: 46, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  askSubmitText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  askPromptList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  askPrompt: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 },
  askPromptText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  askError: { fontSize: 12, lineHeight: 17, marginTop: 13, fontFamily: 'Inter_500Medium' },
  askAnswer: { borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 15 },
  askAnswerLabel: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  askAnswerText: { fontSize: 14, lineHeight: 21, marginTop: 5, fontFamily: 'Inter_400Regular' },
  askAnswerMeta: { fontSize: 10, marginTop: 9, fontFamily: 'Inter_400Regular' },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  emptyBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  emptyBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  negativeBankBalanceWarning: { gap: 5, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 6, backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 10 },
  negativeBankBalanceWarningTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  negativeBankBalanceWarningTitleText: { color: '#991b1b', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  negativeBankBalanceWarningText: { color: '#7f1d1d', fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
});
