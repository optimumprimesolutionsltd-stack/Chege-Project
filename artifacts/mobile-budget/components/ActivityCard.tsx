import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ACTIVITY_TYPE } from '@/lib/activityTypes';
import { getExpenseActivityEditHref } from '@/lib/expenseEditLink';
import { formatDisplayDate } from '@/lib/displayFormat';

export interface ActivityItem {
  id: string;
  type: string;
  amount: number;
  description: string;
  userName: string | null;
  category?: string | null;
  date: string;
  editTarget?: string;
}

interface Colors {
  card: string;
  cardForeground: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  primary: string;
  secondary: string;
  radius: number;
}

interface Props {
  item: ActivityItem;
  colors: Colors;
}

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Food: 'shopping-cart',
  Transport: 'truck',
  Health: 'heart',
  Education: 'book',
  Utilities: 'zap',
  Entertainment: 'tv',
  Clothing: 'tag',
  Savings: 'archive',
  Housing: 'home',
  Communication: 'phone',
};

export default function ActivityCard({ item, colors }: Props) {
  const isExpense = item.type === ACTIVITY_TYPE.EXPENSE;
  const isSavings = item.type === ACTIVITY_TYPE.SAVINGS;
  const expenseEditHref = getExpenseActivityEditHref(item);

  const iconName: keyof typeof Feather.glyphMap =
    (item.category ? CATEGORY_ICONS[item.category] : undefined) ??
    (isExpense ? 'shopping-bag' : isSavings ? 'target' : 'arrow-down-circle');

  const iconBg = isExpense ? colors.accent : isSavings ? '#1a3320' : colors.muted;
  const iconColor = isExpense ? colors.accentForeground : isSavings ? '#4ade80' : colors.primary;
  const amountColor = isExpense ? colors.foreground : isSavings ? '#4ade80' : colors.primary;

  const content = (
    <>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: iconBg,
            borderRadius: colors.radius - 2,
          },
        ]}
      >
        <Feather name={iconName} size={18} color={iconColor} />
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.description, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {item.description}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {item.userName ?? (isExpense ? 'Joint bank' : 'Unknown')} · {formatDisplayDate(item.date)}
          {expenseEditHref ? ' · Edit expense' : ''}
        </Text>
      </View>

      <Text style={[styles.amount, { color: amountColor }]}>
        {isExpense ? '−' : '+'}
        {item.amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
      </Text>
      {expenseEditHref ? <Feather name="edit-2" size={15} color={colors.primary} /> : null}
    </>
  );

  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius,
    },
  ];

  return expenseEditHref ? (
    <Pressable
      onPress={() => router.push(expenseEditHref as never)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.description}`}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      style={[
        ...cardStyle,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  description: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  pressed: { opacity: 0.78 },
});
