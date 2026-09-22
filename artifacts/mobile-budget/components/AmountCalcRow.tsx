import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { evaluateAmountExpression, isAmountExpression } from '@/lib/amountExpression';

/**
 * Operator keys for an amount field, plus the live "= KES ..." preview.
 *
 * A numeric keypad has no operators, and switching an amount field to a full
 * keyboard would make every plain amount harder to type for the sake of the
 * occasional sum. These put +, −, ×, ÷ one tap away without giving up the
 * numeric keypad for the common case of just typing a number.
 */
export function AmountCalcRow({
  amount,
  onChangeAmount,
  testIDPrefix,
}: {
  amount: string;
  onChangeAmount: (value: string) => void;
  testIDPrefix: string;
}) {
  const colors = useColors();

  return (
    <>
      <View style={styles.calcRow}>
        {(['+', '−', '×', '÷', '(', ')'] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => onChangeAmount(amount + key)}
            style={[styles.calcKey, { borderColor: colors.border, backgroundColor: colors.muted }]}
            accessibilityRole="button"
            accessibilityLabel={`Insert ${key}`}
            testID={`${testIDPrefix}-key-${key}`}
          >
            <Text style={[styles.calcKeyText, { color: colors.foreground }]}>{key}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onChangeAmount(amount.slice(0, -1))}
          style={[styles.calcKey, { borderColor: colors.border, backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel="Delete the last character"
          testID={`${testIDPrefix}-key-delete`}
        >
          <Feather name="delete" size={15} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => {
            const resolved = evaluateAmountExpression(amount);
            if (resolved !== null) onChangeAmount(String(resolved));
          }}
          style={[styles.calcKey, { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
          accessibilityRole="button"
          accessibilityLabel="Work out the total"
          testID={`${testIDPrefix}-key-equals`}
        >
          <Text style={[styles.calcKeyText, { color: colors.primary }]}>=</Text>
        </Pressable>
      </View>
      {isAmountExpression(amount) ? (
        <Text style={[styles.calcResult, { color: colors.primary }]} testID={`${testIDPrefix}-resolved`}>
          = KES {(evaluateAmountExpression(amount) ?? 0).toLocaleString()}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  calcRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  calcKey: {
    minWidth: 42,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  calcKeyText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  calcResult: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 6,
  },
});
