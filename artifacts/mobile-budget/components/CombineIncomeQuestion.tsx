import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetIncomeSourcesQueryKey, getGetJointAccountQueryKey, useGetGroup, useGetIncomeSources } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { useBusinesses } from '@/hooks/useBusinesses';
import { ownIncomeKey, streamToAsk, withSourceMoved } from '@/lib/combineIncome';
import { readRules, saveRules } from '@/lib/rulesStore';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

/**
 * "Is Rental income money one of your businesses earns?" - each income stream
 * that is not plainly the person's own, asked once beside their businesses
 * (lib/combineIncome). Combined, the stream's entries move to the business
 * and it goes; "No" keeps it. Nothing to ask, nothing shown.
 */
export function CombineIncomeQuestion() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const businesses = useBusinesses();
  const { data: sources = [] } = useGetIncomeSources();
  const key = ownIncomeKey(group?.id);
  const { data: answered = [] } = useQuery<number[]>({
    queryKey: ['own-income', key],
    queryFn: async () => {
      try {
        const parsed: unknown = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
      } catch {
        return [];
      }
    },
    enabled: group?.id != null,
    staleTime: Infinity,
  });
  const [saving, setSaving] = useState(false);
  const list = (sources as Array<{ id: number; name: string }>).map((source) => ({ id: source.id, name: source.name }));
  const stream = businesses.ready ? streamToAsk(list, businesses.list, answered) : null;
  if (!stream) return null;

  const keepIt = async () => {
    const next = [...answered, stream.id];
    queryClient.setQueryData(['own-income', key], next);
    await AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  };

  const combine = (business: { id: number; name: string }) => {
    Alert.alert(
      `Combine ${stream.name} into ${business.name}?`,
      `Everything saved under ${stream.name} moves to ${business.name}, and ${stream.name} goes. The money is counted once, as ${business.name}'s.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Combine',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await customFetch(`/api/businesses/${business.id}/combine`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ incomeSourceId: stream.id }),
                });
                // This phone's copy of the payers kept for it, as the server changed its own.
                const rules = await readRules(group?.id);
                const moved = withSourceMoved(rules, stream.id, business.id);
                await saveRules(group?.id, moved, moved);
                void queryClient.invalidateQueries({ queryKey: getGetIncomeSourcesQueryKey() });
                void queryClient.invalidateQueries({ queryKey: ['income-sources'] });
                void queryClient.invalidateQueries({ queryKey: ['businesses'] });
                void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
                for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
              } catch (error) {
                Alert.alert('Could not combine them', error instanceof Error ? error.message : 'Please try again.');
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="combine-income-question">
      <View style={styles.head}>
        <Feather name="git-merge" size={15} color={colors.primary} />
        <Text style={[styles.kicker, { color: colors.primary }]}>ONE SOURCE, ONE NAME</Text>
      </View>
      <Text style={[styles.question, { color: colors.foreground }]}>Is {stream.name} money one of your businesses earns?</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        If it is, it is combined into that business, so the same money is never counted under two names.
      </Text>
      <View style={styles.answers}>
        {saving ? <ActivityIndicator color={colors.primary} /> : (
          <>
            {businesses.list.map((business) => (
              <Pressable
                key={business.id}
                onPress={() => combine(business)}
                accessibilityRole="button"
                testID={`combine-income-into-${business.id}`}
                style={({ pressed }) => [styles.chip, { borderColor: colors.primary, backgroundColor: `${colors.primary}10`, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.chipText, { color: colors.primary }]}>{business.name}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => void keepIt()}
              accessibilityRole="button"
              testID="combine-income-keep"
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]}>No - paid to me</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  question: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
