import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useEntitlements, MEMBER_ENTITLEMENTS_KEY } from '@/hooks/useEntitlements';
import { statusLine } from '@/lib/subscription-status';

// Prices are fixed; source of truth is @workspace/jamvi-pricing JAMVI_PACKAGE.
const MONTHLY_KES = 100;
const ANNUAL_KES = 1_000;

const FEATURES = [
  'Your personal budget, income and expenses',
  'Join or create any number of Shared budgets',
  'No limit on how many people share a budget',
  'Shared bank accounts, savings goals and contributions',
  'Full history, reports and exports',
];

type StkPushResponse = {
  paymentId: number;
  amountKes: number;
  promoApplied: boolean;
  message: string;
};
type PaymentStatus = {
  status: 'pending' | 'succeeded' | 'failed' | 'timed_out';
  amountKes?: number;
  receipt?: string | null;
  detail?: string | null;
};

const kes = (value: number) => `KES ${value.toLocaleString('en-KE')}`;

export default function SubscriptionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: entitlements, isLoading } = useEntitlements();

  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
    setWaiting(false);
  };

  const pollUntilSettled = (id: number) => {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const payment = await customFetch<PaymentStatus>(`/api/payments/${id}/status`);
        if (payment.status === 'succeeded') {
          stopPolling();
          setPaymentId(null);
          void queryClient.invalidateQueries({ queryKey: MEMBER_ENTITLEMENTS_KEY });
          Alert.alert('Payment received', payment.receipt ? `M-Pesa code ${payment.receipt}.` : 'You are subscribed.');
          return;
        }
        if (payment.status === 'failed' || payment.status === 'timed_out') {
          stopPolling();
          Alert.alert('Payment not completed', payment.detail ?? 'Nothing was charged. You can try again.');
          return;
        }
      } catch {
        // A failed poll says nothing about the payment — keep asking.
      }
      if (attempts >= 40) {
        stopPolling();
        Alert.alert('Still waiting on M-Pesa', 'If you completed the payment, it will appear here shortly.');
        return;
      }
      pollRef.current = setTimeout(() => void tick(), 3_000);
    };
    pollRef.current = setTimeout(() => void tick(), 3_000);
  };

  const pay = async () => {
    if (!phoneNumber.trim() || waiting) return;
    setWaiting(true);
    try {
      const body = await customFetch<StkPushResponse>('/api/payments/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingInterval: interval,
          phoneNumber: phoneNumber.trim(),
          promoCode: promoCode.trim() || undefined,
        }),
      });
      setPaymentId(body.paymentId);
      Alert.alert(
        'Check your phone',
        body.promoApplied
          ? `Enter your M-Pesa PIN to pay ${kes(body.amountKes)}. Your code was applied.`
          : body.message,
      );
      pollUntilSettled(body.paymentId);
    } catch (error) {
      stopPolling();
      const data = (error as { data?: { error?: string; missing?: string[] } })?.data;
      const missing = Array.isArray(data?.missing) ? data!.missing! : [];
      Alert.alert(
        'Could not start payment',
        missing.length > 0
          ? `${data?.error ?? 'M-Pesa is not set up yet.'} Not set: ${missing.join(', ')}.`
          : data?.error ?? 'Check your connection and try again.',
      );
    }
  };

  const price = interval === 'annual' ? ANNUAL_KES : MONTHLY_KES;
  const status = entitlements ? statusLine(entitlements) : null;
  const isActive = entitlements?.status === 'active';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Subscription</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          One price covers your own budget and every group you are part of.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : status ? (
          <View
            style={[
              styles.card,
              { borderColor: colors.border, backgroundColor: entitlements?.fullAccess ? colors.card : `${colors.warning}14` },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{status.heading}</Text>
            <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>{status.detail}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{isActive ? 'Renew early' : 'Subscribe'}</Text>
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            {isActive
              ? 'Paying now adds to the end of your current period. You lose no days.'
              : 'Pay with M-Pesa. Your phone will prompt you for your PIN.'}
          </Text>

          <View style={styles.intervals}>
            {(
              [
                ['monthly', 'Monthly', MONTHLY_KES, 'every month'],
                ['annual', 'Annual', ANNUAL_KES, '2 months free'],
              ] as const
            ).map(([value, label, amount, note]) => {
              const on = interval === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setInterval(value)}
                  style={[
                    styles.interval,
                    { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}12` : colors.background },
                  ]}
                >
                  <Text style={[styles.intervalLabel, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.intervalPrice, { color: colors.foreground }]}>{kes(amount)}</Text>
                  <Text style={[styles.intervalNote, { color: colors.mutedForeground }]}>{note}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>M-Pesa number</Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            placeholder="07XX XXX XXX"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Any Safaricom number — it does not have to be the one you signed up with.
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Promo code (optional)</Text>
          <TextInput
            value={promoCode}
            onChangeText={(text) => setPromoCode(text.toUpperCase())}
            autoCapitalize="characters"
            placeholder="Student or group code"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          />

          <Pressable
            onPress={() => void pay()}
            disabled={waiting || !phoneNumber.trim()}
            style={[styles.payBtn, { backgroundColor: colors.primary, opacity: waiting || !phoneNumber.trim() ? 0.5 : 1 }]}
          >
            {waiting ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="smartphone" size={16} color={colors.primaryForeground} />
            )}
            <Text style={[styles.payLabel, { color: colors.primaryForeground }]}>
              {waiting ? (paymentId ? 'Waiting for your PIN…' : 'Sending prompt…') : `Pay ${kes(price)} with M-Pesa`}
            </Text>
          </Pressable>

          {paymentId ? (
            <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: 'center' }]}>
              Enter your M-Pesa PIN on your phone. This screen updates on its own.
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>What your subscription covers</Text>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Feather name="check" size={15} color={colors.success} style={{ marginTop: 2 }} />
              <Text style={[styles.featureText, { color: colors.mutedForeground }]}>{feature}</Text>
            </View>
          ))}
          <Text style={[styles.groupsNote, { color: colors.mutedForeground, backgroundColor: colors.muted }]}>
            Groups cost nothing. Everyone in a Shared budget pays for their own subscription, so a chama of fifty has no
            bill of its own.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', flex: 1 },
  intro: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  cardBody: { fontSize: 12, lineHeight: 17 },
  intervals: { flexDirection: 'row', gap: 10, marginTop: 4 },
  interval: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  intervalLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  intervalPrice: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  intervalNote: { fontSize: 11 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  input: { height: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  hint: { fontSize: 11, lineHeight: 16 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    marginTop: 6,
  },
  payLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  featureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  featureText: { flex: 1, fontSize: 12, lineHeight: 17 },
  groupsNote: { fontSize: 11, lineHeight: 16, borderRadius: 8, padding: 10, marginTop: 4 },
});
