import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { PageScrollView } from '@/components/PageScrollReset';
import { useColors } from '@/hooks/useColors';
import { useSimpleView } from '@/hooks/useSimpleView';
import { useTabFlags } from '@/hooks/useTabFlags';

type Item = {
  key: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  hint: string;
  href: Href;
  show: boolean;
};

/**
 * Everything that is not on the small tab bar, one tap away and explained in a
 * sentence. Simple view keeps the bar to four tabs; nothing was taken out, it
 * all lives here. The switch at the foot brings the full bar back.
 */
export default function MoreScreen() {
  const colors = useColors();
  const [simple, setSimple] = useSimpleView();
  const { isShared, showReports, showDebt } = useTabFlags();

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
      key: 'mpesa',
      icon: 'message-square',
      title: 'Paste M-Pesa messages',
      hint: 'Turn your M-Pesa messages into entries, without typing',
      href: '/mpesa-import',
      show: true,
    },
    {
      key: 'reports',
      icon: 'pie-chart',
      title: 'Reports',
      hint: 'See where your money went',
      href: '/(tabs)/reports',
      show: showReports,
    },
    {
      key: 'contributions',
      icon: 'download',
      title: 'Who put in money',
      hint: 'What each person has added to the group',
      href: '/(tabs)/contributions',
      show: isShared,
    },
    {
      key: 'search',
      icon: 'search',
      title: 'Search',
      hint: 'Find any expense or payment',
      href: '/(tabs)/search',
      show: !isShared,
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

      <View style={[styles.card, styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>Simple view</Text>
          <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>
            {simple
              ? 'On: just the main tabs. Switch it off to see every tab at the bottom.'
              : 'Off: every tab is at the bottom. Switch it on for just the main ones.'}
          </Text>
        </View>
        <Switch
          value={simple}
          onValueChange={setSimple}
          accessibilityLabel="Simple view"
          testID="more-simple-view-switch"
        />
      </View>
    </PageScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
