import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import {
  getDashboardCategoryBreakdown,
  getDashboardIncomeStreams,
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardIncomeStreamsQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { monthLedgerHref } from '@/lib/monthLink';
import { cellText, yearGrid, yearMonths, type BreakdownRow, type GridMonth, type GridRow, type IncomeMonth } from '@/lib/yearGrid';

const NAME_WIDTH = 132;
const CELL_WIDTH = 78;
const ROW_HEIGHT = 40;

/**
 * The year at a glance: every income stream and every spending category, a
 * column a month (lib/yearGrid) - "all incomes and expenses in one page to
 * compare which months did what" (9 Oct 2026), the whole year by default.
 *
 * Each month comes from the same reports Reports shows for it, under the same
 * query keys, so a month already opened there is not fetched again. The names
 * stay put while the months scroll sideways; a cell opens that month's entries.
 */
export default function YearReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [year, setYear] = useState(today.year);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // The frozen month row follows the figures sideways (see the grid below).
  const monthRow = useRef<ScrollView>(null);
  const months = useMemo(() => yearMonths(year, today), [year, today.year, today.month]); // eslint-disable-line react-hooks/exhaustive-deps

  const breakdowns = useQueries({
    queries: months.map(({ year: y, month: m }) => ({
      queryKey: getGetDashboardCategoryBreakdownQueryKey({ month: m, year: y }),
      queryFn: () => getDashboardCategoryBreakdown({ month: m, year: y }),
      staleTime: 60_000,
    })),
  });
  const incomes = useQueries({
    queries: months.map(({ year: y, month: m }) => ({
      queryKey: getGetDashboardIncomeStreamsQueryKey({ month: m, year: y }),
      queryFn: () => getDashboardIncomeStreams({ month: m, year: y }),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const loading = [...breakdowns, ...incomes].some((query) => query.isLoading);
  const failed = [...breakdowns, ...incomes].some((query) => query.isError);
  const grid = useMemo(
    () => yearGrid(
      months,
      breakdowns.map((query) => query.data as unknown as BreakdownRow[] | undefined),
      incomes.map((query) => query.data as unknown as IncomeMonth | undefined),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, ...breakdowns.map((query) => query.data), ...incomes.map((query) => query.data)],
  );

  const toggle = (name: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const retry = () => [...breakdowns, ...incomes].forEach((query) => { if (query.isError) void query.refetch(); });

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
        <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous year" testID="year-report-prev">
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.year, { color: colors.foreground }]} testID="year-report-year">{year}</Text>
        <Pressable onPress={() => setYear((y) => Math.min(today.year, y + 1))} disabled={year >= today.year} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next year" testID="year-report-next">
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
            <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Some months did not load. Tap to try again.</Text>
          </Pressable>
        ) : null}
        {/* The month row is frozen at the top while the rows scroll down ("freeze the
            months so scrolling we know which month we are on", 9 Oct 2026), and moves
            sideways with the figures. */}
        <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="year-report-grid">
          <View style={{ flexDirection: 'row', backgroundColor: colors.background }} testID="year-report-months">
            <View style={[styles.cell, styles.headCell, { width: NAME_WIDTH, alignItems: 'flex-start', paddingLeft: 16, borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{year}</Text>
            </View>
            <ScrollView ref={monthRow} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row' }}>
                {grid.months.map((month) => (
                  <View key={month.month} style={[styles.cell, styles.headCell, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{month.label}</Text>
                    {month.soFar ? <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>so far</Text> : null}
                  </View>
                ))}
                <View style={[styles.cell, styles.headCell, { borderColor: colors.border, width: CELL_WIDTH + 12 }]}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Year</Text>
                </View>
              </View>
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {/* Names stay put while the months scroll. */}
            <View style={{ width: NAME_WIDTH }}>
              {lines.map((line) => (
                <Pressable
                  key={line.key}
                  onPress={line.kind === 'heading' ? () => toggle(line.key) : undefined}
                  disabled={line.kind !== 'heading'}
                  accessibilityRole={line.kind === 'heading' ? 'button' : undefined}
                  accessibilityState={line.kind === 'heading' ? { expanded: line.open } : undefined}
                  testID={`year-report-name-${line.key}`}
                  style={[styles.nameCell, { borderColor: colors.border, backgroundColor: line.kind === 'section' ? colors.muted : line.kind === 'total' ? colors.card : 'transparent' }]}
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
              ))}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              scrollEventThrottle={16}
              onScroll={(event) => monthRow.current?.scrollTo({ x: event.nativeEvent.contentOffset.x, animated: false })}
            >
              <View>
                {lines.map((line) => (
                  <View key={line.key} style={{ flexDirection: 'row', backgroundColor: line.kind === 'section' ? colors.muted : line.kind === 'total' ? colors.card : 'transparent' }}>
                    {grid.months.map((month, index) => {
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
                    <View style={[styles.cell, { borderColor: colors.border, width: CELL_WIDTH + 12 }]}>
                      {line.kind === 'section' ? null : (
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: amountColor(line, line.total), fontSize: 12, fontFamily: 'Inter_700Bold' }}>
                          {cellText(line.total)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
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
  cell: { width: CELL_WIDTH, height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headCell: { alignItems: 'flex-end' },
  nameCell: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
