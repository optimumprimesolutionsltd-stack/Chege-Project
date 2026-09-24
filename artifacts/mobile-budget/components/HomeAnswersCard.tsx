import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { formatExact } from '@/lib/formatExact';
import { homeAnswers } from '@/lib/homeAnswers';

/**
 * Three questions, three answers, at the top of Home:
 *   How much do I have?  What did I spend this month?  Am I on track?
 * Everything else on the screen is detail behind these.
 */
export function HomeAnswersCard({
  balance,
  spent,
  budget,
  hidden,
}: {
  balance: number | null | undefined;
  spent: number | null | undefined;
  budget: number | null | undefined;
  /** Private mode hides figures. */
  hidden: boolean;
}) {
  const colors = useColors();
  const answers = homeAnswers({ balance, spent, budget });
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
        onPress={() => router.push('/(tabs)/bank')}
        accessibilityRole="button"
        accessibilityLabel="How much do I have? Open my bank"
        style={styles.row}
        testID="home-answer-have"
      >
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="credit-card" size={18} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.question, { color: colors.mutedForeground }]}>How much do I have?</Text>
          <Text style={[styles.answer, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {answers.have === null ? 'Add a bank account to see it' : money(answers.have)}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={() => router.push('/expense-ledger')}
        accessibilityRole="button"
        accessibilityLabel="What did I spend this month? See all expenses"
        style={styles.row}
        testID="home-answer-spent"
      >
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.question, { color: colors.mutedForeground }]}>What did I spend this month?</Text>
          <Text style={[styles.answer, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {money(answers.spent)}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={() => router.push('/(tabs)/budget')}
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
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  question: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  answer: { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 1 },
  trackText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
});
