import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetBudgetCategoriesQueryKey,
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useGetJointAccount,
  useUpdateJointAccountTransaction,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { isNotSure, NOT_SURE_CATEGORY, sameParty, type EntryToSort } from '@/lib/entriesToSort';
import { AddIncomeSourceChip } from '@/components/AddIncomeSourceChip';
import { SortAsDebt } from '@/components/SortAsDebt';
import { NewCategoryOffer } from '@/components/NewCategoryOffer';
import { CreateCategorySheet } from '@/components/CreateCategorySheet';
import { matchesSearch } from '@/lib/bankSearch';
import { standardTargetFor } from '@/lib/standardCategory';
import { type CategoryLite } from '@/lib/standardCategory';
import { inMonth, monthsOf, suggestForSaved } from '@/lib/mpesaImport';
import { parseStoredRules, rulesStorageKey, type PayeeRules } from '@/lib/payeeLearning';
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
  // The same array until the data changes: the suggestions effect keys on it, and a
  // fresh [] each render while loading would restart it for ever.
  const entries = useMemo(() => data?.entries ?? [], [data]);
  // A month at a time, as in the import.
  const [month, setMonth] = useState<string | null>(null);
  const months = useMemo(() => monthsOf(entries), [entries]);
  // Search narrows the month's entries by payee or amount (lib/bankSearch), as on Bank.
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searched = useDeferredValue(search.trim());
  const shown = useMemo(
    () => entries.filter((entry) => inMonth(entry, month) && (!searched || matchesSearch(entry, searched))),
    [entries, month, searched],
  );

  const done = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entries-to-sort'] }),
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
    ]);
  };
  // The last change, kept so it can be undone: "there is no undo button in
  // Sort them out" (4 Oct 2026) - and "All 12" is a lot to take back by hand.
  const [lastChange, setLastChange] = useState<{ text: string; undo: () => Promise<void> } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const undoLast = async () => {
    if (!lastChange || undoing) return;
    setUndoing(true);
    try {
      await lastChange.undo();
      setLastChange(null);
    } catch (error) {
      Alert.alert('Could not undo it', plainSaveError(error));
    } finally {
      await done();
      setUndoing(false);
    }
  };
  // Back to where it was: money out under Not sure yet, money in with no source
  // (still marked, so it is listed again as soon as it has none).
  const putBack = (one: EntryToSort) => updateTransaction({
    id: one.id,
    data: { amount: one.amount, date: one.date, ...(one.direction === 'out' ? { expenseCategory: NOT_SURE_CATEGORY } : { incomeSourceId: null }) } as never,
  });
  const sortEach = async (list: readonly EntryToSort[], change: { expenseCategory: string } | { incomeSourceId: number }, label: string) => {
    setBusy(list[0]?.id ?? null);
    const changed: EntryToSort[] = [];
    try {
      for (const one of list) {
        await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, ...change } as never });
        changed.push(one);
      }
    } catch (error) {
      Alert.alert('Could not change them all', plainSaveError(error));
    } finally {
      if (changed.length > 0) {
        setLastChange({
          text: `${changed.length === 1 ? changed[0].description : `${changed.length} entries`} put under ${label}`,
          undo: async () => { for (const one of changed) await putBack(one); },
        });
      }
      await done();
      setBusy(null);
    }
  };
  // The same payer, many times over: offered all at once, never done without asking.
  const sort = (entry: EntryToSort, change: { expenseCategory: string } | { incomeSourceId: number }, label: string) => {
    const others = sameParty(entries, entry);
    if (others.length === 0) {
      void sortEach([entry], change, label);
      return;
    }
    Alert.alert(
      `${others.length + 1} entries from ${entry.description}`,
      `Put all ${others.length + 1} under ${label}, or just this one?`,
      [
        { text: 'Just this one', onPress: () => void sortEach([entry], change, label) },
        { text: `All ${others.length + 1}`, onPress: () => void sortEach([entry, ...others], change, label) },
      ],
    );
  };
  const { data: group } = useGetGroup();
  // "+ New category" on any entry: name, parent and tier (components/CreateCategorySheet).
  const [newCategoryFor, setNewCategoryFor] = useState<EntryToSort | null>(null);

  // A suggestion for each entry, worked out as the import does (suggestForSaved):
  // the rules kept on this phone, how each payee was filed before, then
  // well-known payees. "Can it go back to entries saved as not sure and
  // preselect?" (7 Oct 2026). Nothing is filed until the person taps.
  const [rules, setRules] = useState<PayeeRules>({});
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(rulesStorageKey(group?.id))
      .then((stored) => { if (active) setRules(parseStoredRules(stored)); })
      .catch(() => {});
    return () => { active = false; };
  }, [group?.id]);
  const { data: ledger } = useGetJointAccount(undefined, { query: { queryKey: getGetJointAccountQueryKey(), staleTime: 60_000 } });
  // Worked out a batch at a time, once per payee, so taps always get through:
  // done all at once on every reload it held the phone for minutes and nothing
  // on screen answered (7 Oct 2026). The green chips fill in as it goes.
  const [suggestions, setSuggestions] = useState<Map<number, string>>(() => new Map());
  useEffect(() => {
    const history = (ledger?.transactions ?? []) as unknown as Parameters<typeof suggestForSaved>[1];
    const byPayee = new Map<string, string>();
    const found = new Map<number, string>();
    let next = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const BATCH = 40;
    const step = () => {
      if (cancelled) return;
      for (const end = Math.min(next + BATCH, entries.length); next < end; next += 1) {
        const entry = entries[next];
        const key = `${entry.direction}|${entry.description.trim().toLowerCase()}`;
        let name = byPayee.get(key);
        if (name === undefined) {
          name = suggestForSaved(entry, history, categories, rules);
          byPayee.set(key, name);
        }
        if (name) found.set(entry.id, name);
      }
      setSuggestions(new Map(found));
      if (next < entries.length) timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [entries, ledger, categories, rules]);
  const suggestedShown = useMemo(() => shown.filter((entry) => suggestions.has(entry.id)), [shown, suggestions]);
  // Every suggestion on screen at once, after saying how many, undone as one.
  const acceptAll = () => {
    if (suggestedShown.length === 0) return;
    Alert.alert(
      `File ${suggestedShown.length} as suggested?`,
      'Each goes under the category shown in green on it. Entries with no suggestion stay here. You can undo this.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: `File ${suggestedShown.length}`,
          onPress: async () => {
            setBusy(suggestedShown[0].id);
            const changed: EntryToSort[] = [];
            try {
              for (const one of suggestedShown) {
                await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, expenseCategory: suggestions.get(one.id) } as never });
                changed.push(one);
              }
            } catch (error) {
              Alert.alert('Could not file them all', plainSaveError(error));
            } finally {
              if (changed.length > 0) {
                setLastChange({
                  text: `${changed.length} ${changed.length === 1 ? 'entry' : 'entries'} filed as suggested`,
                  undo: async () => { for (const one of changed) await putBack(one); },
                });
              }
              await done();
              setBusy(null);
            }
          },
        },
      ],
    );
  };
  // Money in with no source is gathered onto this list by the server whenever it
  // is read - every year, minus what was left with no source (7 Oct 2026).
  const leave = async (entry: EntryToSort) => {
    setBusy(entry.id);
    try {
      await customFetch(`/api/entries-to-sort/${entry.id}`, { method: 'DELETE' });
      setLastChange({
        text: `${entry.description} left with no source`,
        undo: async () => {
          await customFetch('/api/entries-to-sort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionIds: [entry.id] }),
          });
        },
      });
      await done();
    } catch (error) {
      Alert.alert('Could not change it', plainSaveError(error));
    } finally {
      setBusy(null);
    }
  };

  // "Debt" on an entry: lent, borrowed or paid back, and who with (components/SortAsDebt).
  const [debtFor, setDebtFor] = useState<EntryToSort | null>(null);

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
            {suggestedShown.length > 0 ? (
              <Pressable
                onPress={acceptAll}
                disabled={busy !== null}
                accessibilityRole="button"
                testID="sort-entries-accept-all"
                style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, opacity: busy !== null ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>Accept {suggestedShown.length} {suggestedShown.length === 1 ? 'suggestion' : 'suggestions'}</Text>
                <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, marginTop: 2 }}>Jamvi suggests a category from how you filed these payees before, or from what the payee is.</Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {searchOpen ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, backgroundColor: colors.card }}>
                  <Feather name="search" size={15} color={colors.mutedForeground} />
                  <TextInput value={search} onChangeText={setSearch} autoFocus placeholder="Payee or amount" placeholderTextColor={colors.mutedForeground} returnKeyType="search" testID="sort-entries-search-input"
                    style={{ flex: 1, paddingVertical: 9, color: colors.foreground, fontSize: 14 }} />
                </View>
              ) : <View style={{ flex: 1 }} />}
              <Pressable onPress={() => { if (searchOpen) setSearch(''); setSearchOpen((open) => !open); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={searchOpen ? 'Close search' : 'Search these entries'} testID="sort-entries-search-toggle"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name={searchOpen ? 'x' : 'search'} size={15} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{searchOpen ? 'Close' : 'Search'}</Text>
              </Pressable>
            </View>
            {searched ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }} testID="sort-entries-search-count">
                {shown.length === 0 ? `Nothing matching "${searched}".` : `${shown.length} found`}
              </Text>
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
              {/* Always in view, not at the start of the sideways row where they scrolled
                  out of sight: "there is no place to create child and parent category and
                  lent/borrowed" (7 Oct 2026). */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable disabled={busy !== null} onPress={() => setDebtFor(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-debt`}
                  style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                  <Feather name="users" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{entry.direction === 'out' ? 'Lent / paid a debt' : 'Borrowed / paid back'}</Text>
                </Pressable>
                {entry.direction === 'out' ? (
                  <Pressable disabled={busy !== null} onPress={() => setNewCategoryFor(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-new-category-sheet`}
                    style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                    <Feather name="plus" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>New category</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {entry.direction === 'out' && suggestions.has(entry.id) ? (
                  <Pressable disabled={busy !== null} onPress={() => sort(entry, { expenseCategory: suggestions.get(entry.id)! }, suggestions.get(entry.id)!)} accessibilityRole="button" accessibilityLabel={`Suggested: ${suggestions.get(entry.id)}`} testID={`sort-entry-${entry.id}-suggested`}
                    style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.success, backgroundColor: `${colors.success}22` }}>
                    <Feather name="check" size={13} color={colors.success} />
                    <Text style={{ color: colors.success, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{suggestions.get(entry.id)}</Text>
                  </Pressable>
                ) : null}
                {entry.direction === 'out'
                  ? categories.filter((name) => name !== suggestions.get(entry.id)).map((name) => (
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
              {entry.direction === 'out' && !suggestions.has(entry.id) ? (
                <NewCategoryOffer
                  description={entry.description}
                  rows={categoryList as unknown as CategoryLite[]}
                  testID={`sort-entry-${entry.id}-new-category`}
                  onCreated={(name) => {
                    void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
                    sort(entry, { expenseCategory: name }, name);
                  }}
                />
              ) : null}
              {entry.direction === 'in' ? (
                <Pressable disabled={busy !== null} onPress={() => void leave(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-leave`} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Leave it with no source</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
      {newCategoryFor ? (
        <CreateCategorySheet
          target={standardTargetFor(newCategoryFor.description)}
          rows={categoryList as unknown as CategoryLite[]}
          onClose={() => setNewCategoryFor(null)}
          onCreated={(name) => {
            const entry = newCategoryFor;
            setNewCategoryFor(null);
            void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
            sort(entry, { expenseCategory: name }, name);
          }}
        />
      ) : null}
      {debtFor ? (
        <SortAsDebt
          entry={debtFor}
          others={sameParty(entries, debtFor)}
          onClose={() => setDebtFor(null)}
          onSorted={(change) => {
            setDebtFor(null);
            setLastChange(change);
            void done();
          }}
        />
      ) : null}
      {lastChange ? (
        <View
          testID="sort-entries-undo-bar"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.foreground, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Text style={{ flex: 1, color: colors.background, fontSize: 13 }} numberOfLines={2}>{lastChange.text}</Text>
          <Pressable onPress={() => void undoLast()} disabled={undoing} accessibilityRole="button" testID="sort-entries-undo" hitSlop={8}>
            <Text style={{ color: colors.background, fontFamily: 'Inter_700Bold', fontSize: 14, opacity: undoing ? 0.6 : 1 }}>{undoing ? 'Undoing…' : 'Undo'}</Text>
          </Pressable>
          <Pressable onPress={() => setLastChange(null)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8}>
            <Feather name="x" size={16} color={colors.background} />
          </Pressable>
        </View>
      ) : null}
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
