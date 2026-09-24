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
  getGetDashboardExpenseLedgerQueryKey,
  useGetDashboardExpenseLedger,
} from '@workspace/api-client-react';
import { isoDay, longDay, monthStartIso, orderedRange } from '@/lib/dayRange';
import { useColors } from '@/hooks/useColors';
import { getExpenseEditHref } from '@/lib/expenseEditLink';
import { groupByCategory, groupByItem } from '@/lib/groupExpenses';

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
 * Every expense in one list, newest first — a statement for the whole budget.
 *
 * Every other way into the expenses goes through something first: a category,
 * or a named thing. All of them answer "show me this one thing's entries".
 * None answers "show me everything that happened", which is the question you
 * have when you do not yet know which category to look in, or when you are
 * reconciling against an M-Pesa statement that knows nothing about your
 * categories.
 */
export default function ExpenseLedgerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [from, setFrom] = useState<string>(monthStartIso);
  const [to, setTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [search, setSearch] = useState('');
  // How the entries are laid out: as a statement by day, or filed by what
  // they were for. The filed views show a total per group, tap to open one.
  const [view, setView] = useState<'date' | 'category' | 'item'>('date');
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

  const { data, isLoading, isError, refetch } = useGetDashboardExpenseLedger(query, {
    // The span and the search both belong in the key, or changing either would
    // show the previous answer from cache under the new controls.
    query: { queryKey: getGetDashboardExpenseLedgerQueryKey(query) },
  });

  const entries = data?.entries ?? [];
  const categoryGroups = useMemo(() => groupByCategory(entries), [entries]);
  const itemGroups = useMemo(() => groupByItem(entries), [entries]);

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

  const renderEntry = (entry: (typeof entries)[number], index: number) => {
    // Only an expense can be opened; a standalone bank
    // disbursement is not one, and has no form to open.
    const href = entry.source === 'expense'
      ? getExpenseEditHref({ id: Number(entry.id.replace('expense-', '')), date: entry.date })
      : null;
    return (
      <Pressable
        key={entry.id}
        onPress={href ? () => router.push(href) : undefined}
        disabled={!href}
        accessibilityRole={href ? 'button' : 'text'}
        accessibilityLabel={`${entry.description}, ${formatKES(entry.amount)} shillings on ${longDay(entry.date)}`}
        testID={`expense-ledger-entry-${entry.id}`}
        style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
      >
        <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{shortDay(entry.date)}</Text>
        <View style={styles.rowText}>
          <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>
            {entry.description}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {entry.categories.join(' + ')} · {entry.payerName}
          </Text>
        </View>
        <Text style={[styles.rowAmount, { color: colors.foreground }]}>{formatKES(entry.amount)}</Text>
      </Pressable>
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
          testID="expense-ledger-back"
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>All expenses</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            Everything that happened, newest first
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
            placeholder="Find an expense"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
            testID="expense-ledger-search"
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
              testID={`expense-ledger-day-${which}`}
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
            {isLoading ? 'Loading…' : `KES ${formatKES(data?.total)}`}
          </Text>
          <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
            {isLoading
              ? ' '
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${longDay(rangeFrom)} – ${longDay(rangeTo)}`}
          </Text>
        </View>

        <View style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.muted }]} testID="expense-ledger-views">
          {([
            ['date', 'By date'],
            ['category', 'By category'],
            ['item', 'By item'],
          ] as const).map(([value, label]) => {
            const active = view === value;
            return (
              <Pressable
                key={value}
                onPress={() => setView(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`expense-ledger-view-${value}`}
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
            testID="expense-ledger-retry"
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
                : 'No expenses recorded between these dates.'}
            </Text>
          </View>
        ) : view !== 'date' ? (
          (view === 'category' ? categoryGroups : itemGroups).map((group) => {
            const isOpen = opened.has(group.key);
            return (
              <View key={group.key} style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => toggleGroup(group.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${group.label}, ${group.count} ${group.count === 1 ? 'entry' : 'entries'}, ${formatKES(group.total)} shillings`}
                  testID={`expense-ledger-group-${group.key}`}
                  style={styles.groupHeader}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>{group.label}</Text>
                    <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                      {group.count} {group.count === 1 ? 'entry' : 'entries'}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: colors.foreground }]}>{formatKES(group.total)}</Text>
                  <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </Pressable>
                {isOpen ? (
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14 }}>
                    {group.rows.map(renderEntry)}
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          days.map((day) => (
            <View key={day.date} style={styles.day}>
              <Text style={[styles.dayHeading, { color: colors.mutedForeground }]}>{longDay(day.date)}</Text>
              <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {day.rows.map(renderEntry)}
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
