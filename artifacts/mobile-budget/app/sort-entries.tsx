import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useUpdateJointAccountTransaction,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { isNotSure, sameParty, type EntryToSort } from '@/lib/entriesToSort';
import { AddIncomeSourceChip } from '@/components/AddIncomeSourceChip';
import { workingYear } from '@/lib/mpesaLiveBalance';
import { inMonth, monthsOf } from '@/lib/mpesaImport';
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
  // A month at a time, as in the import.
  const [month, setMonth] = useState<string | null>(null);
  const months = useMemo(() => monthsOf(entries), [entries]);
  const shown = useMemo(() => entries.filter((entry) => inMonth(entry, month)), [entries, month]);

  const done = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entries-to-sort'] }),
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
    ]);
  };
  const sortEach = async (list: readonly EntryToSort[], change: { expenseCategory: string } | { incomeSourceId: number }) => {
    setBusy(list[0]?.id ?? null);
    try {
      for (const one of list) {
        await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, ...change } as never });
      }
    } catch (error) {
      Alert.alert('Could not change them all', plainSaveError(error));
    } finally {
      await done();
      setBusy(null);
    }
  };
  // The same payer, many times over: offered all at once, never done without asking.
  const sort = (entry: EntryToSort, change: { expenseCategory: string } | { incomeSourceId: number }, label: string) => {
    const others = sameParty(entries, entry);
    if (others.length === 0) {
      void sortEach([entry], change);
      return;
    }
    Alert.alert(
      `${others.length + 1} entries from ${entry.description}`,
      `Put all ${others.length + 1} under ${label}, or just this one?`,
      [
        { text: 'Just this one', onPress: () => void sortEach([entry], change) },
        { text: `All ${others.length + 1}`, onPress: () => void sortEach([entry, ...others], change) },
      ],
    );
  };
  // Money in saved before every money in was asked about (4 Oct 2026): a year of
  // it can have no source. Gathered here when asked, Personal budget only.
  const { data: group } = useGetGroup();
  const [gathering, setGathering] = useState(false);
  const gather = async () => {
    setGathering(true);
    try {
      // This year only: earlier years are left as they are.
      const { added } = await customFetch<{ added: number }>('/api/entries-to-sort/money-in-without-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: workingYear().from }),
      });
      await done();
      Alert.alert(
        added > 0 ? `${added} found` : 'Nothing new found',
        added > 0
          ? 'Money in with no income source is now on this list. Give each a source, or several at once from the same payer.'
          : 'All your money in already has a source, is a loan or a move between accounts, or is on this list.',
      );
    } catch (error) {
      Alert.alert('Could not look', plainSaveError(error));
    } finally {
      setGathering(false);
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
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : isError ? (
        <Pressable onPress={() => refetch()} accessibilityRole="button" style={styles.body}>
          <Text style={{ color: colors.mutedForeground }}>Couldn’t load these. Tap to try again.</Text>
        </Pressable>
      ) : (
        // A whole year saved as Not sure is over a thousand: drawn as it scrolls.
        <FlatList
          data={shown}
          keyExtractor={(entry) => String(entry.id)}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          ListHeaderComponent={(
            <View style={{ gap: 10 }}>
            {group?.isPrivate ? (
              <Pressable
                onPress={() => void gather()}
                disabled={gathering}
                accessibilityRole="button"
                testID="sort-entries-gather-money-in"
                style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, opacity: gathering ? 0.6 : 1 }}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{gathering ? 'Looking…' : `Find ${workingYear().year} money in with no source`}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  Money in you have already saved without saying where it came from. Loans, repayments and moves between your accounts are left out.
                </Text>
              </Pressable>
            ) : null}
            {months.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} testID="sort-entries-months">
              {[{ key: null as string | null, label: 'All months', count: entries.length }, ...months].map((option) => {
                const on = month === option.key;
                return (
                  <Pressable key={option.key ?? 'all'} onPress={() => setMonth(option.key)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`sort-entries-month-${option.key ?? 'all'}`}
                    style={{ ...chip, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                    <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.label} ({option.count})</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            ) : null}
            </View>
          )}
          ListEmptyComponent={(
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]} testID="sort-entries-empty">
              <Feather name="check-circle" size={28} color={colors.success} />
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 8 }}>All sorted</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>Nothing saved as Not sure is waiting.</Text>
            </View>
          )}
          renderItem={({ item: entry }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: busy === entry.id ? 0.6 : 1 }]} testID={`sort-entry-${entry.id}`}>
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
                      <Pressable key={name} disabled={busy !== null} onPress={() => sort(entry, { expenseCategory: name }, name)} accessibilityRole="button" testID={`sort-entry-${entry.id}-category-${name}`} style={chip}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{name}</Text>
                      </Pressable>
                    ))
                  : [
                      ...incomeSources.map((source) => (
                        <Pressable key={source.id} disabled={busy !== null} onPress={() => sort(entry, { incomeSourceId: source.id }, source.name)} accessibilityRole="button" testID={`sort-entry-${entry.id}-source-${source.id}`} style={chip}>
                          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{source.name}</Text>
                        </Pressable>
                      )),
                      <AddIncomeSourceChip
                        key="add"
                        testID={`sort-entry-${entry.id}-add-source`}
                        onCreated={(created) => sort(entry, { incomeSourceId: created.id }, created.name)}
                      />,
                    ]}
              </ScrollView>
              {entry.direction === 'in' ? (
                <Pressable disabled={busy !== null} onPress={() => void leave(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-leave`} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Leave it with no source</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  body: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 8 },
});
