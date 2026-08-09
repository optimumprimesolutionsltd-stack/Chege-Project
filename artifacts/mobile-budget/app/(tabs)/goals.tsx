import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGetSavingsGoals } from '@workspace/api-client-react';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: goals = [], isLoading, refetch } = useGetSavingsGoals();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const active = goals.filter((g) => !g.isCompleted);
  const done = goals.filter((g) => g.isCompleted);
  const totalSaved = goals.reduce((s, g) => s + (g.currentAmount ?? 0), 0);
  const totalTarget = goals.reduce((s, g) => s + (g.targetAmount ?? 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
        }
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }}
      >
        {/* Header */}
        <LinearGradient
          colors={['#0a1a10', '#0f2217', '#132a1c']}
          style={[styles.header, { paddingTop: topPad + 16 }]}
        >
          <Text style={styles.headerTitle}>Savings Goals</Text>
          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Saved</Text>
              <Text style={styles.headerStatValue}>KES {formatKES(totalSaved)}</Text>
            </View>
            <View style={styles.headerDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Target</Text>
              <Text style={styles.headerStatValue}>KES {formatKES(totalTarget)}</Text>
            </View>
            <View style={styles.headerDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Goals</Text>
              <Text style={styles.headerStatValue}>{goals.length}</Text>
            </View>
          </View>
        </LinearGradient>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : goals.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="target" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No savings goals yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Set goals on the web app to track them here
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {active.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACTIVE</Text>
                {active.map((goal) => {
                  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
                  return (
                    <View key={goal.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.cardTop}>
                        <View style={[styles.iconCircle, { backgroundColor: '#1a3320' }]}>
                          <Feather name="target" size={18} color="#4ade80" />
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={[styles.cardName, { color: colors.foreground }]}>{goal.name}</Text>
                          {goal.deadline ? (
                            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                              Due {formatDate(goal.deadline)}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.cardRight}>
                          <Text style={[styles.cardPct, { color: '#4ade80' }]}>{Math.round(pct * 100)}%</Text>
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: '#4ade80' }]} />
                      </View>

                      <View style={styles.cardAmounts}>
                        <Text style={[styles.cardAmountSaved, { color: colors.foreground }]}>
                          KES {formatKES(goal.currentAmount)} saved
                        </Text>
                        <Text style={[styles.cardAmountTarget, { color: colors.mutedForeground }]}>
                          of KES {formatKES(goal.targetAmount)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {done.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>COMPLETED</Text>
                {done.map((goal) => (
                  <View key={goal.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.7 }]}>
                    <View style={styles.cardTop}>
                      <View style={[styles.iconCircle, { backgroundColor: '#1a2e10' }]}>
                        <Feather name="check-circle" size={18} color="#86efac" />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={[styles.cardName, { color: colors.foreground }]}>{goal.name}</Text>
                        <Text style={[styles.cardSub, { color: '#4ade80' }]}>Goal reached!</Text>
                      </View>
                      <Text style={[styles.cardPct, { color: '#86efac' }]}>
                        KES {formatKES(goal.currentAmount)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  headerStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerStatValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  headerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  list: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cardRight: { alignItems: 'flex-end' },
  cardPct: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: { height: '100%', borderRadius: 4 },
  cardAmounts: { flexDirection: 'row', gap: 6 },
  cardAmountSaved: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  cardAmountTarget: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
