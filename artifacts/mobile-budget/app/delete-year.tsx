import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { yearSummary, type PastYear } from '@/lib/deleteYear';
import { cleanConfirmInput, confirmBody, confirmReady, typedWord } from '@/lib/deletionConfirm';

/**
 * Deleting a whole past year from the Personal budget, for good ("delete 2025
 * for good, that is for me", 4 Oct 2026). Choose the year, see exactly what it
 * holds, get a code by email, and only the code deletes it - as deleting a
 * group (delete-group-code.tsx). Undated things stay: categories, income
 * sources, goals and accounts.
 */
export default function DeleteYearScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<{ currentYear: number; years: PastYear[] }>({
    queryKey: ['budget-years'],
    queryFn: () => customFetch('/api/budget-years'),
    retry: false,
  });
  const [chosen, setChosen] = useState<PastYear | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  // Set when this account has no email: the word to type instead of a code.
  const [word, setWord] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sendCode = async (year: PastYear) => {
    setSending(true);
    try {
      setWord(typedWord(await customFetch<unknown>(`/api/budget-years/${year.year}/delete/request-code`, { method: 'POST' })));
      setCodeSent(true);
    } catch (error) {
      Alert.alert('Could not send a code', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const choose = (year: PastYear) => {
    Alert.alert(
      `Delete ${year.year} for good?`,
      `${yearSummary(year)}\n\nThis cannot be undone. Your categories, income sources, goals and accounts stay. You confirm with a code we email you.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => { setChosen(year); setCode(''); void sendCode(year); } },
      ],
    );
  };

  const confirm = async () => {
    if (!chosen || !confirmReady(code, word) || deleting) return;
    setDeleting(true);
    try {
      await customFetch(`/api/budget-years/${chosen.year}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody(code, word)),
      });
      // Every balance, list and report on the phone changes with it.
      await queryClient.resetQueries();
      Alert.alert(
        `${chosen.year} deleted`,
        'Next, open Find the difference on the M-Pesa card: it tells you the opening balance your M-Pesa account needs on 1 January.',
      );
      router.back();
    } catch (error) {
      Alert.alert('Could not delete it', error instanceof Error ? error.message : 'Check the code and try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Delete a past year</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!chosen ? (
          <>
            <Text style={[styles.intro, { color: colors.mutedForeground }]}>
              Every entry dated in the year you choose is deleted from your Personal budget, for good. Only years before this one.
            </Text>
            {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {isError ? (
              <Pressable onPress={() => void refetch()} accessibilityRole="button">
                <Text style={{ color: colors.mutedForeground }}>Couldn’t load your years. Tap to try again.</Text>
              </Pressable>
            ) : null}
            {data && data.years.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }} testID="delete-year-none">There are no entries before {data.currentYear}.</Text>
            ) : null}
            {data?.years.map((year) => (
              <Pressable
                key={year.year}
                onPress={() => choose(year)}
                accessibilityRole="button"
                testID={`delete-year-${year.year}`}
                style={[styles.yearRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>{year.year}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{yearSummary(year)}</Text>
                </View>
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.intro, { color: colors.mutedForeground }]}>
              {sending && !codeSent
                ? 'Sending a code to your email…'
                : word
                  ? `Your account has no email to send a code to. Type ${word} below to delete ${chosen.year}. ${yearSummary(chosen)} It cannot be undone.`
                  : `We’ve emailed a 6-digit code. Enter it below - it is what deletes ${chosen.year}. ${yearSummary(chosen)} Nothing happens without it, and it cannot be undone.`}
            </Text>
            <TextInput
              value={code}
              onChangeText={(text) => setCode(cleanConfirmInput(text, word))}
              keyboardType={word ? 'default' : 'number-pad'}
              autoCapitalize="characters"
              placeholder={word ?? '000000'}
              placeholderTextColor={colors.mutedForeground}
              maxLength={word ? 12 : 6}
              autoFocus
              style={[styles.codeInput, { borderColor: colors.border, color: colors.foreground }]}
              testID="delete-year-code"
            />
            {word ? null : <Pressable onPress={() => void sendCode(chosen)} disabled={sending} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{sending ? 'Sending…' : 'Resend code'}</Text>
            </Pressable>}
          </>
        )}
      </ScrollView>

      {chosen ? (
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            testID="delete-year-confirm"
            onPress={() => void confirm()}
            disabled={deleting || sending || !confirmReady(code, word)}
            style={[styles.confirmBtn, { backgroundColor: colors.destructive, opacity: deleting || sending || !confirmReady(code, word) ? 0.5 : 1 }]}
          >
            {deleting
              ? <ActivityIndicator color={colors.destructiveForeground} />
              : <Text style={[styles.confirmLabel, { color: colors.destructiveForeground }]}>Delete {chosen.year} for good</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { padding: 16, gap: 14 },
  intro: { fontSize: 14, lineHeight: 20 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 8, padding: 14 },
  codeInput: { height: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 16, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: 8, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  confirmBtn: { height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { fontFamily: 'Inter_700Bold', fontSize: 16 },
});
