import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { linkedDay } from '@/lib/monthLink';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  getDashboardExpenseLedger,
  getGetDashboardExpenseLedgerQueryKey,
  getGetJointAccountQueryKey,
  getJointAccount,
  useGetBudgetCategories,
  useGetDashboardExpenseLedger,
} from '@workspace/api-client-react';
import { isoDay, longDay, monthStartIso, orderedRange, stepMonth } from '@/lib/dayRange';
import { useBusinesses } from '@/hooks/useBusinesses';
import { useColors } from '@/hooks/useColors';
import { isRefund, spentText } from '@/lib/refundLabel';
import { useProgressiveDays } from '@/lib/progressiveDays';
import { accountsOf, groupRowsShown } from '@/lib/openGroup';
import { ScrollerScrollView } from '@/components/PageScrollReset';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { getExpenseEditHref } from '@/lib/expenseEditLink';
import { isNotSure } from '@/lib/entriesToSort';
import { groupByCategory, groupByItem } from '@/lib/groupExpenses';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDashboardMonthlyReportPdf } from '@workspace/api-client-react';
import { writePdf } from '@/lib/savePdf';
import { askPdfDetail, type PdfDetail } from '@/lib/pdfDetail';
import { MonthStepper } from '@/components/MonthStepper';

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

  // A month tapped on a Reports trend opens here with its days (lib/monthLink).
  const linked = useLocalSearchParams<{ from?: string; to?: string }>();
  const [from, setFrom] = useState<string>(() => linkedDay(linked.from) ?? monthStartIso());
  const [to, setTo] = useState<string>(() => linkedDay(linked.to) ?? isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [search, setSearch] = useState('');
  // How the entries are laid out: as a statement by day, or filed by what
  // they were for. The filed views show a total per group, tap to open one.
  const [view, setView] = useState<'date' | 'category' | 'item'>('date');
  // The button lights up on the tap; the list, which can be hundreds of rows,
  // follows a moment later. Rebuilding it first made every tap feel hesitant.
  const shownView = useDeferredValue(view);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // "Show more" taps per open group: a group draws its rows a page at a time (lib/openGroup).
  const [groupMore, setGroupMore] = useState<Record<string, number>>({});
  const toggleGroup = (key: string, rows?: ReadonlyArray<{ source?: string; accountId?: number | null }>) => {
    // Opening: the accounts its entries sit in start loading now, so tapping
    // one to edit does not wait for a whole account (lib/openGroup).
    if (rows && !opened.has(key)) {
      for (const accountId of accountsOf(rows)) {
        void queryClient.prefetchQuery({
          queryKey: getGetJointAccountQueryKey({ accountId }),
          queryFn: () => getJointAccount({ accountId }),
          staleTime: 60_000,
        });
      }
    }
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [rangeFrom, rangeTo] = orderedRange(from, to);

  // Asked once typing pauses, not for every letter: each one was its own
  // request, and the answers raced each other back (7 Oct 2026).
  const [searched, setSearched] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearched(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({ from: rangeFrom, to: rangeTo, ...(searched ? { q: searched } : {}) }),
    [rangeFrom, rangeTo, searched],
  );

  // Changing month used to clear the screen to "Loading…" every time, months
  // already seen included, and a failure was retried three times before it was
  // said (7 Oct 2026). Now the month on screen stays, dimmed, until the next one
  // is in; a month is kept for a minute; and a failure is said after one retry.
  const { data, isLoading, isError, isPlaceholderData, refetch } = useGetDashboardExpenseLedger(query, {
    // The span and the search both belong in the key, or changing either would
    // show the previous answer from cache under the new controls.
    query: { queryKey: getGetDashboardExpenseLedgerQueryKey(query), placeholderData: keepPreviousData, staleTime: 60_000, retry: 1 },
  });

  // The months either side are fetched while this one is read, so the arrows
  // usually land on a month that is already here.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (searched) return;
    const today = isoDay(new Date());
    for (const delta of [-1, 1]) {
      const next = stepMonth(rangeFrom, delta, today);
      if (next.from === rangeFrom) continue;
      const params = { from: next.from, to: next.to };
      void queryClient.prefetchQuery({
        queryKey: getGetDashboardExpenseLedgerQueryKey(params),
        queryFn: () => getDashboardExpenseLedger(params),
        staleTime: 60_000,
      });
    }
  }, [rangeFrom, searched, queryClient]);

  const allEntries = data?.entries ?? [];
  // Household or Business costs: a side hustle's stock and running costs are
  // the business's, on a tab of their own rather than a section at the foot,
  // and left out of the household's PDF.
  const [scope, setScope] = useState<'household' | 'business'>('household');

  // A category linked to an income stream (see the Cost categories picker on
  // Reports) is the cost of earning that stream's sales, already worked out
  // of its profit there — it is not a personal expense, so it is split out
  // here rather than left to inflate this screen's "expenses" total too.
  const { data: budgetCategories = [] } = useGetBudgetCategories();
  const businesses = useBusinesses();
  const costCategoryNames = useMemo(
    () => new Set(
      budgetCategories
        .filter((category) => category.reducesIncomeSourceId != null && businesses.ids.has(category.reducesIncomeSourceId))
        .map((category) => category.name.trim().toLocaleLowerCase('en-KE')),
    ),
    [budgetCategories, businesses.ids],
  );
  // A business entry: every category it is filed under is a side hustle's cost.
  const isBusinessEntry = (entry: (typeof allEntries)[number]) =>
    entry.categories.length > 0 && entry.categories.every((name) => costCategoryNames.has(name.trim().toLocaleLowerCase('en-KE')));
  const hasBusiness = costCategoryNames.size > 0;
  const entries = useMemo(
    () => (hasBusiness ? allEntries.filter((entry) => (scope === 'business') === isBusinessEntry(entry)) : allEntries),
    [allEntries, scope, hasBusiness, costCategoryNames],
  );
  // "Find a category" from the scroller: By category, narrowed to the names typed.
  const [findingCategory, setFindingCategory] = useState(false);
  const [categoryFind, setCategoryFind] = useState('');
  const allCategoryGroups = useMemo(() => groupByCategory(entries), [entries]);
  const scopedCategoryGroups = useMemo(() => {
    const needle = categoryFind.trim().toLocaleLowerCase('en-KE');
    return needle ? allCategoryGroups.filter((group) => group.label.toLocaleLowerCase('en-KE').includes(needle)) : allCategoryGroups;
  }, [allCategoryGroups, categoryFind]);
  const businessTotal = useMemo(
    () => allEntries.filter(isBusinessEntry).reduce((sum, entry) => sum + entry.amount, 0),
    [allEntries, costCategoryNames],
  );
  const cogsTotal = scope === 'household' ? businessTotal : 0;
  const expensesTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);

  // The list as a PDF: this tab's expenses between these dates, and nothing
  // else - a household PDF never shows a side hustle's stock.
  const [exporting, setExporting] = useState(false);
  const downloadPdf = async (detail?: PdfDetail) => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getDashboardMonthlyReportPdf(
        {
          from: rangeFrom,
          to: rangeTo,
          includeSummary: false,
          includeBudget: false,
          includeIncome: false,
          includeExpenses: true,
          ...(hasBusiness ? { expensesScope: scope } : {}),
          // The way it is shown: by category or by item, each with its subtotal.
          ...(view !== 'date' ? { expensesGroupBy: view, expensesDetail: detail ?? 'detailed' } : {}),
        },
        { responseType: 'blob', cache: 'no-store' },
      );
      const file = await writePdf(Paths.cache, `jamvi-${scope === 'business' ? 'business-costs' : 'expenses'}-${rangeFrom}-to-${rangeTo}.pdf`, blob as Blob);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share expenses', UTI: 'com.adobe.pdf' });
    } catch (error: unknown) {
      Alert.alert('Could not make the PDF', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

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
    // An expense opens its form; an M-Pesa or bank entry opens on Bank, on its
    // own account, where the balance follows the change ("what happens if i see
    // a wrong entry here? can i tap it and it takes me to where i can edit it",
    // 8 Oct 2026).
    const accountId = (entry as { accountId?: number | null }).accountId;
    const href = entry.source === 'expense'
      ? getExpenseEditHref({ id: Number(entry.id.replace('expense-', '')), date: entry.date })
      : entry.source === 'bank_disbursement'
        ? `/(tabs)/bank?editTx=${entry.id.replace('bank-disbursement-', '')}${accountId ? `&accountId=${accountId}` : ''}&opened=${Date.now()}&returnTo=${encodeURIComponent(`/expense-ledger?from=${rangeFrom}&to=${rangeTo}`)}`
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
        <Text style={[styles.rowAmount, { color: isRefund(entry.amount) ? colors.success : colors.foreground }]}>{spentText(entry.amount)}</Text>
        {href ? <Feather name="edit-2" size={12} color={colors.mutedForeground} style={{ marginLeft: 6 }} /> : null}
      </Pressable>
    );
  };

  const renderGroup = (group: (typeof scopedCategoryGroups)[number]) => {
    const isOpen = opened.has(group.key);
    return (
      <View key={group.key} style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => toggleGroup(group.key, group.rows as ReadonlyArray<{ source?: string; accountId?: number | null }>)}
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
            {/* Everything under Not sure yet is sorted fastest in Sort them out,
                with suggestions and All N at once. */}
            {isNotSure(group.label) ? (
              <Pressable
                onPress={() => router.push('/sort-entries' as never)}
                accessibilityRole="button"
                testID="expense-ledger-sort-them-out"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f59e0b22' }}
              >
                <Feather name="help-circle" size={13} color="#d97706" />
                <Text style={{ color: '#d97706', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Sort them out</Text>
              </Pressable>
            ) : null}
            {group.rows.slice(0, groupRowsShown(group.rows.length, groupMore[group.key] ?? 0)).map(renderEntry)}
            {groupRowsShown(group.rows.length, groupMore[group.key] ?? 0) < group.rows.length ? (
              <Pressable
                onPress={() => setGroupMore((current) => ({ ...current, [group.key]: (current[group.key] ?? 0) + 1 }))}
                accessibilityRole="button"
                testID={`expense-ledger-group-${group.key}-more`}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                  Showing {groupRowsShown(group.rows.length, groupMore[group.key] ?? 0).toLocaleString('en-KE')} of {group.rows.length.toLocaleString('en-KE')} - show more
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  // Drawn a batch at a time: a year of entries all at once made the screen drag.
  const paged = useProgressiveDays(days);
  // The box sits under the view buttons, a short way down the page.
  const openCategoryFind = (scrollTo: (offset: number) => void) => {
    setView('category');
    setFindingCategory(true);
    scrollTo(0);
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
        <Pressable
          // Grouped, it asks whether each group's total is enough or every entry is wanted.
          onPress={() => (view === 'date' ? void downloadPdf() : askPdfDetail(view === 'category' ? 'category' : 'item', (detail) => void downloadPdf(detail)))}
          disabled={exporting || isLoading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={scope === 'business' ? 'Download business costs as PDF' : 'Download expenses as PDF'}
          testID="expense-ledger-pdf"
          style={[styles.pdfButton, { borderColor: colors.border, opacity: exporting ? 0.6 : 1 }]}
        >
          {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={15} color={colors.primary} />}
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>PDF</Text>
        </Pressable>
      </View>

      <ScrollerScrollView scroller={{ top: 8, bottom: insets.bottom + 16, findCategory: openCategoryFind, beforeEnd: paged.showAll }}
        onScroll={paged.onScroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {hasBusiness ? (
          <View style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.muted }]} testID="expense-ledger-scope">
            {([
              ['household', 'Household'],
              ['business', 'Business costs'],
            ] as const).map(([value, label]) => {
              const active = scope === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => { setScope(value); setOpened(new Set()); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  testID={`expense-ledger-scope-${value}`}
                  style={[styles.segmentButton, active && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.segmentText, { color: active ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
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

        <MonthStepper from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} testID="expense-ledger-month" />
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

        <View style={[styles.totalCard, { backgroundColor: colors.muted, borderColor: colors.border, opacity: isPlaceholderData ? 0.5 : 1 }]}>
          <Text style={[styles.totalValue, { color: colors.foreground }]}>
            {isLoading ? 'Loading…' : `KES ${formatKES(expensesTotal)}`}
          </Text>
          <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
            {isLoading
              ? ' '
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${longDay(rangeFrom)} – ${longDay(rangeTo)}`}
          </Text>
          {!isLoading && cogsTotal > 0 ? (
            <Text style={[styles.totalCaption, { color: colors.mutedForeground, marginTop: 4 }]}>
              + KES {formatKES(cogsTotal)} of income-stream costs, on the Business costs tab
            </Text>
          ) : null}
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
                style={({ pressed }) => [styles.segmentButton, active && { backgroundColor: colors.primary }, pressed && !active && { backgroundColor: colors.border }]}
              >
                <Text style={[styles.segmentText, { color: active ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {shownView !== view ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} testID="expense-ledger-view-switching" /> : null}
        {isPlaceholderData ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} testID="expense-ledger-updating" /> : null}

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
        ) : shownView === 'category' ? (
          <>
            {findingCategory || categoryFind ? (
              <CategorySearchBox value={categoryFind} onChange={setCategoryFind} autoFocus={findingCategory} testID="expense-ledger-category-find" />
            ) : null}
            {scopedCategoryGroups.length === 0 ? (
              <Text style={[styles.noteText, { color: colors.mutedForeground, marginTop: 12 }]}>No category matching “{categoryFind.trim()}”.</Text>
            ) : null}
            {scopedCategoryGroups.map(renderGroup)}
          </>
        ) : shownView === 'item' ? (
          itemGroups.map(renderGroup)
        ) : (
          <>
            {paged.shown.map((day) => (
              <View key={day.date} style={styles.day}>
                <Text style={[styles.dayHeading, { color: colors.mutedForeground }]}>{longDay(day.date)}</Text>
                <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {day.rows.map(renderEntry)}
                </View>
              </View>
            ))}
            {paged.more ? (
              <Pressable onPress={paged.showMore} accessibilityRole="button" testID="ledger-show-more" style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                  Showing {paged.shownRows.toLocaleString('en-KE')} of {paged.total.toLocaleString('en-KE')} - show more
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollerScrollView>
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
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dateCaption: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dateValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  totalCard: { borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  totalValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  totalCaption: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  note: { borderWidth: 1, borderRadius: 8, padding: 16, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  day: { gap: 6 },
  dayHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayCard: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, padding: 3, gap: 3 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sectionHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  groupCard: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowDate: { fontSize: 11, fontFamily: 'Inter_400Regular', width: 48 },
  rowText: { flex: 1, minWidth: 0 },
  rowDesc: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  rowAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
