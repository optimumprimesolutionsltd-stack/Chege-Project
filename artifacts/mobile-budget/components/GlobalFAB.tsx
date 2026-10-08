import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { ArrangeSheet } from '@/components/ArrangeSheet';
import { arrange, onOpenQuickActionsArranger, QUICK_ACTION_SLOTS, QUICK_ACTIONS_KEY, useArrangement, useQuickBarHidden } from '@/lib/layoutPrefs';

type QuickAction = { id: string; icon: keyof typeof Feather.glyphMap; label: string; route?: string };

// The bar holds four. These four are the default; the rest can be swapped in
// from Arrange (hold any button, or More).
const MAIN_ACTIONS: QuickAction[] = [
  { id: 'expense', icon: 'plus-circle', label: 'I spent', route: '/add-expense' },
  { id: 'banking', icon: 'credit-card', label: 'Bank' },
  { id: 'save', icon: 'target', label: 'Save', route: '/(tabs)/goals?shortcut=contribute' },
  { id: 'budget', icon: 'bar-chart-2', label: 'Budget', route: '/(tabs)/budget' },
  { id: 'mpesa', icon: 'message-square', label: 'M-Pesa', route: '/mpesa-import' },
  { id: 'reports', icon: 'pie-chart', label: 'Reports', route: '/(tabs)/reports' },
  { id: 'money-in', icon: 'arrow-down-left', label: 'Money in', route: '/(tabs)/bank?shortcut=deposit' },
  { id: 'search', icon: 'search', label: 'Search', route: '/(tabs)/search' },
];

const BANKING_ACTIONS = [
  { id: 'deposit', icon: 'arrow-down-left' as const, label: 'Money in', hint: 'Money that came into your bank account', route: '/(tabs)/bank?shortcut=deposit' },
  { id: 'withdraw', icon: 'arrow-up-right' as const, label: 'Money out', hint: 'Money you took out of your bank account', route: '/(tabs)/bank?shortcut=withdraw' },
  { id: 'mpesa', icon: 'message-square' as const, label: 'Import M-Pesa', hint: 'Your M-Pesa statement or messages, as entries', route: '/mpesa-import' },
  { id: 'transfer', icon: 'repeat' as const, label: 'Move money', hint: 'Move money between your accounts or goals', route: '/(tabs)/bank?shortcut=bank-transfer' },
];

/** Persistent action footer — rendered at the tab-layout level so it appears on every screen. */
export function GlobalFAB() {
  const [bankingOpen, setBankingOpen] = useState(false);
  const [arrangement, setArrangement] = useArrangement(QUICK_ACTIONS_KEY);
  const [arranging, setArranging] = useState(false);
  useEffect(() => onOpenQuickActionsArranger(() => setArranging(true)), []);
  const shownActions = arrange(MAIN_ACTIONS, arrangement).slice(0, QUICK_ACTION_SLOTS);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Stepped aside for a screen's Save bar while it is in edit mode.
  const hidden = useQuickBarHidden();

  // Keep the action footer above the navigator's tab bar and device home indicator.
  const footerBottom = Platform.OS === 'web' ? 84 : insets.bottom + 68;
  const openRoute = (route: string) => {
    setBankingOpen(false);
    router.push(route as any);
  };

  if (hidden && !arranging) return null;
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
        {shownActions.map((action) => {
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
              onLongPress={() => { setBankingOpen(false); setArranging(true); }}
            >
              <Feather name={action.icon} size={20} color={isBanking && bankingOpen ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.actionLabel, { color: isBanking && bankingOpen ? colors.primary : colors.foreground }]}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ArrangeSheet
        visible={arranging}
        title="Arrange your quick actions"
        hint={`The first ${QUICK_ACTION_SLOTS} shown are in the bar. Move the ones you use most to the top, and hide the rest.`}
        items={MAIN_ACTIONS}
        arrangement={arrangement}
        onChange={setArrangement}
        onClose={() => setArranging(false)}
        slots={QUICK_ACTION_SLOTS}
        testID="quick-actions-arrange-sheet"
      />
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  bankingMenuIcon: {
    width: 34,
    height: 34,
    borderRadius: 6,
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
