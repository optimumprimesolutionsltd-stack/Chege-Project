import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useEntitlements } from '@/hooks/useEntitlements';
import { bannerLine } from '@/lib/subscription-status';

/**
 * A slim strip above the tabs whenever the subscription is worth knowing
 * about — any day of a trial, a missed payment, or a lapse that has made
 * recording read-only everywhere, Personal budget included. Silent only
 * once fully, currently subscribed.
 * Tapping opens the Subscription screen.
 *
 * Rendered once at the tab-layout level (above the navigator, not inside any
 * one screen) so it persists across every tab rather than disappearing the
 * moment somebody leaves Home. That also makes it the first thing on screen,
 * so it carries its own top safe-area inset instead of relying on a screen's
 * own header to have already cleared the notch/status bar.
 */
export function SubscriptionBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: entitlements } = useEntitlements();
  const line = bannerLine(entitlements);
  if (!line) return null;

  const warn = line.tone === 'warn';
  const bg = warn ? `${colors.warning}1F` : `${colors.primary}14`;
  const fg = warn ? colors.warning : colors.primary;

  return (
    <Pressable
      onPress={() => router.push('/subscription')}
      style={[styles.bar, { paddingTop: insets.top + 9, backgroundColor: bg, borderBottomColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={line.text}
    >
      <Feather name={warn ? 'alert-triangle' : 'clock'} size={13} color={fg} />
      <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={1}>
        {line.text}
      </Text>
      <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
});
