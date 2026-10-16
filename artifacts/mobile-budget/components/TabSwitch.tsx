import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * The switch at the top of the Money and Reports tabs: "the tab thing with banks
 * reports etc is exhausting" (15 Oct 2026). Three tabs - Home, Money, Plan -
 * each holding screens that already existed, chosen here rather than from
 * the tab bar: Money is Accounts or All activity, Plan is Budget or Reports
 * (Contributions first in a group).
 *
 * Given by app/(tabs)/money.tsx and plan.tsx; shown by WorkspaceIdentityRow,
 * which heads every one of those screens. Opened on its own (from a link), a
 * screen has no switch and looks as it always did.
 */
export type TabSwitchOption = { key: string; label: string };
type TabSwitchValue = { options: TabSwitchOption[]; value: string; onChange: (key: string) => void };

const TabSwitchContext = createContext<TabSwitchValue | null>(null);

export const TabSwitchProvider = TabSwitchContext.Provider;

export function TabSwitchSlot({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const ctx = useContext(TabSwitchContext);
  const colors = useColors();
  if (!ctx || ctx.options.length < 2) return null;
  const dark = tone === 'dark';
  return (
    <View
      style={[styles.track, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : colors.muted }]}
      accessibilityRole="tablist"
      testID="tab-switch"
    >
      {ctx.options.map((option) => {
        const on = option.key === ctx.value;
        return (
          <Pressable
            key={option.key}
            onPress={() => ctx.onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`tab-switch-${option.key}`}
            style={[styles.segment, on ? { backgroundColor: dark ? '#ffffff' : colors.card } : null]}
          >
            <Text
              style={[
                styles.label,
                { color: on ? (dark ? '#0A3833' : colors.foreground) : dark ? 'rgba(255,255,255,0.8)' : colors.mutedForeground },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: 3, marginTop: 10, marginBottom: 4 },
  segment: { flex: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
