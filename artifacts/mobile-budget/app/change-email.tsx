import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch, type AuthUser } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  confirmReady,
  EMAIL_CHANGE_INTRO,
  EMAIL_CHANGE_PASSWORD_NOTE,
  emailChangeCodeSent,
  emailChangedMessage,
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
} from '@/lib/emailChange';

/**
 * Settings' "Change email": new address -> code from that inbox -> moved.
 * Everything in the account moves with it (api-server lib/email-change.ts).
 */
export default function ChangeEmailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, adoptUser } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const address = email.trim().toLowerCase();
  const ready = step === 'email' ? looksLikeEmail(address) : confirmReady(code, password, needsPassword);

  const sendCode = async () => {
    if (!looksLikeEmail(address) || busy) return;
    setBusy(true);
    try {
      const result = await customFetch<{ needsPassword: boolean }>('/api/auth/change-email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      });
      setNeedsPassword(result.needsPassword);
      setStep('code');
    } catch (error) {
      Alert.alert('Could not send a code', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!confirmReady(code, password, needsPassword) || busy) return;
    setBusy(true);
    try {
      const result = await customFetch<{ user: AuthUser }>('/api/auth/change-email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, code: code.trim(), ...(needsPassword ? { password } : {}) }),
      });
      await adoptUser(result.user);
      router.back();
      Alert.alert('Email changed', emailChangedMessage(address));
    } catch (error) {
      Alert.alert('Could not change your email', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.foreground }];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Change your sign-in email</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {user?.email ? (
          <Text style={[styles.small, { color: colors.mutedForeground }]}>Now: {user.email}</Text>
        ) : null}
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          {step === 'email' ? EMAIL_CHANGE_INTRO : emailChangeCodeSent(address)}
        </Text>

        {step === 'email' ? (
          <TextInput
            testID="change-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="new.email@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={inputStyle}
          />
        ) : (
          <>
            <TextInput
              testID="change-email-code"
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="6-digit code"
              placeholderTextColor={colors.mutedForeground}
              maxLength={6}
              autoFocus
              style={[inputStyle, styles.codeInput]}
            />
            {needsPassword ? (
              <>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>{EMAIL_CHANGE_PASSWORD_NOTE}</Text>
                <TextInput
                  testID="change-email-password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
                  placeholderTextColor={colors.mutedForeground}
                  style={inputStyle}
                />
              </>
            ) : null}
            <Pressable onPress={() => { setStep('email'); setCode(''); }} hitSlop={8}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                Use a different address or send a new code
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          testID="change-email-submit"
          onPress={() => void (step === 'email' ? sendCode() : confirm())}
          disabled={busy || !ready}
          style={[styles.submit, { backgroundColor: colors.primary, opacity: busy || !ready ? 0.5 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.submitLabel, { color: colors.primaryForeground }]}>
              {step === 'email' ? 'Send code' : 'Change email'}
            </Text>
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
    gap: 12,
  },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { padding: 16, gap: 14 },
  intro: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  small: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  codeInput: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 6, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  submit: { height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  submitLabel: { fontFamily: 'Inter_700Bold', fontSize: 16 },
});
