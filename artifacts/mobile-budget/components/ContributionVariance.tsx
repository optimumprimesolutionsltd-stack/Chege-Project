import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
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

const RANGES = [3, 6, 12] as const;

function kes(value: number): string {
  return value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/**
 * Expected versus what actually came in over a chosen stretch of months, the
 * mobile twin of the web "Expected vs actual" card.
 *
 * Expected is the member's monthly amount times the number of months; given is
 * the plain sum of what was recorded. Variance is given minus expected, so a
 * prepayment nets out and a run of misses shows as one figure — the question is
 * "over the period, did they give what they were meant to", not month by month.
 */
export function ContributionVariance() {
  const colors = useColors();
  const [months, setMonths] = useState<number>(6);

  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
  });

  const monthCount = data?.months.length ?? 0;
  const rows = (data?.rows ?? []).map((row) => {
    const given = row.amounts.reduce((sum, amount) => sum + amount, 0);
    const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : null;
    return {
      name: row.name,
      expected,
      given,
      variance: expected != null ? given - expected : null,
    };
  });
  const totalExpected = rows.reduce((sum, row) => sum + (row.expected ?? 0), 0);
  const totalGiven = rows.reduce((sum, row) => sum + row.given, 0);
  const groupVariance = totalExpected > 0 ? totalGiven - totalExpected : null;

  const varianceText = (value: number | null) => {
    if (value == null) return { label: '—', color: colors.mutedForeground };
    if (value === 0) return { label: 'On plan', color: colors.mutedForeground };
    return {
      label: `${value > 0 ? '+' : '−'}KES ${kes(Math.abs(value))}`,
      color: value > 0 ? colors.success : colors.destructive,
    };
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <View style={styles.headingRow}>
            <Feather name="bar-chart-2" size={15} color={colors.primary} />
            <Text style={[styles.heading, { color: colors.foreground }]}>Expected vs actual</Text>
          </View>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            What each member was expected to give over the last {months} months, against what they gave.
          </Text>
        </View>
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
                <Text
                  style={[
                    styles.rangeLabel,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {range}m
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError || !data ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          These figures could not be loaded.
        </Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No contributors yet.</Text>
      ) : (
        <>
          {rows.map((row) => {
            const variance = varianceText(row.variance);
            return (
              <View key={row.name} style={[styles.memberRow, { borderColor: colors.border }]}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.variance, { color: variance.color }]}>{variance.label}</Text>
                </View>
                <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                  Expected {row.expected != null ? `KES ${kes(row.expected)}` : '—'}
                  {'   ·   '}
                  Given KES {kes(row.given)}
                </Text>
              </View>
            );
          })}

          <View style={[styles.groupRow, { borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.groupName, { color: colors.foreground }]}>Group</Text>
              <Text style={[styles.variance, { color: varianceText(groupVariance).color }]}>
                {varianceText(groupVariance).label}
              </Text>
            </View>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>
              Expected KES {kes(totalExpected)}
              {'   ·   '}
              Given KES {kes(totalGiven)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 17 },
  ranges: { flexDirection: 'row', gap: 4, alignSelf: 'flex-start' },
  rangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rangeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: { paddingVertical: 18, textAlign: 'center', fontSize: 13 },
  memberRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 3 },
  groupRow: { borderTopWidth: 2, paddingTop: 10, gap: 3, marginTop: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  groupName: { flexShrink: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  variance: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  detail: { fontSize: 11 },
});
