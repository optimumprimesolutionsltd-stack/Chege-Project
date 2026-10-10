import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetBudgetCategoriesQueryKey,
  useCreateBudgetCategory,
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useGetJointAccount,
  useUpdateJointAccountTransaction,
} from '@workspace/api-client-react';
import { useSourceCorrection } from '@/hooks/useSourceCorrection';
import { useColors } from '@/hooks/useColors';
import { isRefund, spentText } from '@/lib/refundLabel';
import { isNotSure, isToCheck, NOT_SURE_CATEGORY, sameParty, type EntryToSort } from '@/lib/entriesToSort';
import { AddIncomeSourceChip } from '@/components/AddIncomeSourceChip';
import { SortAsDebt } from '@/components/SortAsDebt';
import { PassThroughPair } from '@/components/PassThroughPair';
import { useAutoMarkBusiness, useOwnerBusiness } from '@/hooks/useOwnerBusiness';
import { isHistoryQuery } from '@/lib/refreshAfterSave';
import { LISTS_AN_EDIT_CHANGES, withoutSorted } from '@/lib/showSavedEdit';
import { NewCategoryOffer } from '@/components/NewCategoryOffer';
import { CreateCategorySheet } from '@/components/CreateCategorySheet';
import { matchesSearch } from '@/lib/bankSearch';
import { standardTargetFor } from '@/lib/standardCategory';
import { type CategoryLite } from '@/lib/standardCategory';
import { inMonth, suggestForSaved } from '@/lib/mpesaImport';
import { monthsOfYear, yearsOf } from '@/lib/yearMonths';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { isoDay, longDay, monthStartIso, orderedRange } from '@/lib/dayRange';
import { parseStoredRules, rulesStorageKey, type PayeeRules } from '@/lib/payeeLearning';
import { plainSaveError } from '@/lib/saveRetry';
import { FAMILY_CATEGORY, familyCategories, withFamily } from '@/lib/family';
import { saveRules } from '@/lib/rulesStore';
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
  // Entries naming your business are marked as they arrive, and leave the list
  // when it is fetched again (lib/ownerBusiness).
  const ownerBusiness = useOwnerBusiness();
  useAutoMarkBusiness(useMemo(() => (data?.entries ?? []).map((entry) => ({ ...entry, type: entry.direction === 'in' ? 'deposit' : 'disbursement' })), [data]));
  // A month at a time, as in the import.
  const [month, setMonth] = useState<string | null>(null);
  // January to December of one year, each with its count (lib/yearMonths).
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => yearsOf(entries, thisYear), [entries, thisYear]);
  const [year, setYear] = useState(thisYear);
  const months = useMemo(() => monthsOfYear(entries, year), [entries, year]);
  // Search narrows the month's entries by payee or amount (lib/bankSearch), as on Bank.
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searched = useDeferredValue(search.trim());
  // "Want all time, months and pick a date" (8 Oct 2026): a month, everything,
  // or any span of days picked on the calendar ('range').
  const [range, setRange] = useState<{ from: string; to: string }>(() => ({ from: monthStartIso(), to: isoDay(new Date()) }));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [rangeFrom, rangeTo] = orderedRange(range.from, range.to);
  const inView = (entry: EntryToSort) => (month === 'range' ? entry.date.slice(0, 10) >= rangeFrom && entry.date.slice(0, 10) <= rangeTo : inMonth(entry, month));
  const shown = useMemo(
    () => entries.filter((entry) => inView(entry) && (!searched || matchesSearch(entry, searched))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, month, searched, rangeFrom, rangeTo],
  );

  // Sorted entries leave the list as soon as they save; the list and the
  // account are fetched again behind it. Waiting for the whole account first
  // kept a sorted entry here, still Not sure yet, for a long while ("when I
  // make changes, they don't reflect immediately", 8 Oct 2026).
  const done = async (sortedIds: readonly number[] = []) => {
    if (sortedIds.length > 0) {
      queryClient.setQueryData<{ entries: EntryToSort[] }>(['entries-to-sort'], (cached) => withoutSorted(cached, sortedIds));
    }
    // The whole account and the ledgers built from it are only marked out of
    // date: fetched again after every entry, each one reloaded a year of entries
    // and restarted the suggestions. The screen in view fetches them when it is
    // shown (lib/refreshAfterSave); this list already dropped what was sorted.
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) {
      void queryClient.invalidateQueries({ queryKey, refetchType: isHistoryQuery(queryKey) ? 'none' : 'active' });
    }
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
  // (still marked, so it is listed again as soon as it has none) - or, listed to
  // check, the source it had, which lists it again too.
  const putBack = (one: EntryToSort) => updateTransaction({
    id: one.id,
    data: { amount: one.amount, date: one.date, ...(one.direction === 'out' ? { expenseCategory: NOT_SURE_CATEGORY } : { incomeSourceId: one.incomeSourceId ?? null, ...(one.madeById !== undefined ? { madeById: one.madeById } : {}) }) } as never,
  });
  // An optional note per entry, saved with whatever it is sorted as: "hope we also
  // have a brief description note" (7 Oct 2026). Only a note typed here is sent;
  // an entry's existing note is otherwise left as it is.
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteOpen, setNoteOpen] = useState<Set<number>>(() => new Set());
  const rowState = useMemo(() => ({ notes, noteOpen }), [notes, noteOpen]);
  const noteChange = (id: number) => (notes[id] === undefined ? {} : { notes: notes[id].trim() || null });
  const correctSource = useSourceCorrection();
  const sortEach = async (list: readonly EntryToSort[], change: { expenseCategory: string } | { incomeSourceId: number; madeById?: string }, label: string) => {
    setBusy(list[0]?.id ?? null);
    const changed: EntryToSort[] = [];
    try {
      for (const one of list) {
        await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, ...change, ...noteChange(one.id) } as never });
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
      await done(changed.map((one) => one.id));
      setBusy(null);
      // Put under a source that goes against what Jamvi had before: offered once (lib/sourceClash).
      if ('incomeSourceId' in change && changed.length > 0) void correctSource(changed[0], change.incomeSourceId, changed.map((one) => one.id));
    }
  };
  // A stream's owner is who the money came in under: in a Shared group the entry
  // may be the group's or another member's, and the server only takes a stream
  // that belongs to the depositor ("should also apply to shared budget too", 8 Oct 2026).
  const sourceChange = (source: { id: number; userId?: string | null }) => ({ incomeSourceId: source.id, ...(source.userId ? { madeById: source.userId } : {}) });
  // The same payer, many times over: offered all at once, never done without asking.
  const sort = (entry: EntryToSort, change: { expenseCategory: string } | { incomeSourceId: number; madeById?: string }, label: string) => {
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

  // "Judy is family" (10 Oct 2026): one tap files the entry under the family
  // category and keeps the person as family (lib/family), on the server
  // (lib/rulesStore), so their next M-Pesa is filed by itself. The family
  // category is the budget's own, else "Family support", made as Teach Jamvi makes it.
  const { mutateAsync: createCategory } = useCreateBudgetCategory();
  const familyCategory = useMemo(
    () => familyCategories(categoryList as unknown as Array<{ id: number; name: string; parentId?: number | null }>)[0] ?? FAMILY_CATEGORY,
    [categoryList],
  );
  const asFamily = async (entry: EntryToSort) => {
    setBusy(entry.id);
    try {
      if (!categoryList.some((row) => row.name === familyCategory)) {
        await createCategory({ data: { name: familyCategory, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } as never });
        await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      }
      const next = withFamily(rules, entry.description, familyCategory);
      if (next !== rules) {
        await saveRules(group?.id, next, rules);
        setRules(next);
      }
    } catch (error) {
      Alert.alert('Could not keep them as family', plainSaveError(error));
      return;
    } finally {
      setBusy(null);
    }
    sort(entry, { expenseCategory: familyCategory }, familyCategory);
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
                await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, expenseCategory: suggestions.get(one.id), ...noteChange(one.id) } as never });
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
              await done(changed.map((one) => one.id));
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
      if (notes[entry.id] !== undefined) await updateTransaction({ id: entry.id, data: { amount: entry.amount, date: entry.date, ...noteChange(entry.id) } as never });
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
      await done([entry.id]);
    } catch (error) {
      Alert.alert('Could not change it', plainSaveError(error));
    } finally {
      setBusy(null);
    }
  };

  // Money in saved earlier with a source Jamvi may have guessed, listed to check:
  // "Keep" leaves it as it is and takes it off the list ("ensure to sort what is
  // done historically", 8 Oct 2026). Changing the source takes it off by itself.
  const sourceName = (id: number | null | undefined) => incomeSources.find((source) => source.id === id)?.name ?? 'its source';
  const markChecked = (ids: number[], again = false) => customFetch('/api/entries-to-sort/checked', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionIds: ids, ...(again ? { again: true } : {}) }),
  });
  const keepEach = async (list: readonly EntryToSort[]) => {
    setBusy(list[0]?.id ?? null);
    try {
      for (const one of list) if (notes[one.id] !== undefined) await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, ...noteChange(one.id) } as never });
      await markChecked(list.map((one) => one.id));
      const ids = list.map((one) => one.id);
      setLastChange({
        text: `${list.length === 1 ? list[0].description : `${list.length} entries`} kept under ${sourceName(list[0].incomeSourceId)}`,
        undo: async () => { await markChecked(ids, true); },
      });
    } catch (error) {
      Alert.alert('Could not change it', plainSaveError(error));
    } finally {
      await done(list.map((one) => one.id));
      setBusy(null);
    }
  };
  const keep = (entry: EntryToSort) => {
    const others = sameParty(entries, entry).filter((other) => isToCheck(other) && other.incomeSourceId === entry.incomeSourceId);
    if (others.length === 0) {
      void keepEach([entry]);
      return;
    }
    Alert.alert(
      `${others.length + 1} entries from ${entry.description}`,
      `Keep all ${others.length + 1} under ${sourceName(entry.incomeSourceId)}, or just this one?`,
      [
        { text: 'Just this one', onPress: () => void keepEach([entry]) },
        { text: `All ${others.length + 1}`, onPress: () => void keepEach([entry, ...others]) },
      ],
    );
  };

  // "Debt" on an entry: lent, borrowed or paid back, and who with (components/SortAsDebt).
  const [debtFor, setDebtFor] = useState<EntryToSort | null>(null);
  // "Passed through my M-Pesa": this entry and its other half, together (components/PassThroughPair).
  const [pairFor, setPairFor] = useState<EntryToSort | null>(null);

  const chip = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted } as const;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="sort-entries-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Sort them out</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Entries you saved as Not sure, and money in to check</Text>
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
          // Rows read these as well as their entry: redrawn when any changes.
          extraData={rowState}
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
            {entries.length > 0 && years.length > 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} testID="sort-entries-year">
                <Pressable disabled={year <= years[0]} onPress={() => { setYear((current) => current - 1); setMonth(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous year">
                  <Feather name="chevron-left" size={20} color={year <= years[0] ? colors.border : colors.primary} />
                </Pressable>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{year}</Text>
                <Pressable disabled={year >= years[years.length - 1]} onPress={() => { setYear((current) => current + 1); setMonth(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next year">
                  <Feather name="chevron-right" size={20} color={year >= years[years.length - 1] ? colors.border : colors.primary} />
                </Pressable>
              </View>
            ) : null}
            {entries.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} testID="sort-entries-months">
              {[{ key: null as string | null, label: 'All time', count: entries.length }, ...months, { key: 'range', label: 'Pick dates', count: month === 'range' ? shown.length : -1 }].map((option) => {
                const on = month === option.key;
                return (
                  <Pressable key={option.key ?? 'all'} onPress={() => setMonth(option.key)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`sort-entries-month-${option.key ?? 'all'}`}
                    style={{ ...chip, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted, opacity: option.count === 0 && !on ? 0.45 : 1 }}>
                    <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.label}{option.count >= 0 ? ` (${option.count})` : ''}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            ) : null}
            {month === 'range' ? (
              <View style={{ flexDirection: 'row', gap: 8 }} testID="sort-entries-dates">
                {(['from', 'to'] as const).map((which) => (
                  <Pressable key={which} onPress={() => setPicker(which)} accessibilityRole="button" accessibilityLabel={`${which === 'from' ? 'Start' : 'End'} date`} testID={`sort-entries-date-${which}`}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.card }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{which === 'from' ? 'From' : 'To'}</Text>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{longDay(which === 'from' ? range.from : range.to)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {picker ? (
              <DateTimePicker
                value={new Date((picker === 'from' ? range.from : range.to) + 'T00:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                maximumDate={new Date()}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  const which = picker;
                  setPicker(Platform.OS === 'ios' ? which : null);
                  if (selected && which) setRange((current) => ({ ...current, [which]: isoDay(selected) }));
                }}
              />
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
                <Text style={{ color: entry.direction === 'out' && !isRefund(entry.amount) ? colors.destructive : colors.success, fontFamily: 'Inter_700Bold' }}>
                  {isRefund(entry.amount) ? `Refund +${kes(Math.abs(Number(entry.amount)))}` : `${entry.direction === 'out' ? '−' : '+'}${kes(entry.amount)}`}
                </Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{entry.direction === 'out' ? 'What was it for?' : isToCheck(entry) ? `Saved under ${sourceName(entry.incomeSourceId)}. Is that right?` : 'Where did it come from?'}</Text>
              {/* Always in view, not at the start of the sideways row where they scrolled
                  out of sight: "there is no place to create child and parent category and
                  lent/borrowed" (7 Oct 2026). */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {entry.direction === 'out' ? (
                  <Pressable disabled={busy !== null} onPress={() => void asFamily(entry)} accessibilityRole="button" accessibilityLabel={`${entry.description} is family`} testID={`sort-entry-${entry.id}-family`}
                    style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                    <Feather name="heart" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Family</Text>
                  </Pressable>
                ) : null}
                <Pressable disabled={busy !== null} onPress={() => setDebtFor(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-debt`}
                  style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                  <Feather name="users" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{entry.direction === 'out' ? 'Lent / paid a debt' : 'Borrowed / paid back'}</Text>
                </Pressable>
                <Pressable disabled={busy !== null} onPress={() => setPairFor(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-pass-through`}
                  style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                  <Feather name="repeat" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Passed through</Text>
                </Pressable>
                <Pressable disabled={busy !== null} accessibilityRole="button" testID={`sort-entry-${entry.id}-my-business`}
                  onPress={() => Alert.alert(
                    'Money between you and your business?',
                    `Not income or spending. Jamvi will also mark other entries naming ${entry.description} the same way.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'It is my business',
                        onPress: () => {
                          setBusy(entry.id);
                          void ownerBusiness.markFromEntry(entry)
                            .then((name) => {
                              setLastChange({ text: `${name}: your business`, undo: () => ownerBusiness.unmark(entry.id) });
                              return done([entry.id]);
                            })
                            .catch((error) => Alert.alert('Could not mark it', plainSaveError(error)))
                            .finally(() => setBusy(null));
                        },
                      },
                    ],
                  )}
                  style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                  <Feather name="briefcase" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>My business</Text>
                </Pressable>
                {entry.direction === 'out' ? (
                  <Pressable disabled={busy !== null} onPress={() => setNewCategoryFor(entry)} accessibilityRole="button" testID={`sort-entry-${entry.id}-new-category-sheet`}
                    style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.primary, backgroundColor: `${colors.primary}14` }}>
                    <Feather name="plus" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>New category</Text>
                  </Pressable>
                ) : null}
                {noteOpen.has(entry.id) || entry.notes || notes[entry.id] !== undefined ? null : (
                  <Pressable disabled={busy !== null} onPress={() => setNoteOpen((open) => new Set(open).add(entry.id))} accessibilityRole="button" testID={`sort-entry-${entry.id}-note-add`}
                    style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="edit-3" size={13} color={colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Add a note</Text>
                  </Pressable>
                )}
              </View>
              {noteOpen.has(entry.id) || entry.notes || notes[entry.id] !== undefined ? (
                <TextInput
                  value={notes[entry.id] ?? entry.notes ?? ''}
                  onChangeText={(text) => setNotes((current) => ({ ...current, [entry.id]: text }))}
                  placeholder="A short note (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={1000}
                  accessibilityLabel={`Note for ${entry.description}`}
                  testID={`sort-entry-${entry.id}-note`}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.foreground, fontSize: 14 }}
                />
              ) : null}
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
                      ...(isToCheck(entry) ? [
                        <Pressable key="keep" disabled={busy !== null} onPress={() => keep(entry)} accessibilityRole="button" accessibilityLabel={`Keep ${sourceName(entry.incomeSourceId)}`} testID={`sort-entry-${entry.id}-keep`}
                          style={{ ...chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.success, backgroundColor: `${colors.success}22` }}>
                          <Feather name="check" size={13} color={colors.success} />
                          <Text style={{ color: colors.success, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Keep {sourceName(entry.incomeSourceId)}</Text>
                        </Pressable>,
                      ] : []),
                      ...incomeSources.filter((source) => source.id !== entry.incomeSourceId).map((source) => (
                        <Pressable key={source.id} disabled={busy !== null} onPress={() => sort(entry, sourceChange(source), source.name)} accessibilityRole="button" testID={`sort-entry-${entry.id}-source-${source.id}`} style={chip}>
                          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{source.name}</Text>
                        </Pressable>
                      )),
                      <AddIncomeSourceChip
                        key="add"
                        testID={`sort-entry-${entry.id}-add-source`}
                        onCreated={(created) => sort(entry, sourceChange(created), created.name)}
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
              {entry.direction === 'in' && !isToCheck(entry) ? (
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
      {pairFor ? (
        <PassThroughPair
          entry={pairFor}
          onClose={() => setPairFor(null)}
          onDone={(change) => {
            setPairFor(null);
            setLastChange({ text: change.text, undo: change.undo });
            void done(change.ids);
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
