import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const MAIN_ACTIONS = [
  { id: 'expense', icon: 'plus-circle' as const, label: 'I spent', route: '/add-expense' },
  { id: 'banking', icon: 'credit-card' as const, label: 'Bank' },
  { id: 'save', icon: 'target' as const, label: 'Save', route: '/(tabs)/goals?shortcut=contribute' },
  { id: 'budget', icon: 'bar-chart-2' as const, label: 'Budget', route: '/(tabs)/budget' },
];

const BANKING_ACTIONS = [
  { id: 'deposit', icon: 'arrow-down-left' as const, label: 'Money in', hint: 'Money that came into your bank account', route: '/(tabs)/bank?shortcut=deposit' },
  { id: 'withdraw', icon: 'arrow-up-right' as const, label: 'Money out', hint: 'Money you took out of your bank account', route: '/(tabs)/bank?shortcut=withdraw' },
  { id: 'transfer', icon: 'repeat' as const, label: 'Move money', hint: 'Move money between your accounts or goals', route: '/(tabs)/bank?shortcut=bank-transfer' },
];

/** Persistent action footer — rendered at the tab-layout level so it appears on every screen. */
export function GlobalFAB() {
  const [bankingOpen, setBankingOpen] = useState(false);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Keep the action footer above the navigator's tab bar and device home indicator.
  const footerBottom = Platform.OS === 'web' ? 84 : insets.bottom + 68;
  const openRoute = (route: string) => {
    setBankingOpen(false);
    router.push(route as any);
  };

  return (
    <>
      {bankingOpen && <Pressable style={styles.backdrop} onPress={() => setBankingOpen(false)} />}

      {bankingOpen && (
        <View style={[styles.bankingMenu, { bottom: footerBottom + 72, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.bankingMenuTitle, { color: colors.foreground }]}>Your bank</Text>
          <Text style={[styles.bankingMenuSubtitle, { color: colors.mutedForeground }]}>What did you do with your money?</Text>
          {BANKING_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              testID={`global-banking-${action.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${action.label}. ${action.hint}`}
              style={({ pressed }) => [styles.bankingMenuItem, { backgroundColor: pressed ? colors.muted : 'transparent' }]}
              onPress={() => openRoute(action.route)}
            >
              <View style={[styles.bankingMenuIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Feather name={action.icon} size={17} color={colors.primary} />
              </View>
              <View style={styles.bankingMenuCopy}>
                <Text style={[styles.bankingMenuItemLabel, { color: colors.foreground }]}>{action.label}</Text>
                <Text style={[styles.bankingMenuItemHint, { color: colors.mutedForeground }]}>{action.hint}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.actionFooter, { bottom: footerBottom, backgroundColor: colors.card, borderColor: colors.border }]}>
        {MAIN_ACTIONS.map((action) => {
          const isBanking = action.id === 'banking';
          return (
            <Pressable
              key={action.label}
              testID={`global-footer-${action.id}`}
              accessibilityRole="button"
              accessibilityLabel={isBanking ? 'Open bank actions: money in, money out, move money' : action.label}
              style={({ pressed }) => [
                styles.actionItem,
                { backgroundColor: isBanking && bankingOpen ? `${colors.primary}18` : 'transparent', opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => isBanking ? setBankingOpen((open) => !open) : openRoute(action.route!)}
            >
              <Feather name={action.icon} size={20} color={isBanking && bankingOpen ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.actionLabel, { color: isBanking && bankingOpen ? colors.primary : colors.foreground }]}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  actionFooter: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 64,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 6,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  actionItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    gap: 3,
  },
  actionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  bankingMenu: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 10,
    zIndex: 102,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  bankingMenuTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    marginHorizontal: 6,
    marginTop: 3,
  },
  bankingMenuSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    marginHorizontal: 6,
    marginTop: 3,
    marginBottom: 7,
  },
  bankingMenuItem: {
    minHeight: 54,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  bankingMenuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankingMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  bankingMenuItemLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  bankingMenuItemHint: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
});
