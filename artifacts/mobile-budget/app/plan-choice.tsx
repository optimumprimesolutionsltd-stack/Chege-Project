import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { daysUntil } from '@/lib/subscription-status';
import { recordPlanChoice, type PlanChoice } from '@/lib/planChoice';
import { usePrices } from '@/hooks/usePrices';
import { kesLabel } from '@/lib/pricing';

/**
 * Compulsory, once per account: Jamvi is paid, so somebody on the free trial
 * says whether they are carrying on with the trial or paying now before they
 * reach Home. There is no close button and no back gesture — both answers
 * are one tap, and neither takes anything away (the trial keeps running).
 */
export default function PlanChoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: entitlements } = useEntitlements();
  const prices = usePrices();
  const [busy, setBusy] = useState<PlanChoice | null>(null);
  const daysLeft = daysUntil(entitlements?.trialEndsAt ?? null);

  const choose = async (choice: PlanChoice) => {
    if (!user?.id || busy) return;
    setBusy(choice);
    try {
      await recordPlanChoice(user.id, choice, AsyncStorage);
    } finally {
      setBusy(null);
    }
    router.replace('/(tabs)');
    if (choice === 'pay') router.push('/subscription');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <Feather name="gift" size={24} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>BEFORE YOU START</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Jamvi is a paid app</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Try everything free
        {daysLeft !== null && daysLeft > 0 ? ` for ${daysLeft} days` : ' for your first 14 days'}. After that it is
        {kesLabel(prices.monthly)} a month or {kesLabel(prices.annual)} a year — one subscription covers your Personal budget and every group you are in.
        Nothing is ever deleted if you stop; recording just goes read-only.
      </Text>

      <View style={styles.actions}>
        <Pressable
          testID="plan-choice-trial"
          accessibilityRole="button"
          onPress={() => void choose('trial')}
          disabled={busy !== null}
          style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
        >
          {busy === 'trial' ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Start my free trial</Text>
        </Pressable>
        <Pressable
          testID="plan-choice-pay"
          accessibilityRole="button"
          onPress={() => void choose('pay')}
          disabled={busy !== null}
          style={[styles.btn, styles.btnOutline, { borderColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
        >
          {busy === 'pay' ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={[styles.btnText, { color: colors.primary }]}>Pay now with M-Pesa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
  mark: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', marginTop: 6 },
  body: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 14 },
  actions: { marginTop: 'auto', gap: 12 },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 14, paddingHorizontal: 16 },
  btnOutline: { borderWidth: 1.5 },
  btnText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
});
