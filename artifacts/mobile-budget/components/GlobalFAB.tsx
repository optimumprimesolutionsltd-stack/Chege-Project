import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const FAB_ACTIONS = [
  { icon: 'plus-circle' as const, label: 'Expense',  color: '#4ade80', bg: '#1a3320', route: '/add-expense'         },
  { icon: 'credit-card' as const, label: 'Deposit',  color: '#f97316', bg: '#2a1c0a', route: '/(tabs)/bank?shortcut=deposit' },
  { icon: 'target'      as const, label: 'Save to Goal', color: '#f472b6', bg: '#2a0a1a', route: '/(tabs)/goals?shortcut=contribute' },
];

/** Persistent floating action button — rendered at the tab-layout level so it appears on every screen. */
export function GlobalFAB() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const fabBottom  = Platform.OS === 'web' ? 100 : insets.bottom + 70;
  const menuBottom = Platform.OS === 'web' ? 166 : insets.bottom + 136;

  return (
    <>
      {/* Backdrop — closes menu on outside tap */}
      {open && (
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
      )}

      {/* Action menu */}
      {open && (
        <View style={[styles.menu, { bottom: menuBottom }]}>
          {FAB_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              testID={`global-shortcut-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${action.label}`}
              style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setOpen(false); router.push(action.route as any); }}
            >
              <View style={[styles.menuIcon, { backgroundColor: action.bg }]}>
                <Feather name={action.icon} size={18} color={action.color} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* FAB button */}
      <Pressable
        testID="global-quick-actions"
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close quick actions' : 'Open quick actions'}
        style={[styles.fab, { bottom: fabBottom, backgroundColor: open ? colors.foreground : colors.secondary }]}
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
      >
        <Feather name={open ? 'x' : 'plus'} size={28} color={open ? colors.background : '#fff'} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  menu: {
    position: 'absolute',
    right: 12,
    zIndex: 100,
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
