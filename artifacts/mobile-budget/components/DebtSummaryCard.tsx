import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { formatMonthKey, summariseDebts, type DebtWithPayment } from '@/lib/debtSummary';

type CategoryRow = DebtWithPayment & { budgetAmount?: number | null };

function kes(value: number): string {
  return value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/**
 * Debt on the home screen, with the same weight savings has.
 *
 * Debt was a card buried inside the Budget tab, which is fine for somebody
 * budgeting and useless for somebody whose whole reason for opening the app is
 * clearing a loan. The question that keeps that person going is not "what do I
 * owe" — they know — it is "when does this end", so that is the headline.
 *
 * Renders nothing at all when no debt is tracked: an empty debt card on every
 * household's home screen would be the opposite of making debt significant.
 */
export function DebtSummaryCard() {
  const colors = useColors();
  const { data: categories = [], isLoading } = useQuery<CategoryRow[]>({
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
      // What the category is budgeted to receive is what is being paid.
      monthlyPayment: row.budgetAmount ?? null,
    }));

  if (isLoading || debts.length === 0) return null;

  const view = summariseDebts(debts, 'snowball');
  const clearedEverything = view.totalOwed === 0;
  const debtFree = formatMonthKey(view.debtFreeOn);

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/debt')}
      accessibilityRole="button"
      accessibilityLabel={clearedEverything ? 'Debt cleared. Open debt.' : `You owe KES ${kes(view.totalOwed)}. Open debt.`}
      testID="home-debt-card"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: pressed ? colors.primary : colors.border },
      ]}
    >
      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          <Feather name="trending-down" size={16} color="#ef4444" />
          <Text style={[styles.heading, { color: colors.foreground }]}>Debt</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      {clearedEverything ? (
        <>
          <Text style={[styles.headline, { color: '#22c55e' }]}>All clear</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {view.clearedCount === 1 ? 'One debt paid off.' : `${view.clearedCount} debts paid off.`} Nothing outstanding.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>STILL OWED</Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>KES {kes(view.totalOwed)}</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {debtFree
              ? <>Debt-free by <Text style={{ color: '#22c55e', fontFamily: 'Inter_700Bold' }}>{debtFree}</Text> at KES {kes(view.monthlyCommitment)}/mo</>
              : view.hasStalledDebt
                ? 'One of these has no monthly amount set, so there is no end date yet.'
                : `KES ${kes(view.monthlyCommitment)} a month going to debt.`}
          </Text>
          {view.focus ? (
            <Text style={[styles.focus, { color: colors.mutedForeground }]}>
              Next to clear: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{view.focus.name}</Text>
              {view.focus.debtBalance ? ` · KES ${kes(view.focus.debtBalance)}` : ''}
            </Text>
          ) : null}
        </>
      )}
      {view.clearedCount > 0 && !clearedEverything ? (
        <Text style={[styles.cleared, { color: '#22c55e' }]}>
          {view.clearedCount} already paid off
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 3, marginTop: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  label: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginTop: 6 },
  headline: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  focus: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  cleared: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
});
