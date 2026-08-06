import React, { useState, useCallback, useMemo } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import BudgetRing from '@/components/BudgetRing';
import ActivityCard from '@/components/ActivityCard';
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
} from '@workspace/api-client-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

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
    ? summary.totalBudget > 0
      ? summary.totalSpent / summary.totalBudget
      : 0
    : 0;
  const isOver = summary ? summary.totalSpent > summary.totalBudget : false;

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 5), [activity]);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? '';

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 100 : 110,
        }}
      >
        {/* Dark header with ring */}
        <LinearGradient
          colors={['#0a1a10', '#0f2217', '#132a1c']}
          style={[styles.header, { paddingTop: topPad + 16 }]}
        >
          {/* Top row: greeting + month nav */}
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              {firstName ? (
                <Text style={styles.name}>{firstName}</Text>
              ) : null}
            </View>
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                <Feather name="chevron-left" size={20} color="rgba(247,250,246,0.7)" />
              </Pressable>
              <Text style={styles.monthLabel}>
                {MONTHS_SHORT[month - 1]} {year}
              </Text>
              <Pressable
                onPress={nextMonth}
                style={styles.navBtn}
                hitSlop={8}
                disabled={isCurrentMonth}
              >
                <Feather
                  name="chevron-right"
                  size={20}
                  color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'}
                />
              </Pressable>
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
              />
            )}
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <StatCell label="Budget" value={`${formatKES(summary?.totalBudget)}`} />
            <View style={styles.stripDivider} />
            <StatCell
              label="Spent"
              value={`${formatKES(summary?.totalSpent)}`}
              valueColor={isOver ? '#f87171' : '#f7faf6'}
            />
            <View style={styles.stripDivider} />
            <StatCell
              label="Left"
              value={`${formatKES(summary?.remaining)}`}
              valueColor={isOver ? '#f87171' : '#4ade80'}
            />
          </View>
        </LinearGradient>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recent Activity
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/history')}>
              <Text style={[styles.seeAll, { color: colors.secondary }]}>See all</Text>
            </Pressable>
          </View>

          {activityLoading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 32 }}
            />
          ) : recentActivity.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No activity yet this month
              </Text>
              <Pressable
                onPress={() => router.push('/add-expense')}
                style={[styles.emptyBtn, { borderColor: colors.primary }]}
              >
                <Text style={[styles.emptyBtnText, { color: colors.primary }]}>
                  Log your first expense
                </Text>
              </Pressable>
            </View>
          ) : (
            recentActivity.map((item) => (
              <ActivityCard key={item.id} item={item} colors={colors} />
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB — add expense */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: colors.secondary,
            bottom: Platform.OS === 'web' ? 100 : insets.bottom + 70,
          },
        ]}
        onPress={() => router.push('/add-expense')}
        hitSlop={8}
      >
        <Feather name="plus" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

function StatCell({
  label,
  value,
  valueColor = '#f7faf6',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
  },
  name: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: { padding: 4 },
  monthLabel: {
    fontSize: 14,
    color: '#f7faf6',
    fontFamily: 'Inter_500Medium',
    minWidth: 64,
    textAlign: 'center',
  },

  ringWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ringPlaceholder: {
    width: 196,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  stripDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  seeAll: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  emptyBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  emptyBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },

  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
});
