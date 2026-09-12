import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { isSingleName } from '@/lib/contributorName';
import { useCollapsed } from '@/hooks/useCollapsed';
import {
  ContributorEditorFooter,
  EditableName,
  EditListButton,
  RemoveRowButton,
  useContributorEditor,
} from '@/components/ContributorEditor';

const RANGES = [1, 3, 6, 12] as const;

type GridMonth = { month: number; year: number; label: string };
type GridRow = {
  contributorId: number;
  name: string;
  monthlyTarget: number | null;
  amounts: number[];
  total: number;
  outstanding: Array<number | null>;
  creditRemaining: number;
};
type ContributionGrid = {
  months: GridMonth[];
  rows: GridRow[];
  columnTotals: number[];
  grandTotal: number;
};

function kes(value: number): string {
  return value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function kesShort(value: number): string {
  if (value === 0) return '—';
  if (value >= 1000) {
    const k = Math.round(value / 100) / 10;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(value);
}

/**
 * The read-only "who has paid" sheet for a shared group, matching the web
 * app: an arrears line for the current month, then a row per contributor with
 * the expected amount, this month's status, and a short recent-months strip.
 * A surplus carried forward from an earlier month reads as "Ahead", never as a
 * fresh miss.
 */
export function ContributionSheet({ canManage = false }: { canManage?: boolean }) {
  const colors = useColors();
  const editor = useContributorEditor();
  const { open, toggle } = useCollapsed('who-has-paid');
  const [months, setMonths] = useState<number>(6);
  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (isError || !data) return null;

  // An empty group used to return null here, which took the Edit pencil with
  // it - the only way to add the first people was gone exactly when it was
  // needed. The card stays, and forces itself open so the way in is reachable.
  const isEmpty = data.rows.length === 0;
  const showBody = open || isEmpty;

  const last = data.months.length - 1;
  const monthLabel = data.months[last]?.label ?? '';
  const periodLabel =
    data.months.length === 0
      ? ''
      : data.months.length === 1
        ? data.months[0].label
        : `${data.months[0].label} – ${data.months[last].label}`;
  const behind = data.rows
    .map((row) => ({ name: row.name, gave: row.amounts[last] ?? 0, owed: row.outstanding[last] ?? 0, expected: row.monthlyTarget ?? 0 }))
    .filter((row) => row.owed > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  const totalShort = behind.reduce((sum, row) => sum + row.owed, 0);
  // Rows stored before a full name was required. They are still perfectly good
  // money; they are just not attributable, so they are surfaced rather than
  // silently kept.
  const needsFullName = data.rows.filter((row) => isSingleName(row.name)).map((row) => row.name);
  const summary =
    behind.length > 0
      ? `${behind.length} ${behind.length === 1 ? 'member' : 'members'} behind for ${monthLabel} · KES ${kes(totalShort)} short`
      : `Everyone is up to date for ${monthLabel}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={styles.headRow} onPress={toggle}>
        <View style={styles.headingWrap}>
          <Text style={[styles.heading, { color: colors.foreground }]}>Who has paid</Text>
          {showBody ? <EditListButton editor={editor} canManage={canManage} /> : null}
        </View>
        <View style={styles.headRight}>
          {showBody && !isEmpty ? (
            <View style={styles.ranges}>
              {RANGES.map((range) => {
                const active = months === range;
                return (
                  <Pressable
                    key={range}
                    onPress={() => setMonths(range)}
                    style={[
                      styles.rangeBtn,
                      { borderColor: colors.border },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.rangeLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {range}m
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
        </View>
      </Pressable>

      {!showBody ? (
        <Text style={[styles.collapsedSummary, { color: behind.length > 0 ? colors.warning : colors.mutedForeground }]}>
          {summary}
        </Text>
      ) : null}

      {!showBody ? null : isEmpty ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.key, { color: colors.mutedForeground }]}>
            {canManage
              ? 'Nobody in the sheet yet. Add the people who contribute — they do not need the app, and each needs both names.'
              : 'Nobody in the sheet yet. A group manager can add the people who contribute.'}
          </Text>
          {canManage && !editor.editing ? (
            <Pressable
              testID="contributions-add-first-people"
              accessibilityRole="button"
              accessibilityLabel="Add the first people to the sheet"
              onPress={editor.open}
              style={[styles.emptyAction, { backgroundColor: colors.primary }]}
            >
              <Feather name="user-plus" size={16} color={colors.primaryForeground} />
              <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Add people</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
      <>
      {periodLabel ? (
        <Text style={[styles.period, { color: colors.foreground }]}>
          {periodLabel}
          {data.months.length > 1 ? ` · ${data.months.length} months` : ''}
        </Text>
      ) : null}
      <Text style={[styles.key, { color: colors.mutedForeground }]}>
        Each figure is what a member gave. Red = short of the expected amount. Green = a month an earlier over-payment covered.
      </Text>

      {needsFullName.length > 0 && canManage ? (
        <View style={[styles.arrears, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}44` }]}>
          <Feather name="user-x" size={16} color={colors.warning} style={{ marginTop: 1 }} />
          <Text style={[styles.arrearsText, { color: colors.foreground }]}>
            {needsFullName.length === 1
              ? `${needsFullName[0]} is recorded under one name. Tap the pencil and add a surname so the row cannot be confused with another member's.`
              : `${needsFullName.length} people are recorded under one name only. Tap the pencil and add surnames so their rows cannot be confused with each other.`}
          </Text>
        </View>
      ) : null}

      {behind.length > 0 ? (
        <View style={[styles.arrears, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}55` }]}>
          <Feather name="alert-triangle" size={16} color={colors.warning} style={{ marginTop: 1 }} />
          <Text style={[styles.arrearsText, { color: colors.foreground }]}>
            {behind.length} {behind.length === 1 ? 'member is' : 'members are'} behind for {monthLabel} — KES {kes(totalShort)} short in total
          </Text>
        </View>
      ) : null}

      {data.rows.map((row) => {
        const gave = row.amounts[last] ?? 0;
        const owed = row.outstanding[last] ?? 0;
        const coveredAhead = gave === 0 && (row.monthlyTarget ?? 0) > 0 && owed === 0;
        const netAhead =
          row.creditRemaining > 0 && row.outstanding.every((value) => (value ?? 0) === 0) ? row.creditRemaining : 0;

        return (
          <View key={row.contributorId} style={[styles.memberRow, { borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <View style={styles.nameWrap}>
                <RemoveRowButton editor={editor} id={row.contributorId} />
                <EditableName
                  editor={editor}
                  id={row.contributorId}
                  name={row.name}
                  textStyle={{ ...styles.name, color: colors.foreground }}
                />
              </View>
              <Text style={[styles.expected, { color: colors.mutedForeground }]}>
                {isSingleName(row.name) ? 'One name only · ' : ''}
                {row.monthlyTarget != null && row.monthlyTarget > 0 ? `Expected KES ${kes(row.monthlyTarget)}/mo` : 'No set amount'}
              </Text>
            </View>

            <View style={styles.rowBottom}>
              <Text style={[styles.thisMonth, { color: colors.foreground }]}>
                {monthLabel}: {coveredAhead ? 'Ahead' : gave > 0 ? `KES ${kes(gave)}` : '—'}
              </Text>
              {owed > 0 ? (
                <Text style={[styles.pill, { color: colors.destructive }]}>KES {kes(owed)} short</Text>
              ) : coveredAhead ? (
                <Text style={[styles.pill, { color: colors.success }]}>covered ahead</Text>
              ) : netAhead > 0 ? (
                <Text style={[styles.pill, { color: colors.success }]}>KES {kes(netAhead)} ahead</Text>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
              {data.months.map((entry, index) => {
                const amount = row.amounts[index] ?? 0;
                const monthOwed = row.outstanding[index] ?? 0;
                const monthAhead = amount === 0 && (row.monthlyTarget ?? 0) > 0 && monthOwed === 0;
                return (
                  <View key={`${entry.year}-${entry.month}`} style={styles.stripCell}>
                    <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>{entry.label.split(' ')[0]}</Text>
                    <Text
                      style={[
                        styles.stripValue,
                        { color: colors.foreground },
                        monthOwed > 0 ? { color: colors.destructive } : null,
                        monthAhead ? { color: colors.success } : null,
                      ]}
                    >
                      {monthAhead ? '✓' : kesShort(amount)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        );
      })}

      </>
      )}

      {/* Outside the rows branch: an empty group needs the add row most. */}
      {showBody ? <ContributorEditorFooter editor={editor} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 24, alignItems: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  heading: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  collapsedSummary: { fontSize: 12.5, fontFamily: 'Inter_500Medium', lineHeight: 17 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  period: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  ranges: { flexDirection: 'row', gap: 4 },
  rangeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  rangeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  key: { fontSize: 12, lineHeight: 17 },
  emptyWrap: { gap: 10, alignItems: 'flex-start' },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 9,
  },
  emptyActionText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  arrears: { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  arrearsText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  memberRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  expected: { fontSize: 11 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  thisMonth: { fontSize: 13 },
  pill: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  strip: { marginTop: 2 },
  stripCell: { alignItems: 'center', minWidth: 44, paddingHorizontal: 2 },
  stripLabel: { fontSize: 10 },
  stripValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 1 },
});
