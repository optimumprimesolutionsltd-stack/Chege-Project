import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { formatExact } from '@/lib/formatExact';
import { homeAnswers } from '@/lib/homeAnswers';
import { messageTime, type LiveBalance } from '@/lib/mpesaLiveBalance';

/**
 * Three questions, three answers, at the top of Home:
 *   How much is on my M-Pesa?  Spent on your budget this month  Am I on track?
 * Everything else on the screen is detail behind these.
 */
export function HomeAnswersCard({
  balance,
  live,
  accountName,
  spent,
  budget,
  hidden,
}: {
  /** The M-Pesa account's balance today - never every account added up, which mixed in business money. */
  balance: number | null | undefined;
  /**
   * M-Pesa's own figure, from the newest message on this phone: what is really
   * on M-Pesa, so it is the answer whenever there is one ("how much is on my
   * mpesa? is wrong", 13 Oct 2026). Jamvi's worked-out figure only without it.
   */
  live?: LiveBalance | null;
  /** The M-Pesa account's own name, when it is not plainly M-Pesa. */
  accountName?: string | null;
  spent: number | null | undefined;
  budget: number | null | undefined;
  /** Private mode hides figures. */
  hidden: boolean;
}) {
  const colors = useColors();
  const answers = homeAnswers({ balance: live ? live.balance : balance, spent, budget });
  const source = live ? `From your M-Pesa message of ${messageTime(live.at)}` : answers.have !== null ? 'As recorded in Jamvi' : null;
  const trackColor =
    answers.track.tone === 'over' ? colors.destructive
      : answers.track.tone === 'careful' ? '#d97706'
      : answers.track.tone === 'good' ? colors.success
      : colors.mutedForeground;
  const money = (value: number) => (hidden ? '••••' : `KES ${formatExact(value)}`);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID="home-answers"
    >
      <Pressable
        onPress={() => router.push('/(tabs)/money')}
        accessibilityRole="button"
        accessibilityLabel="How much is on my M-Pesa? Open my bank"
        style={styles.row}
        testID="home-answer-have"
      >
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="credit-card" size={18} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.question, { color: colors.mutedForeground }]} numberOfLines={1}>
            {accountName && !/m-?pesa/i.test(accountName) ? `How much is on my M-Pesa (${accountName})?` : 'How much is on my M-Pesa?'}
          </Text>
          <Text style={[styles.answer, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {answers.have === null ? 'Bring in your M-Pesa to see it' : money(answers.have)}
          </Text>
          {source ? (
            <Text style={[styles.source, { color: colors.mutedForeground }]} numberOfLines={1} testID="home-answer-have-source">{source}</Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={() => router.push('/expense-ledger')}
        accessibilityRole="button"
        accessibilityLabel="Spent on your budget this month. See all expenses"
        style={styles.row}
        testID="home-answer-spent"
      >
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.question, { color: colors.mutedForeground }]}>Spent on your budget this month</Text>
          <Text style={[styles.answer, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {money(answers.spent)}
          </Text>
          {/* Why it is less than "Left M-Pesa" ("why the difference", 5 Oct 2026). */}
          <Text style={[styles.question, { color: colors.mutedForeground, fontSize: 11 }]} numberOfLines={2}>
            Spending only - not savings, transfers, money lent or repayments
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={() => router.push('/(tabs)/plan?view=budget')}
        accessibilityRole="button"
        accessibilityLabel={`Am I on track? ${hidden ? '' : answers.track.text}`}
        style={styles.row}
        testID="home-answer-track"
      >
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="flag" size={18} color={trackColor} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.question, { color: colors.mutedForeground }]}>Am I on track?</Text>
          <Text style={[styles.trackText, { color: trackColor }]}>{hidden ? '••••' : answers.track.text}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, marginHorizontal: 16, marginTop: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  icon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  question: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  answer: { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 1 },
  source: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  trackText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
});
