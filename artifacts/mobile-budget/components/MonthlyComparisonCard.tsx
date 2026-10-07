import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardIncomeStreamsTrendQueryKey,
  getGetDashboardTrendsQueryKey,
  useGetDashboardCategoryBreakdown,
  useGetDashboardIncomeStreamsTrend,
  useGetDashboardTrends,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { comparedPair, comparisonRows, monthlyHighlights, type Highlight } from '@/lib/monthlyComparison';

const MONTHS = 6;
const kes = (value: number) => Math.round(value).toLocaleString('en-KE');

/**
 * Month by month: money in against money out for the last six months, the
 * difference each month, and what changed (lib/monthlyComparison). The month in
 * progress is shown "so far" and left out of the comparisons.
 */
export function MonthlyComparisonCard() {
  const colors = useColors();
  const spendingParams = { months: MONTHS };
  const { data: spending, isLoading: spendingLoading, isError: spendingError } = useGetDashboardTrends(spendingParams, {
    query: { queryKey: getGetDashboardTrendsQueryKey(spendingParams), staleTime: 60_000 },
  });
  const { data: income, isLoading: incomeLoading } = useGetDashboardIncomeStreamsTrend(spendingParams, {
    query: { queryKey: getGetDashboardIncomeStreamsTrendQueryKey(spendingParams), staleTime: 60_000 },
  });

  const now = new Date();
  const rows = useMemo(
    () => comparisonRows(spending ?? [], income, { year: now.getFullYear(), month: now.getMonth() + 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spending, income],
  );
  const pair = comparedPair(rows);
  const latestParams = pair ? { year: pair.latest.year, month: pair.latest.month, scope: 'household' as const } : undefined;
  const previousParams = pair ? { year: pair.previous.year, month: pair.previous.month, scope: 'household' as const } : undefined;
  const { data: latestCategories } = useGetDashboardCategoryBreakdown(latestParams, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(latestParams), enabled: Boolean(latestParams), staleTime: 60_000 },
  });
  const { data: previousCategories } = useGetDashboardCategoryBreakdown(previousParams, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(previousParams), enabled: Boolean(previousParams), staleTime: 60_000 },
  });
  const highlights = useMemo(
    () => monthlyHighlights(rows, { latest: latestCategories, previous: previousCategories }, income),
    [rows, latestCategories, previousCategories, income],
  );

  const largest = Math.max(1, ...rows.map((row) => Math.max(row.income, row.spent)));
  const toneColor = (tone: Highlight['tone']) => (tone === 'good' ? colors.success : tone === 'bad' ? colors.destructive : colors.mutedForeground);
  const toneIcon = (tone: Highlight['tone']) => (tone === 'good' ? 'trending-up' : tone === 'bad' ? 'alert-circle' : 'info');

  return (
    <View style={{ gap: 8 }} testID="monthly-comparison">
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>Month by month</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Money in against money out, the last {MONTHS} months</Text>
      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, gap: 14 }}>
        {spendingLoading || incomeLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : spendingError ? (
          <Text style={{ color: colors.mutedForeground }}>Couldn’t load the months.</Text>
        ) : (
          <>
            {highlights.length > 0 ? (
              <View style={{ gap: 8 }} testID="monthly-comparison-highlights">
                {highlights.map((highlight) => (
                  <View key={highlight.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Feather name={toneIcon(highlight.tone)} size={15} color={toneColor(highlight.tone)} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 18 }}>{highlight.text}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Highlights appear once there are two complete months to compare.</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>In</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.destructive }} />
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Out</Text>
              </View>
            </View>
            {[...rows].reverse().map((row) => (
              <View key={`${row.year}-${row.month}`} style={{ gap: 4 }} testID={`monthly-comparison-${row.year}-${row.month}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    {row.label}{row.soFar ? ' (so far)' : ''}
                  </Text>
                  <Text style={{ color: row.net >= 0 ? colors.success : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                    {row.net >= 0 ? '+' : '−'}KES {kes(Math.abs(row.net))}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flex: 1, height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${(row.income / largest) * 100}%`, height: '100%', backgroundColor: colors.success }} />
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, width: 92, textAlign: 'right' }}>in {kes(row.income)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flex: 1, height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${(row.spent / largest) * 100}%`, height: '100%', backgroundColor: colors.destructive }} />
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, width: 92, textAlign: 'right' }}>out {kes(row.spent)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
