import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { isoDay, MONTH_NAMES, stepMonth, wholeMonthOf } from '@/lib/dayRange';

/**
 * ‹ September 2026 › above a From/To pair, like the budget plan's: one tap
 * moves the range a whole month. Exact dates picked below still work; the
 * label then says so, and the arrows step from the month the range starts in.
 * It never steps past the current month.
 */
export function MonthStepper({
  from,
  to,
  onChange,
  testID = 'month-stepper',
  color,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  testID?: string;
  /** For a dark panel, such as the Reports header. */
  color?: string;
}) {
  const colors = useColors();
  const ink = color ?? colors.foreground;
  const today = isoDay(new Date());
  const whole = wholeMonthOf(from, to, today);
  const canGoOn = from.slice(0, 7) < today.slice(0, 7);
  const go = (delta: number) => {
    const next = stepMonth(from, delta, today);
    onChange(next.from, next.to);
  };
  return (
    <View style={styles.row} testID={testID}>
      <Pressable onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" testID={`${testID}-prev`}>
        <Feather name="chevron-left" size={22} color={ink} />
      </Pressable>
      <Text style={[styles.month, { color: ink }]} testID={`${testID}-label`}>
        {whole ? `${MONTH_NAMES[whole.month - 1]} ${whole.year}` : 'Custom dates'}
      </Text>
      <Pressable
        onPress={() => go(1)}
        disabled={!canGoOn}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: !canGoOn }}
        testID={`${testID}-next`}
        style={{ opacity: canGoOn ? 1 : 0.3 }}
      >
        <Feather name="chevron-right" size={22} color={ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  month: { fontSize: 16, fontFamily: 'Inter_700Bold' },
});
