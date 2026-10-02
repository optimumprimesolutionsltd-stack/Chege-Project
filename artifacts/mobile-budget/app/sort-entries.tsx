import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetIncomeSources,
  useUpdateJointAccountTransaction,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { isNotSure, type EntryToSort } from '@/lib/entriesToSort';
import { plainSaveError } from '@/lib/saveRetry';
import { formatDisplayDate } from '@/lib/displayFormat';

const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

/**
 * Entries saved as "Not sure", one at a time: what money out was for, where
 * money in came from. Each one leaves the list as soon as it is given a
 * category or a source (api-server routes/entries-to-sort).
 */
export default function SortEntriesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ['entries-to-sort'],
    queryFn: () => customFetch('/api/entries-to-sort'),
    retry: false,
  });
  const { data: categoryList = [] } = useGetBudgetCategories();
  const { data: incomeSources = [] } = useGetIncomeSources();
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();

  // Only categories that carry spending: not a heading, and not "Not sure yet" itself.
  const categories = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);
  const entries = data?.entries ?? [];

  const done = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entries-to-sort'] }),
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
    ]);
  };
  const sort = async (entry: EntryToSort, change: { expenseCategory: string } | { incomeSourceId: number }) => {
    setBusy(entry.id);
    try {
      await updateTransaction({ id: entry.id, data: { amount: entry.amount, date: entry.date, ...change } as never });
      await done();
    } catch (error) {
      Alert.alert('Could not change it', plainSaveError(error));
    } finally {
      setBusy(null);
    }
  };
  const leave = async (entry: EntryToSort) => {
    setBusy(entry.id);
    try {
      await customFetch(`/api/entries-to-sort/${entry.id}`, { method: 'DELETE' });
      await done();
    } catch (error) {
      Alert.alert('Could not change it', plainSaveError(error));
    } finally {
      setBusy(null);
    }
  };

  const chip = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted } as const;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="sort-entries-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Sort them out</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Entries you saved as Not sure</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : isError ? (
          <Pressable onPress={() => refetch()} accessibilityRole="button">
            <Text style={{ color: colors.mutedForeground }}>Couldn’t load these. Tap to try again.</Text>
          </Pressable>
        ) : entries.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]} testID="sort-entries-empty">
            <Feather name="check-circle" size={28} color={colors.success} />
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 8 }}>All sorted</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>Nothing saved as Not sure is waiting.</Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: busy === entry.id ? 0.6 : 1 }]} testID={`sort-entry-${entry.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{entry.description}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{formatDisplayDate(entry.date)} · {entry.direction === 'out' ? 'Money out' : 'Money in'}</Text>
                </View>
                <Text style={{ color: entry.direction === 'out' ? colors.destructive : colors.success, fontFamily: 'Inter_700Bold' }}>
                  {entry.direction === 'out' ? '−' : '+'}{kes(entry.amount)}
                </Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{entry.direction === 'out' ? 'What was it for?' : 'Where did it come from?'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {entry.direction === 'out'
                  ? categories.map((name) => (
                      <Pressable key={name} disabled={busy !== null} onPress={() => void sort(entry, { expenseCategory: name })} accessibilityRole="button" testID={`sort-entry-${entry.id}-category-${name}`} style={chip}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{name}</Text>
                      </Pressable>
                    ))
                  : incomeSources.map((source) => (
                      <Pressable key={source.id} disabled={busy !== null} onPress={() => void sort(entry, { incomeSourceId: source.id })} accessibilityRole="button" testID={`sort-entry-${entry.id}-source-${source.id}`} style={chip}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{source.name}</Text>
                      </Pressable>
                    ))}
              </ScrollView>
              {entry.direction === 'in' ? (
                <Pressable disabled={busy !== null} onPress={() => void leave(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-leave`} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Leave it with no source</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  body: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
});
