import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch } from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { formatMonthKey, summariseDebts, type DebtWithPayment } from '@/lib/debtSummary';

type CategoryRow = DebtWithPayment & { budgetAmount?: number | null };

/**
 * Put away, not answered for ever.
 *
 * A prompt that cannot be sent away becomes furniture. But one sent away for
 * good by a mis-tap is worse: the Debt tab is not there to be found, so
 * nothing on any screen would ever mention debt again, and there would be no
 * setting to undo it either. So it snoozes, the way the home tip does, and it
 * offers an undo on the spot for the tap somebody notices immediately.
 */
const SNOOZE_KEY = 'jamvi:debt-prompt-snooze-until';
const SNOOZE_DAYS = 90;
/** What the first version of this wrote. Read so nobody stays stuck on it. */
const LEGACY_DISMISSED_KEY = 'home_debt_prompt_dismissed';

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
 * With nothing tracked it offers to start, once, because the Debt tab only
 * appears after a first debt exists and so is no use for making one. Exactly
 * one of the two can render, which is why the invitation lives here rather
 * than beside the card: the home screen cannot end up carrying both.
 */
export function DebtSummaryCard({ canTrackDebt = false }: { canTrackDebt?: boolean }) {
  const colors = useColors();
  const { data: categories = [], isLoading } = useQuery<CategoryRow[]>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<CategoryRow[]>('/api/budget-categories'),
    staleTime: 30_000,
  });

  // undefined until read: showing the invitation and snatching it back a frame
  // later is worse than showing it slightly late.
  const [snoozedUntil, setSnoozedUntil] = useState<number | undefined>(undefined);
  // Hidden by a tap just now, rather than by something stored. Held apart so
  // the undo can be offered without the storage write having to be waited on.
  const [justHidden, setJustHidden] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(SNOOZE_KEY), AsyncStorage.getItem(LEGACY_DISMISSED_KEY)])
      .then(([raw, legacy]) => {
        if (!active) return;
        const until = raw ? Number(raw) : 0;
        if (Number.isFinite(until) && until > 0) {
          setSnoozedUntil(until);
          return;
        }
        // The version that shipped first put it away for good. Treat that as a
        // snooze starting now, so those phones get it back rather than never.
        setSnoozedUntil(legacy === 'true' ? Date.now() + SNOOZE_DAYS * 86_400_000 : 0);
      })
      .catch(() => {
        // Storage that will not answer must not hide the prompt for ever.
        if (active) setSnoozedUntil(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const snoozePrompt = useCallback(() => {
    setJustHidden(true);
    const until = Date.now() + SNOOZE_DAYS * 86_400_000;
    setSnoozedUntil(until);
    AsyncStorage.setItem(SNOOZE_KEY, String(until)).catch(() => {});
  }, []);

  const undoSnooze = useCallback(() => {
    setJustHidden(false);
    setSnoozedUntil(0);
    AsyncStorage.multiRemove([SNOOZE_KEY, LEGACY_DISMISSED_KEY]).catch(() => {});
  }, []);

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

  if (isLoading) return null;

  if (debts.length === 0) {
    // Put away a moment ago. Offer it back rather than simply vanishing: this
    // is the only place debt is mentioned, so a mis-tap here is expensive.
    if (justHidden) {
      return (
        <Pressable
          testID="home-track-debt-undo"
          accessibilityRole="button"
          accessibilityLabel="Bring the debt prompt back"
          onPress={undoSnooze}
          style={({ pressed }) => [styles.undoRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.undoText, { color: colors.mutedForeground }]}>Debt prompt hidden.</Text>
          <Text style={[styles.undoAction, { color: colors.primary }]}>Undo</Text>
        </Pressable>
      );
    }

    // Not on an empty budget. Somebody who has added nothing at all is already
    // being told to make a budget, and two next steps at once is neither.
    const worthAsking =
      canTrackDebt &&
      categories.length > 0 &&
      snoozedUntil !== undefined &&
      Date.now() >= snoozedUntil;
    if (!worthAsking) return null;

    return (
      <View
        testID="home-track-debt-cta"
        style={[styles.card, { backgroundColor: colors.card, borderColor: `${colors.primary}55` }]}
      >
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Feather name="trending-down" size={16} color={colors.primary} />
            <Text style={[styles.heading, { color: colors.foreground }]}>Paying off a loan?</Text>
          </View>
        </View>
        <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>
          Track what you owe — a bank loan, a SACCO, Fuliza, or money owed to somebody — and Jamvi
          works out when you will be clear of it, and counts it down as you pay.
        </Text>
        <View style={styles.promptActions}>
          <Pressable
            testID="home-track-debt"
            accessibilityRole="button"
            accessibilityLabel="Track a debt"
            onPress={() => router.push('/(tabs)/debt')}
            style={({ pressed }) => [
              styles.promptButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Text style={[styles.promptButtonText, { color: colors.primaryForeground }]}>Track a debt</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </Pressable>
          <Pressable
            testID="home-track-debt-dismiss"
            accessibilityRole="button"
            accessibilityLabel="I have no debt to track"
            onPress={snoozePrompt}
            style={({ pressed }) => [styles.promptDismiss, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.promptDismissText, { color: colors.mutedForeground }]}>No debt</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
  promptBody: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 6 },
  promptActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  promptButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  promptButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  promptDismiss: { paddingVertical: 10, paddingHorizontal: 8 },
  promptDismissText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  undoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 6 },
  undoText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  undoAction: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
