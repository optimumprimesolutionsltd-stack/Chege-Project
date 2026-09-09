import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

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
 * The read-only "who has paid" sheet for a shared budget, matching the web
 * app: an arrears line for the current month, then a row per contributor with
 * the expected amount, this month's status, and a short recent-months strip.
 * A surplus carried forward from an earlier month reads as "Ahead", never as a
 * fresh miss.
 */
export function ContributionSheet() {
  const colors = useColors();
  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', 6],
    queryFn: () => customFetch('/api/contributions/grid?months=6'),
    retry: false,
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (isError || !data || data.rows.length === 0) return null;

  const last = data.months.length - 1;
  const monthLabel = data.months[last]?.label ?? '';
  const behind = data.rows
    .map((row) => ({ name: row.name, gave: row.amounts[last] ?? 0, owed: row.outstanding[last] ?? 0, expected: row.monthlyTarget ?? 0 }))
    .filter((row) => row.owed > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  const totalShort = behind.reduce((sum, row) => sum + row.owed, 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.foreground }]}>Who has paid</Text>
      <Text style={[styles.key, { color: colors.mutedForeground }]}>
        Each figure is what a member gave. Red = short of the expected amount. Green = a month an earlier over-payment covered.
      </Text>

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
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{row.name}</Text>
              <Text style={[styles.expected, { color: colors.mutedForeground }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 24, alignItems: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  heading: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  key: { fontSize: 12, lineHeight: 17 },
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
