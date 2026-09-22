import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { evaluateAmountExpression, isAmountExpression } from '@/lib/amountExpression';

const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'] as const;

/**
 * Operator keys for an amount field, plus the live "= KES ..." preview, plus
 * a full number pad behind a toggle.
 *
 * A numeric keypad has no operators, and switching an amount field to a full
 * keyboard would make every plain amount harder to type for the sake of the
 * occasional sum. These put +, −, ×, ÷ one tap away without giving up the
 * numeric keypad for the common case of just typing a number. The digits sit
 * behind their own toggle rather than always on screen, for the same reason:
 * most amounts still come off the device's own keypad, so a grid of digits
 * nobody asked for would just be twelve more keys to scroll past.
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
  const [showKeypad, setShowKeypad] = useState(false);

  return (
    <>
      <View style={styles.calcRow}>
        <Pressable
          onPress={() => setShowKeypad((current) => !current)}
          style={[
            styles.calcKey,
            { borderColor: showKeypad ? colors.primary : colors.border, backgroundColor: showKeypad ? colors.primary + '18' : colors.muted },
          ]}
          accessibilityRole="button"
          accessibilityLabel={showKeypad ? 'Hide the number pad' : 'Show the number pad'}
          testID={`${testIDPrefix}-toggle-keypad`}
        >
          <Feather name="grid" size={15} color={showKeypad ? colors.primary : colors.foreground} />
        </Pressable>
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
      {showKeypad ? (
        <View style={styles.calcRow} testID={`${testIDPrefix}-keypad`}>
          {DIGIT_KEYS.map((key) => (
            <Pressable
              key={key}
              onPress={() => onChangeAmount(amount + key)}
              style={[styles.calcKey, styles.digitKey, { borderColor: colors.border, backgroundColor: colors.muted }]}
              accessibilityRole="button"
              accessibilityLabel={`Insert ${key}`}
              testID={`${testIDPrefix}-digit-${key}`}
            >
              <Text style={[styles.calcKeyText, { color: colors.foreground }]}>{key}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
  digitKey: {
    minWidth: 56,
    flexBasis: '28%',
  },
  calcResult: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 6,
  },
});
