import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetBudgetCategoriesQueryKey, useGetGroup } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { useOnScreen } from '@/hooks/useOnScreen';
import { keptTwinsKey, twinToCombine, withCategoryMoved, type CategoryRow } from '@/lib/combineCategories';
import { readRules, saveRules } from '@/lib/rulesStore';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

/**
 * "Rent share and Rent are the same thing?" - each category onboarding made
 * twice, asked once on Home (lib/combineCategories). Combined, everything
 * filed under it moves to the one picked and it goes; "Keep both" keeps it.
 * Nothing to ask, nothing shown.
 */
export function CombineCategoriesQuestion() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const key = keptTwinsKey(group?.id);
  // Home stays mounted behind other tabs: followed only while it is in view.
  const onScreen = useOnScreen();
  const { data: categories = [] } = useQuery<CategoryRow[]>({
    subscribed: onScreen,
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<CategoryRow[]>('/api/budget-categories'),
    staleTime: 30_000,
  });
  const { data: kept = [] } = useQuery<number[]>({
    queryKey: ['kept-twin-categories', key],
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
  const twin = twinToCombine(categories, kept);
  if (!twin) return null;
  const { from } = twin;

  const keepBoth = async () => {
    const next = [...kept, from.id];
    queryClient.setQueryData(['kept-twin-categories', key], next);
    await AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  };

  const combine = (into: { id: number; name: string }) => {
    Alert.alert(
      `Combine ${from.name} into ${into.name}?`,
      `Everything saved under ${from.name} moves to ${into.name}, and ${from.name} goes. ${into.name} keeps its budget, so what is left to pay counts every payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Combine',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await customFetch(`/api/budget-categories/${from.id}/combine`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intoId: into.id }),
                });
                // This phone's copy of the payees filed there, as the server changed its own.
                const rules = await readRules(group?.id);
                const moved = withCategoryMoved(rules, from.name, into.name);
                await saveRules(group?.id, moved, moved);
                void queryClient.invalidateQueries({ queryKey: ['budget-categories-full'] });
                void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
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

  const one = twin.into.length === 1 ? twin.into[0] : null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="combine-categories-question">
      <View style={styles.head}>
        <Feather name="git-merge" size={15} color={colors.primary} />
        <Text style={[styles.kicker, { color: colors.primary }]}>ONE THING, ONE CATEGORY</Text>
      </View>
      <Text style={[styles.question, { color: colors.foreground }]}>
        {one ? `Are ${from.name} and ${one.name} the same thing?` : `Which bill is ${from.name}?`}
      </Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Combined, every payment is under one name, so its budget shows what is left to pay.
      </Text>
      <View style={styles.answers}>
        {saving ? <ActivityIndicator color={colors.primary} /> : (
          <>
            {twin.into.map((into) => (
              <Pressable
                key={into.id}
                onPress={() => combine(into)}
                accessibilityRole="button"
                testID={`combine-category-into-${into.id}`}
                style={({ pressed }) => [styles.chip, { borderColor: colors.primary, backgroundColor: `${colors.primary}10`, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.chipText, { color: colors.primary }]}>{one ? `Yes - combine into ${into.name}` : into.name}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => void keepBoth()}
              accessibilityRole="button"
              testID="combine-category-keep"
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]}>{one ? 'No - keep both' : 'Keep it as it is'}</Text>
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
