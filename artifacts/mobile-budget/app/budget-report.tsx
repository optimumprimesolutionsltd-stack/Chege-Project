import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getGetDashboardCategoryBreakdownQueryKey,
  useGetDashboardCategoryBreakdown,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { budgetReport, overBy, type BudgetRow } from '@/lib/budgetReport';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const OVER = '#ef4444';
const UNDER = '#16a34a';

function formatKES(n: number): string {
  return Math.round(n).toLocaleString('en-KE');
}

type Row = BudgetRow;

/**
 * What was planned against what was spent, for one month.
 *
 * Reports showed what came in and what went out, but nothing said whether the
 * month kept to its budget. This does, a category at a time, overspends first.
 *
 * By month rather than between two dates, because budgets are monthly: a
 * budget for "12th to 20th" would have to be guessed at, and a guessed budget
 * is worse than none. Figures come from the category breakdown the Budget tab
 * uses, where a heading already includes its sub-categories, so the totals
 * add up the top-level rows and nothing is counted twice.
 */
export default function BudgetReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const params = { month, year };
  const { data, isLoading, isError, refetch } = useGetDashboardCategoryBreakdown(params, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(params) },
  });
  const rows = (data ?? []) as unknown as Row[];

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  const { topLevel, childrenOf, unbudgeted, over, totals, businessCosts } = useMemo(() => budgetReport(rows), [rows]);

  const left = totals.left;
  const toggle = (name: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const bar = (spent: number, budget: number) => {
    const fraction = budget > 0 ? Math.min(1, spent / budget) : 0;
    const isOver = budget > 0 && spent > budget;
    return (
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', backgroundColor: isOver ? OVER : colors.primary }} />
      </View>
    );
  };

  const status = (row: Row) => {
    if (row.budgetAmount <= 0) {
      return <Text style={[styles.status, { color: colors.mutedForeground }]}>tracked</Text>;
    }
    const by = overBy(row);
    return by > 0
      ? <Text style={[styles.status, { color: OVER }]}>{formatKES(by)} over</Text>
      : <Text style={[styles.status, { color: UNDER }]}>{formatKES(row.budgetAmount - row.spentAmount)} left</Text>;
  };

  const renderRow = (row: Row, nested = false) => {
    const children = childrenOf.get(row.category) ?? [];
    const isOpen = opened.has(row.category);
    return (
      <View key={`${row.parentName ?? ''}/${row.category}`} style={[styles.row, nested && styles.nested]} testID={`budget-report-row-${row.category}`}>
        <Pressable
          onPress={children.length > 0 ? () => toggle(row.category) : undefined}
          disabled={children.length === 0}
          accessibilityRole={children.length > 0 ? 'button' : 'text'}
          accessibilityState={children.length > 0 ? { expanded: isOpen } : undefined}
          accessibilityLabel={`${row.category}: spent ${formatKES(row.spentAmount)} of ${formatKES(row.budgetAmount)} shillings${overBy(row) > 0 ? `, ${formatKES(overBy(row))} over` : ''}`}
          style={styles.rowHead}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{row.category}</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              KES {formatKES(row.spentAmount)}{row.budgetAmount > 0 ? ` of ${formatKES(row.budgetAmount)}` : ''}
            </Text>
          </View>
          {status(row)}
          {children.length > 0 ? (
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          ) : null}
        </Pressable>
        {row.budgetAmount > 0 ? bar(row.spentAmount, row.budgetAmount) : null}
        {isOpen ? children.map((child) => renderRow(child, true)) : null}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="budget-report-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Budget report</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>What you planned against what you spent</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" testID="budget-report-prev">
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.month, { color: colors.foreground }]} testID="budget-report-month">{MONTHS[month - 1]} {year}</Text>
          <Pressable
            onPress={() => step(1)}
            disabled={isCurrentMonth}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            testID="budget-report-next"
          >
            <Feather name="chevron-right" size={22} color={isCurrentMonth ? colors.muted : colors.foreground} />
          </Pressable>
        </View>

        {isError ? (
          <Pressable onPress={() => refetch()} style={[styles.note, { borderColor: colors.border }]} accessibilityRole="button" testID="budget-report-retry">
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Couldn’t load this. Tap to retry.</Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>No budget or spending for {MONTHS[month - 1]} {year}.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.summary, { backgroundColor: colors.muted, borderColor: colors.border }]} testID="budget-report-summary">
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                KES {formatKES(totals.spent)} <Text style={[styles.summaryOf, { color: colors.mutedForeground }]}>of {formatKES(totals.budget)}</Text>
              </Text>
              {totals.budget > 0 ? bar(totals.spent, totals.budget) : null}
              <Text style={[styles.summaryLine, { color: left < 0 ? OVER : UNDER }]}>
                {left < 0 ? `KES ${formatKES(-left)} over budget` : `KES ${formatKES(left)} left`}
              </Text>
              <Text style={[styles.summaryLine, { color: colors.mutedForeground }]}>
                {over.length === 0 ? 'No category is over budget.' : `${over.length} ${over.length === 1 ? 'category is' : 'categories are'} over budget.`}
                {totals.spentUnbudgeted > 0 ? ` KES ${formatKES(totals.spentUnbudgeted)} was spent with no budget behind it.` : ''}
              </Text>
            </View>

            {over.length > 0 ? (
              <>
                <Text style={[styles.section, { color: OVER }]}>Over budget</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: OVER }]} testID="budget-report-over">
                  {over.map((row) => (
                    <View key={`over/${row.parentName ?? ''}/${row.category}`} style={styles.overRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{row.category}</Text>
                        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {row.parentName ? `${row.parentName} · ` : ''}KES {formatKES(row.spentAmount)} of {formatKES(row.budgetAmount)}
                        </Text>
                      </View>
                      <Text style={[styles.status, { color: OVER }]}>{formatKES(overBy(row))} over</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.section, { color: colors.mutedForeground }]}>Every category</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {topLevel.map((row) => renderRow(row))}
            </View>

            {businessCosts.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.mutedForeground }]}>Income-stream costs, not counted above</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="budget-report-business-costs">
                  {businessCosts.map((row) => (
                    <View key={`biz/${row.category}`} style={styles.overRow}>
                      <Text style={[styles.rowName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{row.category}</Text>
                      <Text style={[styles.status, { color: colors.foreground }]}>KES {formatKES(row.spentAmount)}</Text>
                    </View>
                  ))}
                  <Text style={[styles.rowMeta, { color: colors.mutedForeground, paddingBottom: 8 }]}>
                    These come off their income stream's profit in Business, so they are not household spending.
                  </Text>
                </View>
              </>
            ) : null}

            {unbudgeted.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.mutedForeground }]}>Spent without a budget</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="budget-report-unbudgeted">
                  {unbudgeted.map((row) => (
                    <View key={`none/${row.category}`} style={styles.overRow}>
                      <Text style={[styles.rowName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{row.category}</Text>
                      <Text style={[styles.status, { color: colors.foreground }]}>KES {formatKES(row.spentAmount)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
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
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  summary: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 8 },
  summaryValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  summaryOf: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  summaryLine: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  section: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 4 },
  row: { paddingVertical: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  nested: { paddingLeft: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  status: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  note: { borderWidth: 1, borderRadius: 8, padding: 16, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
