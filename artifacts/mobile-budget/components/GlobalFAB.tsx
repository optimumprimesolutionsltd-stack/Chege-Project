import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
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
  const segments = useSegments();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const fabBottom  = Platform.OS === 'web' ? 100 : insets.bottom + 70;
  const menuBottom = Platform.OS === 'web' ? 166 : insets.bottom + 136;
  const isTabHome = segments[0] === '(tabs)' && segments.length === 1;
  const goHome = () => {
    setOpen(false);
    router.replace('/(tabs)');
  };

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

      {!isTabHome && (
        <Pressable
          testID="global-home"
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          style={[
            styles.homePill,
            { bottom: fabBottom, backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={goHome}
        >
          <Feather name="home" size={17} color={colors.primary} />
          <Text style={[styles.homePillText, { color: colors.foreground }]}>Home</Text>
        </Pressable>
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
  homePill: {
    position: 'absolute',
    right: 88,
    minWidth: 76,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 7,
  },
  homePillText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
