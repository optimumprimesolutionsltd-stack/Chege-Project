import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { useGetGroup } from '@workspace/api-client-react';

const SNOOZE_KEY = 'jamvi:home-tip-snooze-until';
const SNOOZE_DAYS = 5;

// One nudge, rotated by the day so it is not the same one every open. Only for
// shared budgets — every tip here is about sharing the record with the group.
const TIPS: { icon: keyof typeof Feather.glyphMap; text: string; route: string }[] = [
  { icon: 'user-plus', text: 'Invite the rest of the group so everyone sees the same record.', route: '/(tabs)/settings' },
  { icon: 'link', text: 'Share a read-only link — people can follow the money without an account.', route: '/(tabs)/settings' },
  { icon: 'share-2', text: "Send this period's contribution sheet to the group's WhatsApp.", route: '/(tabs)/contributions' },
  { icon: 'target', text: 'Set what each member is expected to give, and arrears show on their own.', route: '/(tabs)/contributions' },
  { icon: 'file-text', text: 'Hand anyone a statement of what they have paid — no login needed.', route: '/(tabs)/contributions' },
];

export function HomeTip() {
  const colors = useColors();
  const { data: group } = useGetGroup();
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((raw) => {
        const until = raw ? Number(raw) : 0;
        if (active) setShow(!Number.isFinite(until) || Date.now() >= until);
      })
      .catch(() => {
        if (active) setShow(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready || !show || group?.isPrivate !== false) return null;

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  const tip = TIPS[dayOfYear % TIPS.length];

  const snooze = () => {
    setShow(false);
    void AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)).catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: `${colors.secondary}14`, borderColor: `${colors.secondary}44` }]}>
      <Feather name={tip.icon} size={16} color={colors.secondary} style={{ marginTop: 1 }} />
      <Pressable style={styles.body} onPress={() => router.push(tip.route as never)}>
        <Text style={[styles.tip, { color: colors.foreground }]}>{tip.text}</Text>
        <Text style={[styles.action, { color: colors.secondary }]}>Show me →</Text>
      </Pressable>
      <Pressable onPress={snooze} hitSlop={10} accessibilityLabel="Dismiss tip">
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 3 },
  tip: { fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  action: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
