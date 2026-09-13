import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';

/**
 * The confirmation step settings.tsx's "Delete account" leads to.
 *
 * A code sent to the account's own email is what actually starts the grace
 * period — not the tap that got here. A session left open on a shared
 * device can reach this screen, but cannot get past it without also having
 * read the email.
 */
export default function DeleteAccountCodeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const requestedOnce = useRef(false);

  const sendCode = async () => {
    setSending(true);
    try {
      await customFetch('/api/auth/delete-account/request-code', { method: 'POST' });
    } catch (error) {
      Alert.alert(
        'Could not send a code',
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  // Sent once, the moment this screen opens — not on every re-render, and
  // not twice if something re-mounts it.
  useEffect(() => {
    if (requestedOnce.current) return;
    requestedOnce.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    if (confirming || sending || code.length !== 6) return;
    setConfirming(true);
    try {
      await customFetch('/api/auth/delete-account/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      // The confirm endpoint already ended the session server-side; this
      // clears the local token and cache to match.
      await logout();
    } catch (error) {
      Alert.alert(
        'Could not confirm',
        error instanceof Error ? error.message : 'Check the code and try again.',
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Confirm deletion</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          {sending && code.length === 0
            ? 'Sending a code to your email…'
            : 'We’ve emailed a 6-digit code. Enter it below — this is what actually schedules your account for deletion. Nothing happens without it.'}
        </Text>

        <TextInput
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^\d]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="000000"
          placeholderTextColor={colors.mutedForeground}
          maxLength={6}
          autoFocus
          style={[styles.codeInput, { borderColor: colors.border, color: colors.foreground }]}
          testID="delete-account-code-input"
        />

        <Pressable onPress={() => void sendCode()} disabled={sending} hitSlop={8} style={styles.resendLink}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
            {sending ? 'Sending…' : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          testID="delete-account-confirm"
          onPress={() => void confirm()}
          disabled={confirming || sending || code.length !== 6}
          style={[
            styles.confirmBtn,
            { backgroundColor: colors.destructive, opacity: confirming || sending || code.length !== 6 ? 0.5 : 1 },
          ]}
        >
          {confirming ? (
            <ActivityIndicator color={colors.destructiveForeground} />
          ) : (
            <Text style={[styles.confirmLabel, { color: colors.destructiveForeground }]}>Delete my account</Text>
          )}
        </Pressable>
      </View>
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
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { flex: 1, padding: 16, gap: 16 },
  intro: { fontSize: 14, lineHeight: 20 },
  codeInput: {
    height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 8,
    textAlign: 'center',
  },
  resendLink: { alignSelf: 'center', paddingVertical: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  confirmBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { fontFamily: 'Inter_700Bold', fontSize: 16 },
});
