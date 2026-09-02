import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import BudgetRing from '@/components/BudgetRing';
import ActivityCard from '@/components/ActivityCard';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import { getExpenseEditHref } from '@/lib/expenseEditLink';
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetExpenses,
  useGetJointAccount,
  useGetGroup,
  customFetch,
} from '@workspace/api-client-react';

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
  { icon: 'file-text',   label: 'Expenses',      color: '#FDBB0A', bg: '#392D08', route: '/(tabs)/history',       description: 'Review spending' },
  { icon: 'target',      label: 'Goals',         color: '#6C9FE6', bg: '#0A254E', route: '/(tabs)/goals',         description: 'Track targets' },
  { icon: 'credit-card', label: 'Bank',          color: '#08B7B0', bg: '#0B343B', route: '/(tabs)/bank',          description: 'Manage funds' },
  { icon: 'pie-chart',   label: 'Reports',       color: '#6C9FE6', bg: '#0A254E', route: '/(tabs)/reports',       description: 'Understand trends' },
];

export default function DashboardScreen() {
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

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetDashboardSummary({ month, year });

  const {
    data: activity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useGetDashboardActivity();
  const {
    data: expenses = [],
    refetch: refetchExpenses,
  } = useGetExpenses({ month, year });

  const {
    data: bankAccount,
    isLoading: bankAccountLoading,
    refetch: refetchBank,
  } = useGetJointAccount();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const [refreshing, setRefreshing] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuery, setAskQuery] = useState('');
  const [askAnswer, setAskAnswer] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity(), refetchExpenses(), refetchBank()]);
    setRefreshing(false);
  }, [refetchSummary, refetchActivity, refetchExpenses, refetchBank]);

  const askJamvi = useCallback(async (value?: string) => {
    const question = (value ?? askQuery).trim();
    if (!question || asking) return;
    setAskQuery(question);
    setAskAnswer(null);
    setAskError(null);
    setAsking(true);
    try {
      const response = await customFetch<AskResponse>('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, month, year }),
      });
      setAskAnswer(response);
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'Ask Jamvi could not answer right now.');
    } finally {
      setAsking(false);
    }
  }, [askQuery, asking, month, year]);

  const openAskJamvi = useCallback(() => {
    setAskError(null);
    setAskOpen(true);
  }, []);

  // Compute this-month bank totals from transactions
  const monthlyDeposited = useMemo(() => {
    return (bankAccount?.transactions ?? [])
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'deposit' && d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [bankAccount, month, year]);

  const monthlyDisbursed = useMemo(() => {
    return (bankAccount?.transactions ?? [])
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'disbursement' && d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [bankAccount, month, year]);

  const isOver = summary ? summary.totalSpent > summary.totalBudget : false;
  const spentPercent = summary?.totalBudget
    ? summary.totalSpent / summary.totalBudget
    : 0;
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
  const workspaceAccentColor = group?.accentColor ?? colors.brandBlue;
  const workspaceIcon = (group?.icon ?? 'users') as keyof typeof Feather.glyphMap;
  const workspacePhotoUrl = isSharedWorkspace ? group?.photoUrl : user?.profileImageUrl;
  const canManageBudget = !isSharedWorkspace || group?.role === 'owner' || group?.role === 'admin';
  const canManageExpenses = !isSharedWorkspace || group?.role === 'owner' || group?.role === 'admin';
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
    return (
      <View style={[styles.accessContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.accessIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="home" size={25} color={colors.primary} />
          </View>
          <Text style={[styles.accessTitle, { color: colors.foreground }]}>Join this group first</Text>
          <Text style={[styles.accessText, { color: colors.mutedForeground }]}>
            Shared funds, budgets, and savings goals stay private. Ask someone already in this group to add you from Settings.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={[styles.accessButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.accessButtonText}>Open Settings</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageScrollView
        style={{ backgroundColor: colors.background }}
        overScrollMode="never"
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
          colors={[colors.brandNavy, '#05255E', colors.brandBlue]}
          style={[styles.header, { paddingTop: topPad + 12 }]}
        >
          <View style={styles.homeStatus}>
            <Feather name="home" size={13} color={colors.secondary} />
            <Text style={styles.homeStatusText}>HOME · START HERE</Text>
          </View>

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
                foregroundColor="#F4F8FF"
              />
            </Pressable>
          </View>

          {/* Utility row: privacy, settings, and month */}
          <View style={styles.headerUtilityRow}>
            <View style={styles.utilityControls}>
              {/* Privacy toggle */}
              <Pressable onPress={togglePrivacy} hitSlop={10} style={styles.iconBtn}>
                <Feather name={isPrivate ? 'eye-off' : 'eye'} size={20} color="rgba(247,250,246,0.7)" />
              </Pressable>
              {/* Settings */}
              <Pressable onPress={() => router.push('/(tabs)/settings')} hitSlop={10} style={styles.iconBtn}>
                <Feather name="settings" size={19} color="rgba(247,250,246,0.7)" />
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
                {isSharedWorkspace ? 'SHARED BUDGET' : 'PERSONAL BUDGET'}
              </Text>
              <Text style={[styles.workspaceIdentityName, workspaceNameTextStyle(group?.nameStyle)]}>
                {group?.emoji ? `${group.emoji} ` : ''}
                {group?.name || (isSharedWorkspace ? 'Shared budget' : 'Personal budget')}
              </Text>
            </View>
          </View>

          {isSharedWorkspace && (
            <View style={[styles.overviewNavCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.overviewNavEyebrow, { color: colors.primary }]}>GROUP OVERVIEW</Text>
              <Text style={[styles.overviewNavTitle, { color: colors.foreground }]}>Your group areas</Text>
              <Text style={[styles.overviewNavSubtitle, { color: colors.mutedForeground }]}>
                Quickly see what each Group tab helps you manage.
              </Text>
              <View style={styles.overviewNavGrid}>
                {SHARED_OVERVIEW_SHORTCUTS.map((shortcut) => (
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
              </View>
            </View>
          )}

          {isSharedWorkspace && (
            <View style={styles.ringWrap}>
              <BudgetRing
                percent={spentPercent}
                spent={summary?.totalSpent ?? 0}
                total={summary?.totalBudget ?? 0}
                isOver={isOver}
                hideValues={isPrivate}
              />
            </View>
          )}

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <StatCell label="Budget" value={isPrivate ? '••••' : shortKES(summary?.totalBudget)} />
            <View style={styles.stripDivider} />
            <StatCell label="Spent" value={isPrivate ? '••••' : shortKES(summary?.totalSpent)} valueColor={isOver ? colors.destructive : colors.foreground} />
            <View style={styles.stripDivider} />
            <StatCell label="Left" value={isPrivate ? '••••' : shortKES(summary?.remaining)} valueColor={isOver ? colors.destructive : colors.success} />
          </View>

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

        <View
          testID="ask-jamvi-cta"
          style={[styles.askCtaCard, { backgroundColor: colors.card, borderColor: `${colors.primary}55` }]}
        >
          <View style={styles.groupCtaHeader}>
            <View style={[styles.askCtaIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Feather name="search" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.groupCtaEyebrow, { color: colors.primary }]}>QUICK ANSWERS</Text>
              <Text style={[styles.groupCtaTitle, { color: colors.foreground }]}>Ask Jamvi</Text>
            </View>
          </View>
          <Text style={[styles.groupCtaText, { color: colors.mutedForeground }]}>
            Ask about anything in this budget: spending, bank accounts, income, goals, activity, categories, or reports. Jamvi explains your numbers but cannot change records or move money.
          </Text>
          <Pressable
            testID="open-ask-jamvi"
            accessibilityRole="button"
            accessibilityLabel="Ask Jamvi about this budget"
            onPress={openAskJamvi}
            style={({ pressed }) => [
              styles.groupCtaButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Text style={[styles.groupCtaButtonText, { color: colors.primaryForeground }]}>Ask Jamvi</Text>
            <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
          </Pressable>
        </View>

        {editableUncategorizedExpenses.length > 0 && (
          <View
            testID="uncategorized-expense-cta"
            accessibilityLiveRegion="polite"
            style={[styles.uncategorizedCtaCard, { backgroundColor: colors.card, borderColor: '#F59E0B' }]}
          >
            <View style={styles.groupCtaHeader}>
              <View style={[styles.groupCtaIcon, { backgroundColor: '#F59E0B22' }]}>
                <Feather name="bell" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupCtaEyebrow, { color: '#D97706' }]}>NEEDS YOUR ATTENTION</Text>
                <Text style={[styles.groupCtaTitle, { color: colors.foreground }]}>
                  {editableUncategorizedExpenses.length} expense{editableUncategorizedExpenses.length === 1 ? '' : 's'} waiting for a category
                </Text>
              </View>
            </View>
            <Text style={[styles.groupCtaText, { color: colors.mutedForeground }]}>
              Categorize these expenses so category budgets and reports show where the money went.
            </Text>
            <View style={styles.uncategorizedList}>
              {editableUncategorizedExpenses.slice(0, 3).map((expense) => (
                <Pressable
                  key={expense.id}
                  testID={`categorize-expense-${expense.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Categorize ${expense.description}`}
                  onPress={() => router.push(getExpenseEditHref(expense) as never)}
                  style={({ pressed }) => [
                    styles.uncategorizedRow,
                    { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
                  ]}
                >
                  <View style={styles.uncategorizedCopy}>
                    <Text numberOfLines={1} style={[styles.uncategorizedDescription, { color: colors.foreground }]}>{expense.description}</Text>
                    <Text style={[styles.uncategorizedAmount, { color: colors.mutedForeground }]}>KES {formatKES(expense.amount)}</Text>
                  </View>
                  <Text style={[styles.uncategorizedAction, { color: colors.primary }]}>Categorize now</Text>
                  <Feather name="chevron-right" size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          </View>
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
                : 'An owner or admin will add the budget categories for this Shared budget.'}
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

        {/* Personal budget keeps activity before the account summary. */}
        {!isSharedWorkspace && <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>UPDATES</Text>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent activity</Text>
            </View>
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
        </View>}

        {/* Bank Account Balance Card */}
        <Pressable
          style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/bank')}
        >
          <View style={styles.bankCardHeader}>
            <View style={styles.bankIconWrap}>
              <Feather name="credit-card" size={18} color={colors.brandTeal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bankCardTitle, { color: colors.foreground }]}>Bank accounts</Text>
              <Text style={[styles.bankCardSub, { color: colors.mutedForeground }]}>Your personalized accounts</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
          <View style={styles.bankStatsRow}>
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>BALANCE</Text>
              {bankAccountLoading ? (
                <BankBalanceSkeleton />
              ) : (
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.bankBalance, { color: colors.info }]}>
                  {bankAccount ? (isPrivate ? '••••' : `KES ${formatKES(bankAccount.balance)}`) : '—'}
                </Text>
              )}
            </View>
            <View style={[styles.bankStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>IN THIS MONTH</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.bankStatValue, { color: colors.success }]}>
                {isPrivate ? '••••' : `+KES ${formatKES(monthlyDeposited)}`}
              </Text>
            </View>
            <View style={[styles.bankStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>OUT THIS MONTH</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.bankStatValue, { color: colors.destructive }]}>
                {isPrivate ? '••••' : `-KES ${formatKES(monthlyDisbursed)}`}
              </Text>
            </View>
          </View>
          {bankAccount && bankAccount.balance === 0 && (!bankAccount.transactions || bankAccount.transactions.length === 0) && (
            <View style={styles.bankEmptyState}>
              <Feather name="inbox" size={15} color={colors.brandTeal} style={{ opacity: 0.6 }} />
              <Text style={styles.bankEmptyText}>No deposits yet — tap to add one</Text>
            </View>
          )}
           {bankAccount && bankAccount.balance < 0 && (
             <View
               accessibilityRole="alert"
               testID="overview-negative-bank-balance-warning"
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
             </View>
           )}
        </Pressable>

        {isSharedWorkspace && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>
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
              </View>
            ) : (
              recentActivity.map((item) => (
                <ActivityCard key={item.id} item={item} colors={colors} />
              ))
            )}
          </View>
        )}

        {!isSharedWorkspace && (
          <View style={[styles.groupCtaCard, { backgroundColor: colors.card, borderColor: `${colors.primary}55` }]}>
            <View style={styles.groupCtaHeader}>
              <View style={[styles.groupCtaIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Feather name="users" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupCtaEyebrow, { color: colors.primary }]}>SHARED BUDGETS</Text>
                <Text style={[styles.groupCtaTitle, { color: colors.foreground }]}>Manage budgets with others</Text>
              </View>
            </View>
            <Text style={[styles.groupCtaText, { color: colors.mutedForeground }]}>
              Create a Shared budget from Settings when you are ready to manage money with a group.
            </Text>
            <Pressable
              testID="home-create-shared-budget-cta"
              accessibilityRole="button"
              accessibilityLabel="Open Settings to manage Shared budgets"
              onPress={() => router.push('/(tabs)/settings')}
              style={({ pressed }) => [
                styles.groupCtaButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={[styles.groupCtaButtonText, { color: colors.primaryForeground }]}>Manage Shared budgets</Text>
              <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
            </Pressable>
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
                    Ask about this month or your available history across this budget. Answers stay read-only.
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
            {askAnswer ? (
              <View style={[styles.askAnswer, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}0D` }]}>
                <Text style={[styles.askAnswerLabel, { color: colors.primary }]}>JAMVI SAYS</Text>
                <Text style={[styles.askAnswerText, { color: colors.foreground }]}>{askAnswer.answer}</Text>
                <Text style={[styles.askAnswerMeta, { color: colors.mutedForeground }]}>
                  Read-only · {askAnswer.workspaceScoped ? 'Current budget only' : 'Unscoped'}
                </Text>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function StatCell({ label, value, valueColor = '#F4F8FF' }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function BankBalanceSkeleton() {
  const opacity = useSharedValue(0.45);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 650 }),
        withTiming(0.45, { duration: 650 }),
      ),
      -1,
    );

    return () => cancelAnimation(opacity);
  }, [opacity]);

  return (
    <Animated.View
      accessible
      accessibilityLabel="Loading bank balance"
      style={[styles.bankBalanceSkeleton, animatedStyle]}
    />
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
  accessCard: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center' },
  accessIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accessTitle: { marginTop: 18, fontSize: 21, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  accessText: { marginTop: 9, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  accessButton: { marginTop: 22, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  accessButtonText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  header: { paddingHorizontal: 20, paddingBottom: 20 },
  homeStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9 },
  homeStatusText: { fontSize: 10, color: '#FDBB0A', fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  greetingBlock: { flex: 1, minWidth: 0 },
  headerUtilityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  utilityControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workspaceIdentity: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 15, padding: 10, marginBottom: 16 },
  workspaceIdentityIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  workspaceIdentityCopy: { flex: 1, minWidth: 0 },
  workspaceIdentityEyebrow: { fontSize: 9, color: '#A5B9D4', fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  workspaceIdentityName: { fontSize: 16, color: '#F4F8FF', marginTop: 2 },
  iconBtn: { padding: 4 },
  greeting: { fontSize: 12, color: '#A5B9D4', fontFamily: 'Inter_400Regular' },
  name: { fontSize: 20, fontWeight: '700' as const, color: '#F4F8FF', fontFamily: 'Inter_700Bold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 13, color: '#F4F8FF', fontFamily: 'Inter_500Medium', minWidth: 56, textAlign: 'center' },

  statsStrip: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingVertical: 12, marginBottom: 14 },
  statCell: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#A5B9D4', fontFamily: 'Inter_400Regular', letterSpacing: 0.5, marginBottom: 3 },
  statValue: { fontSize: 11, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', opacity: 0.75 },
  stripDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  ringWrap: { alignItems: 'center', marginBottom: 16 },
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
  overviewNavEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  overviewNavTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 4 },
  overviewNavSubtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 },
  overviewNavGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  overviewNavButton: { width: '47%', minWidth: 0, minHeight: 78, borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 9, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, position: 'relative' },
  overviewNavButtonText: { width: '100%', maxWidth: '100%', flexShrink: 1, fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  overviewNavButtonDescription: { width: '100%', maxWidth: '100%', flexShrink: 1, fontSize: 9, lineHeight: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  overviewNavChevron: { position: 'absolute', top: 6, right: 6 },
  groupCtaCard: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 16 },
  budgetCtaCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 16 },
  uncategorizedCtaCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 16 },
  askCtaCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 16 },
  askCtaIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  uncategorizedList: { marginTop: 12, gap: 8 },
  uncategorizedRow: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  uncategorizedCopy: { minWidth: 0, flex: 1 },
  uncategorizedDescription: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  uncategorizedAmount: { marginTop: 2, fontSize: 11, fontFamily: 'Inter_400Regular' },
  uncategorizedAction: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  groupCtaHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  groupCtaIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupCtaEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  groupCtaTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 3 },
  groupCtaText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 11 },
  groupCtaButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  groupCtaButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  askModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1, 28, 78, 0.48)' },
  askModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  askModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  askModalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  askModalIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  askModalTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  askModalSubtitle: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  askInput: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  askSubmit: { minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  askSubmitText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  askPromptList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  askPrompt: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 },
  askPromptText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  askError: { fontSize: 12, lineHeight: 17, marginTop: 13, fontFamily: 'Inter_500Medium' },
  askAnswer: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 15 },
  askAnswerLabel: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  askAnswerText: { fontSize: 14, lineHeight: 21, marginTop: 5, fontFamily: 'Inter_400Regular' },
  askAnswerMeta: { fontSize: 10, marginTop: 9, fontFamily: 'Inter_400Regular' },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 3 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  emptyBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  emptyBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  bankCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  bankCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  bankIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(56,189,248,0.15)', alignItems: 'center', justifyContent: 'center' },
  bankCardTitle: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  bankCardSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  bankStatsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.15)' },
  bankStat: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  bankStatLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.4, marginBottom: 3 },
  bankBalance: { width: '100%', flexShrink: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  bankBalanceSkeleton: { width: 62, height: 16, borderRadius: 4, backgroundColor: 'rgba(56,189,248,0.25)' },
  bankStatValue: { width: '100%', flexShrink: 1, textAlign: 'center', fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  bankStatDivider: { width: 1, marginVertical: 10 },

  bankEmptyState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.15)' },
  bankEmptyText: { fontSize: 13, color: '#08B7B0', fontFamily: 'Inter_400Regular', opacity: 0.8 },
  negativeBankBalanceWarning: { gap: 5, marginHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 10 },
  negativeBankBalanceWarningTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  negativeBankBalanceWarningTitleText: { color: '#991b1b', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  negativeBankBalanceWarningText: { color: '#7f1d1d', fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
});
