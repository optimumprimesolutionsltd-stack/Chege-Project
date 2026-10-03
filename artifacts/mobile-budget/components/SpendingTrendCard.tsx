import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getGetDashboardTrendsQueryKey, useGetDashboardTrends } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
const short = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(Math.round(value)));

/**
 * What was spent each month over the last six - the web's 6-Month Trend, which
 * the phone did not have. The highest month is marked; a month with nothing in
 * it keeps a sliver of bar so the axis still reads.
 */
export function SpendingTrendCard() {
  const colors = useColors();
  const { data = [], isLoading, isError, refetch } = useGetDashboardTrends(
    { months: 6 },
    { query: { queryKey: getGetDashboardTrendsQueryKey({ months: 6 }), retry: false } },
  );
  const max = Math.max(1, ...data.map((month) => month.totalSpent));
  return (
    <View style={{ gap: 8 }} testID="spending-trend-section">
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>Spending trend</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>What was spent each month, last 6 months</Text>
      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14 }}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : isError ? (
          <Pressable onPress={() => refetch()} accessibilityRole="button" testID="spending-trend-retry">
            <Text style={{ color: colors.mutedForeground }}>Couldn’t load the trend. Tap to try again.</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 8 }}>
            {data.map((month) => {
              const height = month.totalSpent > 0 ? Math.max(6, Math.round((month.totalSpent / max) * 80)) : 2;
              const peak = month.totalSpent > 0 && month.totalSpent === max;
              return (
                <View key={`${month.year}-${month.month}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}
                  accessibilityLabel={`${month.label}: ${kes(month.totalSpent)} shillings`} testID={`spending-trend-${month.year}-${month.month}`}>
                  {peak ? <Text style={{ color: colors.primary, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>{short(month.totalSpent)}</Text> : null}
                  <View style={{ width: '100%', height, borderRadius: 3, backgroundColor: peak ? colors.primary : colors.primary + '55' }} />
                  <Text style={{ color: peak ? colors.primary : colors.mutedForeground, fontSize: 10 }}>{month.label.split(' ')[0]}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
