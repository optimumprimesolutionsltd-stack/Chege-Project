import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { DebtPayoffCard } from '@/components/DebtPayoffCard';
import { formatInterestRate, type PayoffStrategy } from '@/lib/debts';
import { formatMonthKey, projectPayoff, summariseDebts, type DebtWithPayment } from '@/lib/debtSummary';

type CategoryRow = DebtWithPayment & { budgetAmount?: number | null };

function kes(value: number): string {
  return value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/**
 * Debt, given the same standing as savings.
 *
 * It used to be one card inside the Budget tab — right for somebody budgeting,
 * invisible to somebody whose reason for using Jamvi is clearing a loan. This
 * screen leads with the end date rather than the balance, because the balance
 * is the thing they already know and the date is the thing that keeps them
 * going.
 */
export default function DebtScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [strategy, setStrategy] = useState<PayoffStrategy>('snowball');

  const { data: categories = [], isLoading, refetch, isRefetching } = useQuery<CategoryRow[]>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<CategoryRow[]>('/api/budget-categories'),
    staleTime: 30_000,
  });

  const debts: DebtWithPayment[] = categories
    .filter((row) => row.debtBalance !== null && row.debtBalance !== undefined)
    .map((row) => ({
      id: row.id,
      name: row.name,
      debtBalance: row.debtBalance,
      debtInterestRateBps: row.debtInterestRateBps ?? null,
      // What a category is budgeted to receive each month is what is being
      // paid towards it — there is no separate debt ledger to read.
      monthlyPayment: row.budgetAmount ?? null,
    }));

  const view = summariseDebts(debts, strategy);
  const debtFree = formatMonthKey(view.debtFreeOn);
  const clearedEverything = debts.length > 0 && view.totalOwed === 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['#3B0D0D', '#4C1111', '#5A1717']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Text style={styles.headerTitle}>Debt</Text>
        {isLoading ? null : clearedEverything ? (
          <>
            <Text style={styles.headline}>All clear</Text>
            <Text style={styles.headerSub}>Nothing outstanding. That is the whole point.</Text>
          </>
        ) : debts.length === 0 ? (
          <Text style={styles.headerSub}>
            No debts tracked yet. Mark a budget category as a debt below and Jamvi works out when it ends.
          </Text>
        ) : (
          <>
            <Text style={styles.headerLabel}>STILL OWED</Text>
            <Text style={styles.headline}>KES {kes(view.totalOwed)}</Text>
            <Text style={styles.headerSub}>
              {debtFree
                ? `Debt-free by ${debtFree}, paying KES ${kes(view.monthlyCommitment)} a month`
                : view.hasStalledDebt
                  ? 'Set a monthly amount on every debt to see when this ends.'
                  : `KES ${kes(view.monthlyCommitment)} a month going to debt`}
            </Text>
          </>
        )}
      </LinearGradient>

      <PageScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            {view.ranked.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.strategyRow}>
                  {(['snowball', 'avalanche'] as const).map((option) => {
                    const on = strategy === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setStrategy(option)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`debt-strategy-${option}`}
                        style={[styles.strategyChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + '18' : 'transparent' }]}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: on ? 'Inter_700Bold' : 'Inter_400Regular', fontSize: 13 }}>
                          {option === 'snowball' ? 'Smallest first' : 'Costliest first'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.strategyHint, { color: colors.mutedForeground }]}>
                  {strategy === 'snowball'
                    ? 'Smallest balance first — the quick win that keeps a plan going past month one.'
                    : 'Highest interest first — the least paid to a lender overall.'}
                </Text>

                {view.ranked.map((row, index) => {
                  const balance = row.debtBalance ?? 0;
                  const done = balance <= 0;
                  const projection = projectPayoff(balance, row.monthlyPayment, row.debtInterestRateBps);
                  const clears = formatMonthKey(projection.clearsOn);
                  return (
                    <View
                      key={row.id}
                      testID={`debt-row-${row.id}`}
                      style={[styles.debtRow, { borderColor: colors.border, backgroundColor: colors.card }]}
                    >
                      <View style={styles.debtHead}>
                        <Text style={[styles.debtName, { color: colors.foreground }]} numberOfLines={1}>
                          {done ? 'Cleared: ' : `${index + 1}. `}{row.name}
                        </Text>
                        <Text style={[styles.debtBalance, { color: done ? '#22c55e' : colors.foreground }]}>
                          {done ? 'KES 0' : `KES ${kes(balance)}`}
                        </Text>
                      </View>
                      {done ? null : (
                        <Text style={[styles.debtMeta, { color: colors.mutedForeground }]}>
                          {formatInterestRate(row.debtInterestRateBps)}
                          {row.monthlyPayment ? ` · KES ${kes(row.monthlyPayment)}/mo` : ' · no monthly amount set'}
                        </Text>
                      )}
                      {done ? null : clears ? (
                        <Text style={[styles.debtClears, { color: '#22c55e' }]}>
                          Clears {clears}
                          {projection.interestCost ? ` · KES ${kes(projection.interestCost)} interest from here` : ''}
                        </Text>
                      ) : (
                        <Text style={[styles.debtClears, { color: '#f59e0b' }]}>
                          {projection.blockedBy === 'no-payment'
                            ? 'No end date — nothing is budgeted towards this yet.'
                            : 'The interest is larger than the monthly amount, so this never reduces.'}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Tagging a category as a debt, and editing balances, already
                lives in this card — the screen wraps it rather than growing a
                second way to do the same thing. */}
            <DebtPayoffCard canManage />
          </>
        )}
      </PageScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 18, gap: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Inter_700Bold' },
  headerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginTop: 8 },
  headline: { color: '#FFFFFF', fontSize: 30, fontFamily: 'Inter_700Bold' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 4 },
  content: { padding: 16, gap: 14 },
  section: { gap: 8 },
  strategyRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  strategyChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  strategyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  debtRow: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  debtHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  debtName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1, minWidth: 0 },
  debtBalance: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  debtMeta: { fontSize: 11.5, fontFamily: 'Inter_400Regular' },
  debtClears: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
});
