import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { monthLedgerHref } from '@/lib/monthLink';
import type { Insight } from '@/lib/reportInsights';

const TONE = {
  warn: { icon: 'alert-triangle' as const, color: '#d97706' },
  good: { icon: 'trending-down' as const, color: '#16a34a' },
  info: { icon: 'info' as const, color: '#6366f1' },
};

/**
 * What stands out this month, each line a tap away from where to act on it
 * (lib/reportInsights). Nothing is shown when there is nothing to say.
 */
export function InsightsCard({ insights, month, year }: { insights: Insight[]; month: number; year: number }) {
  const colors = useColors();
  if (insights.length === 0) return null;
  const open = (insight: Insight) => {
    if (insight.action.kind === 'sort') router.push('/sort-entries' as never);
    else if (insight.action.kind === 'income') router.push(monthLedgerHref('/income-ledger', year, month) as never);
    else router.push(monthLedgerHref('/expense-ledger', year, month) as never);
  };
  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 }} testID="reports-insights">
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }}>WHAT STANDS OUT</Text>
      {insights.map((insight) => (
        <Pressable
          key={insight.id}
          onPress={() => open(insight)}
          accessibilityRole="button"
          accessibilityLabel={insight.text}
          testID={`reports-insight-${insight.id}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name={TONE[insight.tone].icon} size={16} color={TONE[insight.tone].color} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }}>{insight.text}</Text>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
        </Pressable>
      ))}
    </View>
  );
}
