import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type HistoryMonth = { year: number; month: number; label: string };
type ContributionHistoryResponse = {
  months: HistoryMonth[];
  members: { userId: string; name: string; amounts: number[]; total: number }[];
  contributionTotals: number[];
  expenseTotals: number[];
};

const RANGES = [3, 6, 12] as const;
const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

/**
 * What each member put in, month by month, and what the group spent against it
 * - the web's "Contributions month by month", which the phone did not have. The
 * table scrolls sideways inside its own box; the member column stays put.
 */
export function ContributionHistory() {
  const colors = useColors();
  const [months, setMonths] = useState<number>(6);
  const { data, isLoading, isError, refetch } = useQuery<ContributionHistoryResponse>({
    queryKey: ['contribution-history', months],
    queryFn: () => customFetch(`/api/dashboard/contribution-history?months=${months}`),
    retry: false,
  });

  const cell = { width: 84, paddingVertical: 8, paddingHorizontal: 6 } as const;
  const text = (value: string, muted = false, bold = false) => (
    <Text style={{ textAlign: 'right', fontSize: 12, color: muted ? colors.mutedForeground : colors.foreground, fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular' }} numberOfLines={1}>
      {value}
    </Text>
  );
  const nameCell = (value: string, bold = false, muted = false) => (
    <View style={{ width: 96, paddingVertical: 8, paddingRight: 6 }}>
      <Text style={{ fontSize: 12, color: muted ? colors.mutedForeground : colors.foreground, fontFamily: bold ? 'Inter_700Bold' : 'Inter_600SemiBold' }} numberOfLines={1}>{value}</Text>
    </View>
  );
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }} testID="contribution-history">
      <View>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Contributions month by month</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>What each member has put in, and what the group spent against it.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {RANGES.map((range) => (
          <Pressable key={range} onPress={() => setMonths(range)} accessibilityRole="button" accessibilityState={{ selected: months === range }}
            testID={`history-range-${range}`}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: months === range ? colors.primary : colors.border, backgroundColor: months === range ? colors.primary + '22' : 'transparent' }}>
            <Text style={{ color: months === range ? colors.primary : colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{range}m</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : isError || !data ? (
        <Pressable onPress={() => refetch()} accessibilityRole="button">
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>This history could not be loaded. Tap to try again.</Text>
        </Pressable>
      ) : data.members.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No contributions have been recorded yet.</Text>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          {/* The member column stays put while the months scroll. */}
          <View>
            {nameCell('Member', false, true)}
            {data.members.map((member) => <View key={member.userId}>{nameCell(member.name)}</View>)}
            {nameCell('Contributions', true)}
            {nameCell('Expenses', false, true)}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }}>
                {data.months.map((entry) => <View key={`${entry.year}-${entry.month}`} style={cell}>{text(entry.label, true)}</View>)}
                <View style={cell}>{text('Total', true)}</View>
              </View>
              {data.members.map((member) => (
                <View key={member.userId} style={{ flexDirection: 'row' }} testID={`contribution-history-${member.userId}`}>
                  {/* A dash rather than 0: an empty month reads as nothing recorded. */}
                  {member.amounts.map((amount, column) => <View key={column} style={cell}>{text(amount === 0 ? '—' : kes(amount), amount === 0)}</View>)}
                  <View style={cell}>{text(kes(member.total), false, true)}</View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border }}>
                {data.contributionTotals.map((total, column) => <View key={column} style={cell}>{text(kes(total), false, true)}</View>)}
                <View style={cell}>{text(kes(sum(data.contributionTotals)), false, true)}</View>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {data.expenseTotals.map((total, column) => <View key={column} style={cell}>{text(kes(total), true)}</View>)}
                <View style={cell}>{text(kes(sum(data.expenseTotals)), true)}</View>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
