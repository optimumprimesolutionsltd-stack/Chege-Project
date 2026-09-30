import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  getGetDashboardIncomeLedgerQueryKey,
  useGetDashboardIncomeLedger,
} from '@workspace/api-client-react';
import { isoDay, longDay, monthStartIso, orderedRange } from '@/lib/dayRange';
import { useColors } from '@/hooks/useColors';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/** "15 Sep" — short enough to sit in a fixed column beside the description. */
function shortDay(iso: string): string {
  const date = new Date(iso + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

/**
 * Every piece of income in one list, newest first — the other half of the
 * expense ledger.
 *
 * A list of expenses cannot be judged on its own: 60,000 of spending is too
 * much or fine depending on what came in. This is what came in, over the same
 * kind of date range, so the two can be read side by side.
 *
 * Only income is listed. Money that arrived without being earned — borrowed,
 * paid back to you, or moved in from savings — is totalled underneath instead,
 * because a bank or M-Pesa statement shows it and this is what gets checked
 * against one.
 */
export default function IncomeLedgerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [from, setFrom] = useState<string>(monthStartIso);
  const [to, setTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [search, setSearch] = useState('');
  // A statement by day, or filed by the stream it came from with a total each.
  const [view, setView] = useState<'date' | 'stream'>('date');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const [rangeFrom, rangeTo] = orderedRange(from, to);

  const query = useMemo(
    () => ({ from: rangeFrom, to: rangeTo, ...(search.trim() ? { q: search.trim() } : {}) }),
    [rangeFrom, rangeTo, search],
  );

  const { data, isLoading, isError, refetch } = useGetDashboardIncomeLedger(query, {
    // The span and the search both belong in the key, or changing either would
    // show the previous answer from cache under the new controls.
    query: { queryKey: getGetDashboardIncomeLedgerQueryKey(query) },
  });

  const entries = data?.entries ?? [];
  const other = data?.otherMoneyIn;
  const otherParts = [
    other?.borrowed ? `KES ${formatKES(other.borrowed)} borrowed` : null,
    other?.repaidToYou ? `KES ${formatKES(other.repaidToYou)} paid back to you` : null,
    other?.fromSavings ? `KES ${formatKES(other.fromSavings)} from savings` : null,
    other?.moneyBack ? `KES ${formatKES(other.moneyBack)} money back from reversed payments` : null,
  ].filter((part): part is string => part != null);

  // Days are already newest-first from the server; this only groups them so
  // each date is announced once rather than repeated down the column.
  const days = useMemo(() => {
    const grouped: { date: string; rows: typeof entries }[] = [];
    for (const entry of entries) {
      const last = grouped[grouped.length - 1];
      if (last && last.date === entry.date) last.rows.push(entry);
      else grouped.push({ date: entry.date, rows: [entry] });
    }
    return grouped;
  }, [entries]);

  // One card per stream, as the server worked it out: what it brought in, what
  // it cost to run (the categories linked to it on Reports) and what it
  // actually earned. A split deposit sits under each of its streams at that
  // stream's share, so the rows under a card add up to its "received".
  const streamGroups = useMemo(() => (data?.streams ?? []).map((stream) => {
    const rows = entries.flatMap((entry) => {
      const share = entry.portions
        .filter((portion) => portion.incomeSourceId === stream.incomeSourceId)
        .reduce((sum, portion) => sum + portion.amount, 0);
      return share > 0 || entry.portions.some((portion) => portion.incomeSourceId === stream.incomeSourceId)
        ? [{ entry, share }]
        : [];
    });
    return { ...stream, key: `s:${stream.incomeSourceId ?? 'none'}`, rows };
  }), [data?.streams, entries]);

  const renderEntry = (entry: (typeof entries)[number], index: number, share?: number) => (
    <View
      key={entry.id}
      accessible
      accessibilityLabel={`${entry.description}, ${formatKES(entry.amount)} shillings on ${longDay(entry.date)}, from ${entry.streams.join(' and ')}`}
      testID={`income-ledger-entry-${entry.id}`}
      style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
    >
      <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{shortDay(entry.date)}</Text>
      <View style={styles.rowText}>
        <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {[entry.streams.join(' + '), entry.receivedFrom, entry.accountName].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.rowAmount, { color: colors.foreground }]}>{formatKES(share ?? entry.amount)}</Text>
    </View>
  );

  const renderGroup = (group: (typeof streamGroups)[number]) => {
    const isOpen = opened.has(group.key);
    return (
      <View key={group.key} style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => toggleGroup(group.key)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={`${group.name}, ${group.net < 0 ? 'a loss of' : 'earned'} ${formatKES(Math.abs(group.net))} shillings${group.costs > 0 ? `: received ${formatKES(group.received)}, costs ${formatKES(group.costs)}` : ''}`}
          testID={`income-ledger-group-${group.key}`}
          style={styles.groupHeader}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>{group.name}</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={2} testID={`income-ledger-group-sum-${group.key}`}>
              {group.costs > 0
                ? `Received ${formatKES(group.received)} − costs ${formatKES(group.costs)}`
                : `${group.rows.length} ${group.rows.length === 1 ? 'entry' : 'entries'}`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.rowAmount, { color: group.net < 0 ? '#ef4444' : colors.foreground }]}>
              {group.net < 0 ? `−${formatKES(Math.abs(group.net))}` : formatKES(group.net)}
            </Text>
            {group.costs > 0 ? (
              <Text style={[styles.rowMeta, { color: group.net < 0 ? '#ef4444' : colors.mutedForeground }]}>
                {group.net < 0 ? 'loss' : 'profit'}
              </Text>
            ) : null}
          </View>
          <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </Pressable>
        {isOpen ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14 }}>
            {group.rows.length === 0 ? (
              <Text style={[styles.rowMeta, { color: colors.mutedForeground, paddingVertical: 11 }]}>
                Nothing came in from this stream between these dates.
              </Text>
            ) : group.rows.map(({ entry, share }, index) => renderEntry(entry, index, share))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="income-ledger-back"
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>All income</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            Everything that came in, newest first
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find income"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
            testID="income-ledger-search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear the search">
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.dateRow}>
          {(['from', 'to'] as const).map((which) => (
            <Pressable
              key={which}
              onPress={() => setPicker(which)}
              style={[styles.dateField, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${which === 'from' ? 'Start' : 'End'} date for this ledger`}
              testID={`income-ledger-day-${which}`}
            >
              <Text style={[styles.dateCaption, { color: colors.mutedForeground }]}>
                {which === 'from' ? 'From' : 'To'}
              </Text>
              <Text style={[styles.dateValue, { color: colors.foreground }]}>
                {longDay(which === 'from' ? from : to)}
              </Text>
            </Pressable>
          ))}
        </View>

        {picker ? (
          <DateTimePicker
            value={new Date((picker === 'from' ? from : to) + 'T00:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              const which = picker;
              setPicker(Platform.OS === 'ios' ? which : null);
              if (selected && which) {
                const iso = isoDay(selected);
                if (which === 'from') setFrom(iso);
                else setTo(iso);
              }
            }}
          />
        ) : null}

        <View style={[styles.totalCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.totalValue, { color: colors.foreground }]}>
            {isLoading ? 'Loading…' : `KES ${(data?.total ?? 0) < 0 ? '−' : ''}${formatKES(Math.abs(data?.total ?? 0))}`}
          </Text>
          <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
            {isLoading
              ? ' '
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${longDay(rangeFrom)} – ${longDay(rangeTo)}`}
          </Text>
          {!isLoading && (data?.costs ?? 0) > 0 ? (
            <Text
              style={[styles.totalCaption, { color: colors.mutedForeground, marginTop: 4, textAlign: 'center' }]}
              testID="income-ledger-net-of-costs"
            >
              Received KES {formatKES(data?.received ?? 0)} less KES {formatKES(data?.costs ?? 0)} your income streams cost to earn
            </Text>
          ) : null}
          {!isLoading && otherParts.length > 0 ? (
            <Text
              style={[styles.totalCaption, { color: colors.mutedForeground, marginTop: 4, textAlign: 'center' }]}
              testID="income-ledger-other-money-in"
            >
              Also came in, not counted as income: {otherParts.join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.muted }]} testID="income-ledger-views">
          {([
            ['date', 'By date'],
            ['stream', 'By income stream'],
          ] as const).map(([value, label]) => {
            const active = view === value;
            return (
              <Pressable
                key={value}
                onPress={() => setView(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`income-ledger-view-${value}`}
                style={[styles.segmentButton, active && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.segmentText, { color: active ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {isError ? (
          <Pressable
            onPress={() => refetch()}
            style={[styles.note, { borderColor: colors.border }]}
            accessibilityRole="button"
            testID="income-ledger-retry"
          >
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              Couldn’t load this. Tap to retry.
            </Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : entries.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              {search.trim()
                ? `Nothing matching “${search.trim()}” between these dates.`
                : 'No income recorded between these dates.'}
            </Text>
          </View>
        ) : view === 'stream' ? (
          streamGroups.map(renderGroup)
        ) : (
          days.map((day) => (
            <View key={day.date} style={styles.day}>
              <Text style={[styles.dayHeading, { color: colors.mutedForeground }]}>{longDay(day.date)}</Text>
              <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {day.rows.map((entry, index) => renderEntry(entry, index))}
              </View>
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
  // Without this the title is starved by the back chevron on a narrow phone.
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  body: { padding: 16, gap: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  dateCaption: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dateValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  totalCard: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  totalValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  totalCaption: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  note: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  day: { gap: 6 },
  dayHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  groupCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowDate: { fontSize: 11, fontFamily: 'Inter_400Regular', width: 48 },
  rowText: { flex: 1, minWidth: 0 },
  rowDesc: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  rowAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
