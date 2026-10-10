import { openQuickActionsArranger } from '@/lib/layoutPrefs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { PageScrollView } from '@/components/PageScrollReset';
import { useColors } from '@/hooks/useColors';
import { useTabFlags } from '@/hooks/useTabFlags';
import { useHasBusiness } from '@/hooks/useHasBusiness';

type Item = {
  key: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  hint: string;
  href: Href;
  show: boolean;
};

/**
 * Everything that is not on the five-tab bar (lib/tabPlan), one tap away and
 * explained in a sentence: Bank, Goals, Search, Who owes who, Debt, Settings
 * and the rest. Nothing was taken out of the app; it all lives here (10 Oct 2026).
 */
export default function MoreScreen() {
  const colors = useColors();
  const { isShared, showBudget, showDebt } = useTabFlags();
  const hasBusiness = useHasBusiness();

  const items: Item[] = [
    {
      key: 'bank',
      icon: 'briefcase',
      title: 'Bank',
      hint: 'Put money in, take money out, and see your balance',
      href: '/(tabs)/bank',
      show: true,
    },
    {
      key: 'goals',
      icon: 'target',
      title: 'Goals',
      hint: 'Savings goals and what you have put towards them',
      href: '/(tabs)/goals',
      show: true,
    },
    {
      key: 'budget',
      icon: 'bar-chart-2',
      title: 'Budget',
      hint: "The group's categories and what each has left",
      href: '/(tabs)/budget',
      // A group's bar carries Contributions in Budget's place (lib/tabPlan).
      show: isShared && showBudget,
    },
    {
      key: 'mpesa',
      icon: 'message-square',
      title: 'Import M-Pesa',
      hint: 'Read your M-Pesa statement, or paste messages, into entries',
      href: '/mpesa-import',
      show: true,
    },
    {
      key: 'business',
      icon: 'briefcase',
      title: 'Business',
      hint: 'Sales, cost of goods sold, expenses and profit for each business',
      href: '/business',
      show: hasBusiness,
    },
    {
      key: 'search',
      icon: 'search',
      title: 'Search',
      hint: 'Find any expense or payment',
      href: '/(tabs)/search',
      // Not a tab (lib/tabPlan); also an icon in Activity's and Budget's headers.
      show: true,
    },
    {
      key: 'owes',
      icon: 'users',
      title: 'Who owes who',
      hint: 'Money you owe, and money owed to you',
      href: '/parties',
      show: true,
    },
    {
      key: 'debt',
      icon: 'trending-down',
      title: 'Debt',
      hint: 'Track what you are paying off',
      href: '/(tabs)/debt',
      show: showDebt,
    },
    {
      key: 'help',
      icon: 'help-circle',
      title: 'How do I…?',
      hint: 'Step-by-step answers',
      href: '/help',
      show: true,
    },
    {
      key: 'settings',
      icon: 'settings',
      title: 'Settings',
      hint: 'Your account and this budget',
      href: '/(tabs)/settings',
      show: true,
    },
  ];

  return (
    <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Everything else, one tap away</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {items
          .filter((item) => item.show)
          .map((item, index) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.hint}`}
              testID={`more-${item.key}`}
              style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
                <Feather name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{item.hint}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
      </View>

      <Pressable
        onPress={openQuickActionsArranger}
        accessibilityRole="button"
        testID="more-arrange-quick-actions"
        style={[styles.card, styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
          <Feather name="sliders" size={20} color={colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>Arrange your quick actions</Text>
          <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>
            Choose the four buttons in the bar above the tabs, and their order. You can also hold any of them.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>

    </PageScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
