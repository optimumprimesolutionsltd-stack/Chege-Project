import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
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
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import BudgetRing from '@/components/BudgetRing';
import ActivityCard from '@/components/ActivityCard';
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetJointAccount,
  useGetSavingsGoals,
  useGetMembers,
} from '@workspace/api-client-react';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PRIVACY_KEY = 'dashboard_privacy';

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
  color: string;
  bg: string;
  route: string;
};

const SHORTCUTS: Shortcut[] = [
  { icon: 'plus-circle', label: 'Expense',  color: '#4ade80', bg: '#1a3320', route: '/add-expense'            },
  { icon: 'credit-card', label: 'Deposit',  color: '#f97316', bg: '#2a1c0a', route: '/(tabs)/bank'            },
  { icon: 'pie-chart',   label: 'Reports',  color: '#60a5fa', bg: '#0a1a2a', route: '/(tabs)/reports'         },
  { icon: 'bar-chart-2', label: 'Budget',   color: '#a78bfa', bg: '#1a0a2a', route: '/(tabs)/budget'          },
  { icon: 'settings',    label: 'Settings', color: '#94a3b8', bg: '#1a1a28', route: '/(tabs)/settings'        },
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
    data: bankAccount,
    isLoading: bankAccountLoading,
    refetch: refetchBank,
  } = useGetJointAccount();
  const { data: savingsGoals = [], refetch: refetchGoals } = useGetSavingsGoals();
  const { data: members = [], refetch: refetchMembers } = useGetMembers();
  const canManageSetup = members.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === 'owner' || member.role === 'admin'),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity(), refetchBank(), refetchGoals(), refetchMembers()]);
    setRefreshing(false);
  }, [refetchSummary, refetchActivity, refetchBank]);

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

  const spentPercent = summary
    ? summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0
    : 0;
  const isOver = summary ? summary.totalSpent > summary.totalBudget : false;

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
  const setupSteps = [
    {
      label: 'Set a monthly budget',
      detail: 'Plan what your group can spend this month.',
      icon: 'bar-chart-2' as const,
      color: '#a78bfa',
      route: '/(tabs)/budget',
      done: (summary?.totalBudget ?? 0) > 0,
    },
    {
      label: 'Set up shared bank',
      detail: 'Record the first deposit into your joint funds.',
      icon: 'credit-card' as const,
      color: '#38bdf8',
      route: '/(tabs)/bank',
      done: (bankAccount?.transactions?.length ?? 0) > 0,
    },
    {
      label: 'Create a savings goal',
      detail: 'Save together for something important.',
      icon: 'target' as const,
      color: '#f59e0b',
      route: '/(tabs)/goals',
      done: savingsGoals.length > 0,
    },
    {
      label: 'Invite your group',
      detail: 'Add the people who will use this budget.',
      icon: 'users' as const,
      color: '#4ade80',
      route: '/(tabs)/settings',
      done: members.length > 1,
    },
  ];
  const completeSetupSteps = setupSteps.filter(step => step.done).length;
  const pendingSetupSteps = setupSteps.filter(step => !step.done);
  const nextSetupStep = pendingSetupSteps[0];
  const laterSetupSteps = pendingSetupSteps.slice(1);
  const isSetupComplete = completeSetupSteps === setupSteps.length;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  // Contribution bars — dynamic per member
  type MemberContrib = { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };
  const memberContribs = ((summary as any)?.memberContributions ?? []) as MemberContrib[];
  const CONTRIBS_COLORS = ['#4ade80', '#f97316', '#38bdf8', '#f472b6', '#a78bfa'];

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
        }
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : 110 }}
      >
        {/* Dark header */}
        <LinearGradient
          colors={['#0a1a10', '#0f2217', '#132a1c']}
          style={[styles.header, { paddingTop: topPad + 12 }]}
        >
          {/* Top row: greeting + controls */}
          <View style={styles.headerTop}>
            <View>
              {displayName ? (
                <Text>
                  <Text style={styles.greeting}>{greeting}, </Text>
                  <Text style={styles.name}>{displayName}!</Text>
                </Text>
              ) : (
                <Text style={styles.greeting}>{greeting}</Text>
              )}
            </View>
            <View style={styles.headerControls}>
              {/* Privacy toggle */}
              <Pressable onPress={togglePrivacy} hitSlop={10} style={styles.iconBtn}>
                <Feather name={isPrivate ? 'eye-off' : 'eye'} size={20} color="rgba(247,250,246,0.7)" />
              </Pressable>
              {/* Settings */}
              <Pressable onPress={() => router.push('/(tabs)/settings')} hitSlop={10} style={styles.iconBtn}>
                <Feather name="settings" size={19} color="rgba(247,250,246,0.7)" />
              </Pressable>
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
          </View>

          {/* Budget ring */}
          <View style={styles.ringWrap}>
            {summaryLoading ? (
              <View style={styles.ringPlaceholder}>
                <ActivityIndicator size="large" color="#cf7217" />
              </View>
            ) : (
              <BudgetRing
                percent={spentPercent}
                spent={summary?.totalSpent ?? 0}
                total={summary?.totalBudget ?? 0}
                isOver={isOver}
                hideValues={isPrivate}
              />
            )}
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <StatCell label="Budget" value={isPrivate ? '••••' : shortKES(summary?.totalBudget)} />
            <View style={styles.stripDivider} />
            <StatCell label="Spent" value={isPrivate ? '••••' : shortKES(summary?.totalSpent)} valueColor={isOver ? '#f87171' : '#f7faf6'} />
            <View style={styles.stripDivider} />
            <StatCell label="Left" value={isPrivate ? '••••' : shortKES(summary?.remaining)} valueColor={isOver ? '#f87171' : '#4ade80'} />
          </View>

          {/* Contribution mini-bars — one per group member */}
          {summary && memberContribs.length > 0 && (
            <View style={styles.contribRow}>
              {memberContribs.map((m, idx) => (
                <React.Fragment key={m.userId}>
                  {idx > 0 && <View style={styles.contribDivider} />}
                  <ContribBar
                    name={m.name}
                    contributed={m.contributed}
                    spent={m.spent}
                    target={m.target ?? 1}
                    color={CONTRIBS_COLORS[idx % CONTRIBS_COLORS.length]}
                    hidden={isPrivate}
                  />
                </React.Fragment>
              ))}
            </View>
          )}
        </LinearGradient>

        {/* Quick shortcuts */}
        <View style={styles.shortcutRow}>
          {SHORTCUTS.map(s => (
            <Pressable
              key={s.label}
              style={[styles.shortcutBtn, { backgroundColor: s.bg }]}
              onPress={() => router.push(s.route as any)}
              hitSlop={4}
            >
              <Feather name={s.icon} size={20} color={s.color} />
              <Text style={[styles.shortcutLabel, { color: s.color }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {canManageSetup && (nextSetupStep || isSetupComplete) && (
          <View
            style={[
              styles.setupCard,
              {
                backgroundColor: isSetupComplete ? colors.muted : colors.card,
                borderColor: isSetupComplete ? colors.border : colors.primary,
              },
            ]}
          >
            <View style={styles.setupHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.setupEyebrowRow}>
                  {!isSetupComplete && <Feather name="zap" size={12} color={colors.primary} />}
                  <Text style={[styles.setupEyebrow, { color: isSetupComplete ? colors.mutedForeground : colors.primary }]}>
                    GET STARTED · {completeSetupSteps} OF {setupSteps.length} COMPLETE
                  </Text>
                </View>
                <Text style={[styles.setupTitle, { color: isSetupComplete ? colors.foreground : colors.primaryForeground }]}>
                  {isSetupComplete ? 'You’re all set' : 'Finish setting up Bajeti'}
                </Text>
                <Text style={[styles.setupSubtitle, { color: isSetupComplete ? colors.mutedForeground : 'rgba(255,255,255,0.78)' }]}>
                  {isSetupComplete ? 'Your core setup is complete.' : 'A few small wins and your group is ready to go.'}
                </Text>
              </View>
            </View>
            <View style={[styles.setupTrack, { backgroundColor: isSetupComplete ? colors.border : `${colors.primary}18` }]}>
              <View style={[styles.setupFill, { backgroundColor: isSetupComplete ? colors.mutedForeground : colors.secondary, width: `${(completeSetupSteps / setupSteps.length) * 100}%` }]} />
            </View>
            <Pressable
              testID="setup-primary-cta"
              disabled={isSetupComplete}
              onPress={nextSetupStep ? () => router.push(nextSetupStep.route as any) : undefined}
              style={({ pressed }) => [
                styles.setupPrimaryCta,
                {
                  backgroundColor: isSetupComplete ? colors.mutedForeground : colors.secondary,
                  opacity: isSetupComplete ? 0.55 : pressed ? 0.82 : 1,
                },
              ]}
            >
              <View style={[styles.setupPrimaryIcon, { backgroundColor: isSetupComplete ? `${colors.foreground}16` : `${colors.background}24` }]}>
                <Feather name={isSetupComplete ? 'check-circle' : nextSetupStep!.icon} size={19} color={isSetupComplete ? colors.foreground : colors.background} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.setupCtaLabel, { color: isSetupComplete ? colors.background : colors.background }]}>
                  {isSetupComplete ? 'SETUP COMPLETE' : 'DO THIS NEXT'}
                </Text>
                <Text style={[styles.setupCtaTitle, { color: colors.background }]}>
                  {isSetupComplete ? 'All core steps done' : nextSetupStep!.label}
                </Text>
              </View>
              <Feather name={isSetupComplete ? 'check' : 'arrow-right'} size={20} color={colors.background} />
            </Pressable>
            {nextSetupStep && laterSetupSteps.length > 0 && (
              <Text style={[styles.setupLaterSteps, { color: 'rgba(255,255,255,0.74)' }]}>
                Then: {laterSetupSteps.map(step => step.label).join(' · ')}
              </Text>
            )}
          </View>
        )}

        {/* Bank Account Balance Card */}
        <Pressable
          style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/bank')}
        >
          <View style={styles.bankCardHeader}>
            <View style={styles.bankIconWrap}>
              <Feather name="credit-card" size={18} color="#38bdf8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bankCardTitle, { color: colors.foreground }]}>Bank Account</Text>
              <Text style={[styles.bankCardSub, { color: colors.mutedForeground }]}>Shared joint account</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
          <View style={styles.bankStatsRow}>
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>BALANCE</Text>
              {bankAccountLoading ? (
                <BankBalanceSkeleton />
              ) : (
                <Text style={[styles.bankBalance, { color: '#38bdf8' }]}>
                  {bankAccount ? (isPrivate ? '••••' : `KES ${shortKES(bankAccount.balance)}`) : '—'}
                </Text>
              )}
            </View>
            <View style={[styles.bankStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>IN THIS MONTH</Text>
              <Text style={[styles.bankStatValue, { color: '#4ade80' }]}>
                {isPrivate ? '••••' : `+KES ${shortKES(monthlyDeposited)}`}
              </Text>
            </View>
            <View style={[styles.bankStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bankStat}>
              <Text style={[styles.bankStatLabel, { color: colors.mutedForeground }]}>OUT THIS MONTH</Text>
              <Text style={[styles.bankStatValue, { color: '#f87171' }]}>
                {isPrivate ? '••••' : `-KES ${shortKES(monthlyDisbursed)}`}
              </Text>
            </View>
          </View>
          {bankAccount && bankAccount.balance === 0 && (!bankAccount.transactions || bankAccount.transactions.length === 0) && (
            <View style={styles.bankEmptyState}>
              <Feather name="inbox" size={15} color="#38bdf8" style={{ opacity: 0.6 }} />
              <Text style={styles.bankEmptyText}>No deposits yet — tap to add one</Text>
            </View>
          )}
        </Pressable>

        {/* Recent Activity */}
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
      </ScrollView>

    </View>
  );
}

function StatCell({ label, value, valueColor = '#f7faf6' }: { label: string; value: string; valueColor?: string }) {
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

function ContribBar({ name, contributed, spent, target, color, hidden }: { name: string; contributed: number; spent: number; target: number; color: string; hidden: boolean }) {
  const net = contributed - spent;
  const pctContrib = Math.min(contributed / Math.max(target, 1), 1);
  const pctSpent = Math.min(spent / Math.max(contributed, 1), 1);
  const fmt = (n: number) => hidden ? '••••' : n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
  return (
    <View style={styles.contribItem}>
      <View style={styles.contribLabelRow}>
        <Text style={styles.contribName}>{name}</Text>
        <Text style={[styles.contribAmt, { color: net < 0 ? '#f87171' : color }]}>
          {hidden ? '••••' : `Net ${net >= 0 ? '+' : ''}${fmt(net)}`}
        </Text>
      </View>
      {/* Contribution track */}
      <View style={styles.contribTrack}>
        <View style={[styles.contribFill, { width: `${pctContrib * 100}%` as any, backgroundColor: color, opacity: 0.35 }]} />
        <View style={[styles.contribFill, StyleSheet.absoluteFillObject, { width: `${pctSpent * pctContrib * 100}%` as any, backgroundColor: '#ef4444', borderRadius: 2 }]} />
      </View>
      <View style={styles.contribLabelRow}>
        <Text style={[styles.contribSubLabel, { color: 'rgba(247,250,246,0.4)' }]}>In: {fmt(contributed)}</Text>
        <Text style={[styles.contribSubLabel, { color: 'rgba(247,250,246,0.4)' }]}>Out: {fmt(spent)}</Text>
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
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 4 },
  greeting: { fontSize: 12, color: '#7aaa8a', fontFamily: 'Inter_400Regular' },
  name: { fontSize: 20, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 13, color: '#f7faf6', fontFamily: 'Inter_500Medium', minWidth: 56, textAlign: 'center' },

  ringWrap: { alignItems: 'center', marginBottom: 16 },
  ringPlaceholder: { width: 196, height: 196, alignItems: 'center', justifyContent: 'center' },

  statsStrip: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingVertical: 12, marginBottom: 14 },
  statCell: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#7aaa8a', fontFamily: 'Inter_400Regular', letterSpacing: 0.5, marginBottom: 3 },
  statValue: { fontSize: 11, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', opacity: 0.75 },
  stripDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  contribRow: { flexDirection: 'row', gap: 12 },
  contribDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  contribItem: { flex: 1 },
  contribLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  contribName: { fontSize: 11, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular' },
  contribAmt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  contribTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  contribFill: { height: '100%', borderRadius: 2 },
  contribSubLabel: { fontSize: 9, fontFamily: 'Inter_400Regular' },

  shortcutRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4, gap: 8 },
  shortcutBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, gap: 5 },
  shortcutLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  setupCard: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 18 },
  setupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  setupEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  setupEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  setupTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 5 },
  setupSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
  setupTrack: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 16 },
  setupFill: { height: '100%', borderRadius: 4 },
  setupPrimaryCta: { minHeight: 68, borderRadius: 16, marginTop: 16, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  setupPrimaryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  setupCtaLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  setupCtaTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 2 },
  setupLaterSteps: { fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 17, marginTop: 13 },

  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
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
  bankBalance: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  bankBalanceSkeleton: { width: 62, height: 16, borderRadius: 4, backgroundColor: 'rgba(56,189,248,0.25)' },
  bankStatValue: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  bankStatDivider: { width: 1, marginVertical: 10 },

  bankEmptyState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.15)' },
  bankEmptyText: { fontSize: 13, color: '#38bdf8', fontFamily: 'Inter_400Regular', opacity: 0.8 },
});
