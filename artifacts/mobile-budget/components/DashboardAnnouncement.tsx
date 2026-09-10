import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';

/**
 * A slim, dismissible bar for "here is something new", matching the web home
 * page. Bump ANNOUNCEMENT.id whenever the message changes so a bar dismissed
 * earlier comes back.
 */
const ANNOUNCEMENT = {
  id: '2026-09-report-verification',
  text: 'New — download the monthly contribution report as a PDF or send it to WhatsApp, each carrying a link members can use to check it is genuine.',
  route: '/(tabs)/contributions' as const,
  cta: 'Open Contributions',
};
const DISMISS_KEY = 'jamvi:dismissed-announcement';

export function DashboardAnnouncement() {
  const colors = useColors();
  const [state, setState] = useState<'loading' | 'shown' | 'hidden'>('loading');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((value) => {
        if (active) setState(value === ANNOUNCEMENT.id ? 'hidden' : 'shown');
      })
      .catch(() => {
        if (active) setState('shown');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state !== 'shown') return null;

  const dismiss = () => {
    setState('hidden');
    AsyncStorage.setItem(DISMISS_KEY, ANNOUNCEMENT.id).catch(() => undefined);
  };

  return (
    <View style={[styles.bar, { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}33` }]}>
      <View style={[styles.icon, { backgroundColor: `${colors.primary}1A` }]}>
        <Feather name="volume-2" size={14} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.text, { color: colors.foreground }]}>{ANNOUNCEMENT.text}</Text>
        <Pressable onPress={() => router.push(ANNOUNCEMENT.route)} hitSlop={6}>
          <Text style={[styles.cta, { color: colors.primary }]}>{ANNOUNCEMENT.cta} →</Text>
        </Pressable>
      </View>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Dismiss this message">
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 14,
  },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 5 },
  text: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  cta: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
