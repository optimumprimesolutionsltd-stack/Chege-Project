import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useQuickBarHidden } from '@/lib/layoutPrefs';

/**
 * One + for adding anything, in place of the four-button bar that floated
 * above the tabs: "the tab thing with banks reports etc is exhausting" (15 Oct
 * 2026). The bar and the tabs were nine buttons with Budget twice; Budget and
 * Reports are the Plan tab now, Bank and Activity the Money tab, and every way
 * to add money - spent, in, out, moved, saved, brought in from M-Pesa - is here.
 */
const ADD_ACTIONS = [
  { id: 'expense', icon: 'shopping-bag' as const, label: 'I spent', hint: 'Something you paid for', route: '/add-expense' },
  { id: 'mpesa', icon: 'message-square' as const, label: 'Bring in M-Pesa', hint: 'Your M-Pesa messages or statement, sorted for you', route: '/mpesa-import' },
  { id: 'deposit', icon: 'arrow-down-left' as const, label: 'Money in', hint: 'Money that came into an account', route: '/(tabs)/bank?shortcut=deposit' },
  { id: 'withdraw', icon: 'arrow-up-right' as const, label: 'Money out', hint: 'Money you took out of an account', route: '/(tabs)/bank?shortcut=withdraw' },
  { id: 'transfer', icon: 'repeat' as const, label: 'Move money', hint: 'Between your own accounts', route: '/(tabs)/bank?shortcut=bank-transfer' },
  { id: 'save', icon: 'target' as const, label: 'Save', hint: 'Put money towards a goal', route: '/(tabs)/goals?shortcut=contribute' },
];

/** The + - rendered at the tab-layout level so it is on every tab. */
export function GlobalFAB() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Stepped aside for a screen's Save bar while it is in edit mode.
  const hidden = useQuickBarHidden();

  // Above the navigator's tab bar and the device home indicator.
  const fabBottom = Platform.OS === 'web' ? 96 : insets.bottom + 68;
  const openRoute = (route: string) => {
    setOpen(false);
    router.push(route as any);
  };

  if (hidden) return null;
  return (
    <>
      {open && <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />}

      {open && (
        <View style={[styles.menu, { bottom: fabBottom + 68, backgroundColor: colors.card, borderColor: colors.border }]} testID="global-add-menu">
          <Text style={[styles.menuTitle, { color: colors.foreground }]}>Add</Text>
          {ADD_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              testID={`global-add-${action.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${action.label}. ${action.hint}`}
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.muted : 'transparent' }]}
              onPress={() => openRoute(action.route)}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Feather name={action.icon} size={17} color={colors.primary} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.menuItemLabel, { color: colors.foreground }]}>{action.label}</Text>
                <Text style={[styles.menuItemHint, { color: colors.mutedForeground }]}>{action.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => setOpen((now) => !now)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close Add' : 'Add: spent, M-Pesa, money in or out, move or save'}
        testID="global-add"
        style={({ pressed }) => [styles.fab, { bottom: fabBottom, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Feather name={open ? 'x' : 'plus'} size={26} color={colors.primaryForeground} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.25)' },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 101,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
  },
  menu: {
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
  menuTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginHorizontal: 6, marginTop: 3, marginBottom: 6 },
  menuItem: { minHeight: 52, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6 },
  menuIcon: { width: 34, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  menuCopy: { flex: 1, minWidth: 0 },
  menuItemLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  menuItemHint: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 1 },
});
