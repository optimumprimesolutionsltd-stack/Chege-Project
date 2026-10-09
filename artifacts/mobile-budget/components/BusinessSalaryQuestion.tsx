import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useColors } from '@/hooks/useColors';
import { useBusinesses } from '@/hooks/useBusinesses';
import { SALARY_ANSWERS, unansweredBusinesses } from '@/lib/businessSalary';

/**
 * "Do you pay yourself a salary from Ujenzi?" - one business at a time, each
 * asked once (lib/businessSalary). Nothing to ask, nothing shown. Changed
 * later on My businesses.
 */
export function BusinessSalaryQuestion() {
  const colors = useColors();
  const businesses = useBusinesses();
  const [saving, setSaving] = useState(false);
  const business = unansweredBusinesses(businesses.list)[0];
  if (!business) return null;

  const answer = async (paysSalary: boolean) => {
    setSaving(true);
    try {
      await businesses.setPaysSalary(business.id, paysSalary);
    } catch (error) {
      Alert.alert('Could not save that', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="business-salary-question">
      <View style={styles.head}>
        <Feather name="briefcase" size={15} color={colors.primary} />
        <Text style={[styles.kicker, { color: colors.primary }]}>YOUR BUSINESS</Text>
      </View>
      <Text style={[styles.question, { color: colors.foreground }]}>Do you pay yourself a salary from {business.name}?</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        If you do, your salary is your income and {business.name}'s profit stays in its own report. If you live on its profit, the profit is your income.
      </Text>
      <View style={styles.answers}>
        {saving ? <ActivityIndicator color={colors.primary} /> : SALARY_ANSWERS.map((one) => (
          <Pressable
            key={one.label}
            onPress={() => void answer(one.paysSalary)}
            accessibilityRole="button"
            testID={`business-salary-${one.paysSalary ? 'yes' : 'no'}`}
            style={({ pressed }) => [styles.chip, { borderColor: colors.primary, backgroundColor: `${colors.primary}10`, opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.chipText, { color: colors.primary }]}>{one.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  question: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
