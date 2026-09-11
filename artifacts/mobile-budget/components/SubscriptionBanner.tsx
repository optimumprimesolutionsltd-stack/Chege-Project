import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useEntitlements } from '@/hooks/useEntitlements';
import { bannerLine } from '@/lib/subscription-status';

/**
 * A slim strip above the tabs whenever the subscription is worth knowing
 * about — any day of a trial, a missed payment, or a lapse that has made
 * Shared groups read-only. Silent only once fully, currently subscribed.
 * Tapping opens the Subscription screen.
 */
export function SubscriptionBanner() {
  const colors = useColors();
  const { data: entitlements } = useEntitlements();
  const line = bannerLine(entitlements);
  if (!line) return null;

  const warn = line.tone === 'warn';
  const bg = warn ? `${colors.warning}1F` : `${colors.primary}14`;
  const fg = warn ? colors.warning : colors.primary;

  return (
    <Pressable
      onPress={() => router.push('/subscription')}
      style={[styles.bar, { backgroundColor: bg, borderBottomColor: colors.border }]}
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
