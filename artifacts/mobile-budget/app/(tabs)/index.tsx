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

type Shortcut = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  bg: string;
  route: string;
};

const SHORTCUTS: Shortcut[] = [
  { icon: 'plus-circle', label: 'Expense', color: '#4ade80', bg: '#1a3320', route: '/add-expense' },
  { icon: 'credit-card', label: 'Deposit', color: '#cf7217', bg: '#2a1c0a', route: '/(tabs)/bank' },
  { icon: 'bar-chart-2', label: 'Budget', color: '#60a5fa', bg: '#0a1a2a', route: '/(tabs)/budget' },
  { icon: 'target', label: 'Goals', color: '#f472b6', bg: '#2a0a1a', route: '/(tabs)/goals' },
  { icon: 'users', label: 'Contributions', color: '#a78bfa', bg: '#1a0a2a', route: '/(tabs)/contributions' },
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
    refetch: refetchSummary,
  } = useGetDashboardSummary({ month, year });

  const {
    data: activity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useGetDashboardActivity();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity()]);
    setRefreshing(false);
  }, [refetchSummary, refetchActivity]);

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

  const firstName = user?.firstName ?? '';
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  // Contribution bars
  const chegeTotal = summary?.chegeContributed ?? 0;
  const chegeTarget = summary?.chegeTarget ?? 1;
  const lydiahTotal = summary?.lydiahContributed ?? 0;
  const lydiahTarget = summary?.lydiahTarget ?? 1;

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
              <Text style={styles.greeting}>{greeting}</Text>
              {firstName ? <Text style={styles.name}>{firstName}</Text> : null}
            </View>
            <View style={styles.headerControls}>
              {/* Privacy toggle */}
              <Pressable onPress={togglePrivacy} hitSlop={10} style={styles.iconBtn}>
                <Feather name={isPrivate ? 'eye-off' : 'eye'} size={20} color="rgba(247,250,246,0.7)" />
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
            <StatCell label="Budget" value={fmt(summary?.totalBudget)} />
            <View style={styles.stripDivider} />
            <StatCell label="Spent" value={fmt(summary?.totalSpent)} valueColor={isOver ? '#f87171' : '#f7faf6'} />
            <View style={styles.stripDivider} />
            <StatCell label="Left" value={fmt(summary?.remaining)} valueColor={isOver ? '#f87171' : '#4ade80'} />
          </View>

          {/* Contribution mini-bars */}
          {summary && (
            <View style={styles.contribRow}>
              <ContribBar
                name="Chege"
                amount={chegeTotal}
                target={chegeTarget}
                color="#4ade80"
                hidden={isPrivate}
              />
              <View style={styles.contribDivider} />
              <ContribBar
                name="Lydiah"
                amount={lydiahTotal}
                target={lydiahTarget}
                color="#cf7217"
                hidden={isPrivate}
              />
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

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.secondary, bottom: Platform.OS === 'web' ? 100 : insets.bottom + 70 }]}
        onPress={() => router.push('/add-expense')}
        hitSlop={8}
      >
        <Feather name="plus" size={28} color="#fff" />
      </Pressable>
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

function ContribBar({ name, amount, target, color, hidden }: { name: string; amount: number; target: number; color: string; hidden: boolean }) {
  const pct = Math.min(amount / Math.max(target, 1), 1);
  return (
    <View style={styles.contribItem}>
      <View style={styles.contribLabelRow}>
        <Text style={styles.contribName}>{name}</Text>
        <Text style={[styles.contribAmt, { color }]}>{hidden ? '••••' : `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`}</Text>
      </View>
      <View style={styles.contribTrack}>
        <View style={[styles.contribFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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
  statValue: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  stripDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  contribRow: { flexDirection: 'row', gap: 12 },
  contribDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  contribItem: { flex: 1 },
  contribLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  contribName: { fontSize: 11, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular' },
  contribAmt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  contribTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  contribFill: { height: '100%', borderRadius: 2 },

  shortcutRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4, gap: 8 },
  shortcutBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, gap: 5 },
  shortcutLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  emptyBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  emptyBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10 },
});
