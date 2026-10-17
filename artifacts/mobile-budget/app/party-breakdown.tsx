import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { longDay } from '@/lib/dayRange';
import { formatExact } from '@/lib/formatExact';
import { breakdownGap, KIND_WORDS, type PartyBreakdown } from '@/lib/partyBreakdown';

/**
 * Where a person's balance on Who owes who comes from: every entry linked to
 * them, oldest first, what each did and the running figure - and what of the
 * balance no entry explains, with a way to set it to what the entries say.
 * "check on who owes who why judys money is 680,100- where isit coming from"
 * (17 Oct 2026). Each entry opens on Money, to fix it there.
 */
export default function PartyBreakdownScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, isLoading, isError, refetch } = useQuery<PartyBreakdown>({
    queryKey: ['party-breakdown', id],
    queryFn: () => customFetch<PartyBreakdown>(`/api/contributors/${Number(id)}/breakdown`),
    enabled: Number(id) > 0,
    retry: false,
  });
  const kes = (value: number) => `KES ${formatExact(Math.abs(value))}`;
  const gap = data ? breakdownGap(data) : null;

  const useEntries = () => {
    if (!data) return;
    Alert.alert(
      `Set ${data.name}'s balance from the entries?`,
      `${data.fromEntries.owedByUs > 0 ? `You owe ${kes(data.fromEntries.owedByUs)}` : ''}${data.fromEntries.owedByUs > 0 && data.fromEntries.owedToUs > 0 ? ' and ' : ''}${data.fromEntries.owedToUs > 0 ? `${data.name} owes you ${kes(data.fromEntries.owedToUs)}` : ''}${data.fromEntries.owedByUs === 0 && data.fromEntries.owedToUs === 0 ? 'Nothing owed either way' : ''}, as the entries add up. What was typed in or added by hand goes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set it',
          onPress: () => {
            void customFetch(`/api/contributors/${data.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owedByUs: data.fromEntries.owedByUs, owedToUs: data.fromEntries.owedToUs }),
            })
              .then(() => {
                void queryClient.invalidateQueries({ queryKey: ['parties'] });
                void refetch();
              })
              .catch((error: unknown) => Alert.alert('Could not change it', error instanceof Error ? error.message : 'Please try again.'));
          },
        },
      ],
    );
  };

  return (
    <PageScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="party-breakdown-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }} numberOfLines={1}>
          {data ? `Where ${data.name}'s balance comes from` : 'Where the balance comes from'}
        </Text>
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
      {isError ? (
        <Pressable onPress={() => void refetch()} testID="party-breakdown-retry">
          <Text style={{ color: colors.mutedForeground }}>Could not load it. Tap to try again.</Text>
        </Pressable>
      ) : null}

      {data ? (
        <>
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} testID="party-breakdown-summary">
            {data.now.owedByUs > 0 || data.fromEntries.owedByUs > 0 ? (
              <>
                <Line label={`You owe ${data.name} now`} value={kes(data.now.owedByUs)} strong colors={colors} />
                <Line label={`From ${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'} below`} value={kes(data.fromEntries.owedByUs)} colors={colors} />
              </>
            ) : null}
            {data.now.owedToUs > 0 || data.fromEntries.owedToUs > 0 ? (
              <>
                <Line label={`${data.name} owes you now`} value={kes(data.now.owedToUs)} strong colors={colors} />
                <Line label={`From ${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'} below`} value={kes(data.fromEntries.owedToUs)} colors={colors} />
              </>
            ) : null}
            {gap ? (
              <View style={{ gap: 8, marginTop: 6 }} testID="party-breakdown-gap">
                <Text style={{ color: '#f87171', fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19 }}>{gap}</Text>
                <Pressable onPress={useEntries} accessibilityRole="button" testID="party-breakdown-use-entries"
                  style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.primary }}>
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Use what the entries say</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>The balance is exactly what the entries below add up to.</Text>
            )}
          </View>

          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.6, marginTop: 6 }}>THE ENTRIES, OLDEST FIRST</Text>
          {data.entries.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }} testID="party-breakdown-none">
              No entry is linked to {data.name}. On Money, open a payment to or from them and say who it was with.
            </Text>
          ) : data.entries.map((entry) => {
            const change = entry.owedByUs !== 0 ? entry.owedByUs : entry.owedToUs;
            const running = entry.owedByUs !== 0 ? entry.runningOwedByUs : entry.runningOwedToUs;
            return (
              <Pressable
                key={entry.id}
                onPress={() => router.push(`/(tabs)/bank?editTx=${entry.id}${entry.accountId ? `&accountId=${entry.accountId}` : ''}&opened=${Date.now()}&returnTo=${encodeURIComponent(`/party-breakdown?id=${data.id}`)}` as never)}
                accessibilityRole="button"
                accessibilityLabel={`${entry.description}, ${KIND_WORDS[entry.kind]}, ${kes(entry.amount)}. Opens it to edit.`}
                testID={`party-breakdown-entry-${entry.id}`}
                style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14 }} numberOfLines={1}>{entry.description || KIND_WORDS[entry.kind]}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{longDay(entry.date)} · {KIND_WORDS[entry.kind]}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: change > 0 ? '#f87171' : '#22c55e', fontFamily: 'Inter_700Bold' }}>{change > 0 ? '+' : '−'}{formatExact(Math.abs(change))}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>= {formatExact(running)}</Text>
                </View>
                <Feather name="edit-2" size={13} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </>
      ) : null}
    </PageScrollView>
  );
}

function Line({ label, value, strong, colors }: { label: string; value: string; strong?: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
      <Text style={{ flex: 1, color: strong ? colors.foreground : colors.mutedForeground, fontFamily: strong ? 'Inter_700Bold' : 'Inter_400Regular', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: strong ? colors.foreground : colors.mutedForeground, fontFamily: strong ? 'Inter_700Bold' : 'Inter_400Regular', fontSize: 14 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 12 },
});
