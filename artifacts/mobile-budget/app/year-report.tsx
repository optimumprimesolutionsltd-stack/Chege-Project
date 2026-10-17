import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { monthLedgerHref } from '@/lib/monthLink';
import { cellText, yearGrid, yearMonths, type BreakdownRow, type GridMonth, type GridRow, type IncomeMonth } from '@/lib/yearGrid';

type YearAnswer = { year: number; months: Array<{ year: number; month: number; breakdown: BreakdownRow[]; income: IncomeMonth }> };

const NAME_WIDTH = 120;
const ROW_HEIGHT = 40;
/** Months shown at once, beside the names and the Year column. */
const PAGE = 4;

/**
 * The year at a glance: every income stream and every spending category, a
 * column a month (lib/yearGrid) - "all incomes and expenses in one page to
 * compare which months did what" (9 Oct 2026), the whole year by default.
 *
 * Each month comes from the same reports Reports shows for it, under the same
 * query keys, so a month already opened there is not fetched again. Four
 * months a page, the Year column always beside them; a cell opens that month's entries.
 */
export default function YearReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [year, setYear] = useState(today.year);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const months = useMemo(() => yearMonths(year, today), [year, today.year, today.month]); // eslint-disable-line react-hooks/exhaustive-deps

  // The whole year in one request (api-server /dashboard/year): every month from
  // the same figures Reports shows for it - it made 24 requests (9 Oct 2026).
  const yearQuery = useQuery<YearAnswer>({
    queryKey: ['/api/dashboard/year', year],
    queryFn: () => customFetch<YearAnswer>(`/api/dashboard/year?year=${year}`),
    staleTime: 60_000,
  });
  const loading = yearQuery.isLoading;
  const failed = yearQuery.isError;
  const grid = useMemo(() => {
    const byMonth = new Map((yearQuery.data?.months ?? []).map((one) => [one.month, one]));
    return yearGrid(
      months,
      months.map(({ month }) => byMonth.get(month)?.breakdown),
      months.map(({ month }) => byMonth.get(month)?.income),
    );
  }, [months, yearQuery.data]);

  // Four months a page; null until chosen, which shows the page with the latest month.
  const [page, setPage] = useState<number | null>(null);
  const pages = Math.max(1, Math.ceil(grid.months.length / PAGE));
  const shownPage = Math.min(pages - 1, page ?? pages - 1);
  const shownMonths = grid.months
    .map((month, index) => ({ month, index }))
    .slice(shownPage * PAGE, shownPage * PAGE + PAGE);

  const toggle = (name: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const retry = () => void yearQuery.refetch();

  type Line = { key: string; name: string; amounts: number[]; total: number; peak: number; kind: 'row' | 'child' | 'heading' | 'total' | 'section'; side: 'in' | 'out' | 'net'; open?: boolean };
  const lines: Line[] = [];
  const section = (key: string, name: string) => lines.push({ key, name, amounts: [], total: 0, peak: -1, kind: 'section', side: 'net' });
  const rows = (prefix: string, list: readonly GridRow[], side: 'in' | 'out') => {
    for (const row of list) {
      const heading = row.children.length > 0;
      const open = opened.has(`${prefix}:${row.name}`);
      lines.push({ key: `${prefix}:${row.name}`, name: row.name, amounts: row.amounts, total: row.total, peak: heading ? -1 : row.peak, kind: heading ? 'heading' : 'row', side, open });
      if (heading && open) {
        for (const child of row.children) lines.push({ key: `${prefix}:${row.name}:${child.name}`, name: child.name, amounts: child.amounts, total: child.total, peak: child.peak, kind: 'child', side });
      }
    }
  };
  const totalOf = (amounts: number[]) => amounts.reduce((sum, amount) => sum + amount, 0);
  section('s-in', 'Money in');
  rows('in', grid.income, 'in');
  lines.push({ key: 't-in', name: 'Total in', amounts: grid.moneyIn, total: totalOf(grid.moneyIn), peak: -1, kind: 'total', side: 'in' });
  section('s-out', 'Money out');
  rows('out', grid.spending, 'out');
  lines.push({ key: 't-out', name: 'Total out', amounts: grid.moneyOut, total: totalOf(grid.moneyOut), peak: -1, kind: 'total', side: 'out' });
  lines.push({ key: 't-net', name: 'Left over', amounts: grid.leftOver, total: totalOf(grid.leftOver), peak: -1, kind: 'total', side: 'net' });
  if (grid.businessCosts.length > 0) {
    section('s-biz', "Your businesses' costs (not in money out)");
    rows('biz', grid.businessCosts, 'out');
  }

  const openMonth = (line: Line, month: GridMonth) => {
    if (line.kind === 'section') return;
    router.push(monthLedgerHref(line.side === 'in' ? '/income-ledger' : '/expense-ledger', month.year, month.month) as never);
  };
  const amountColor = (line: Line, amount: number) =>
    line.side === 'net' ? (amount < 0 ? colors.destructive : colors.success) : line.kind === 'total' ? colors.foreground : colors.foreground;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="year-report-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Year at a glance</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>Every income and expense, month by month</Text>
        </View>
      </View>

      <View style={styles.yearRow}>
        <Pressable onPress={() => { setYear((y) => y - 1); setPage(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous year" testID="year-report-prev">
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.year, { color: colors.foreground }]} testID="year-report-year">{year}</Text>
        <Pressable onPress={() => { setYear((y) => Math.min(today.year, y + 1)); setPage(null); }} disabled={year >= today.year} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next year" testID="year-report-next">
          <Feather name="chevron-right" size={22} color={year >= today.year ? colors.border : colors.foreground} />
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        The busiest month in each row is marked. Tap a heading to see what is under it, or a month to see its entries.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <>
        {failed ? (
          <Pressable onPress={retry} accessibilityRole="button" style={styles.failed} testID="year-report-retry">
            <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>The year did not load. Tap to try again.</Text>
          </Pressable>
        ) : null}
        {/* Four months a page, the Year column always there, and no sideways
            scroll: a frozen month row moved alongside scrolled figures drifted out
            of line, and the months showed twice ("the year at a glance is still not
            ok. we have two rows of months and are not aligned", 17 Oct 2026). Name,
            months and Year are one row each, so they cannot part. */}
        <View style={styles.pageRow} testID="year-report-pages">
          <Pressable onPress={() => setPage(Math.max(0, shownPage - 1))} disabled={shownPage === 0} hitSlop={10} accessibilityRole="button" accessibilityLabel="Earlier months" testID="year-report-page-prev">
            <Feather name="chevron-left" size={20} color={shownPage === 0 ? colors.border : colors.foreground} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: pages }, (_, index) => {
              const first = grid.months[index * PAGE];
              const last = grid.months[Math.min(grid.months.length, (index + 1) * PAGE) - 1];
              const on = index === shownPage;
              return (
                <Pressable
                  key={index}
                  onPress={() => setPage(index)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  testID={`year-report-page-${index}`}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : 'transparent' }}
                >
                  <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                    {first && last ? (first.month === last.month ? first.label : `${first.label}–${last.label}`) : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setPage(Math.min(pages - 1, shownPage + 1))} disabled={shownPage >= pages - 1} hitSlop={10} accessibilityRole="button" accessibilityLabel="Later months" testID="year-report-page-next">
            <Feather name="chevron-right" size={20} color={shownPage >= pages - 1 ? colors.border : colors.foreground} />
          </Pressable>
        </View>
        <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="year-report-grid">
          <View style={{ flexDirection: 'row', backgroundColor: colors.background }} testID="year-report-months">
            <View style={[styles.nameCell, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{year}</Text>
            </View>
            {shownMonths.map(({ month }) => (
              <View key={month.month} style={[styles.cell, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{month.label}</Text>
                {month.soFar ? <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>so far</Text> : null}
              </View>
            ))}
            <View style={[styles.cell, styles.yearCell, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Year</Text>
            </View>
          </View>
          {lines.map((line) => (
            <View key={line.key} style={{ flexDirection: 'row', backgroundColor: line.kind === 'section' ? colors.muted : line.kind === 'total' ? colors.card : 'transparent' }}>
              <Pressable
                onPress={line.kind === 'heading' ? () => toggle(line.key) : undefined}
                disabled={line.kind !== 'heading'}
                accessibilityRole={line.kind === 'heading' ? 'button' : undefined}
                accessibilityState={line.kind === 'heading' ? { expanded: line.open } : undefined}
                testID={`year-report-name-${line.key}`}
                style={[styles.nameCell, { borderColor: colors.border }]}
              >
                {line.kind === 'heading' ? <Feather name={line.open ? 'chevron-down' : 'chevron-right'} size={14} color={colors.mutedForeground} /> : null}
                <Text
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    paddingLeft: line.kind === 'child' ? 14 : 0,
                    color: line.kind === 'section' ? colors.mutedForeground : colors.foreground,
                    fontFamily: line.kind === 'row' || line.kind === 'child' ? 'Inter_400Regular' : 'Inter_700Bold',
                    fontSize: line.kind === 'section' ? 11 : 13,
                    textTransform: line.kind === 'section' ? 'uppercase' : 'none',
                  }}
                >
                  {line.name}
                </Text>
              </Pressable>
              {shownMonths.map(({ month, index }) => {
                const amount = line.amounts[index] ?? 0;
                const peak = line.peak === index;
                return (
                  <Pressable
                    key={month.month}
                    onPress={() => openMonth(line, month)}
                    disabled={line.kind === 'section' || amount === 0}
                    accessibilityRole="button"
                    accessibilityLabel={line.kind === 'section' ? undefined : `${line.name}, ${month.label} ${month.year}: KES ${amount.toLocaleString('en-KE')}${peak ? ', the most this year' : ''}`}
                    testID={line.kind === 'section' ? undefined : `year-report-cell-${line.key}-${month.month}`}
                    style={[styles.cell, { borderColor: colors.border, backgroundColor: peak ? `${colors.primary}1f` : 'transparent' }]}
                  >
                    {line.kind === 'section' ? null : (
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{ color: amount === 0 ? colors.mutedForeground : amountColor(line, amount), fontSize: 12, fontFamily: peak || line.kind === 'total' || line.kind === 'heading' ? 'Inter_700Bold' : 'Inter_400Regular', fontStyle: month.soFar ? 'italic' : 'normal' }}
                      >
                        {cellText(amount)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              <View style={[styles.cell, styles.yearCell, { borderColor: colors.border }]}>
                {line.kind === 'section' ? null : (
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: amountColor(line, line.total), fontSize: 12, fontFamily: 'Inter_700Bold' }}>
                    {cellText(line.total)}
                  </Text>
                )}
              </View>
            </View>
          ))}
          {grid.income.length === 0 && grid.spending.length === 0 ? (
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 20 }]}>Nothing recorded in {year} yet.</Text>
          ) : null}
        </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  year: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 16, paddingVertical: 8, lineHeight: 17 },
  failed: { paddingHorizontal: 16, paddingVertical: 8 },
  cell: { flex: 1, minWidth: 0, height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  yearCell: { flex: 1.2 },
  nameCell: { width: NAME_WIDTH, height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
});
