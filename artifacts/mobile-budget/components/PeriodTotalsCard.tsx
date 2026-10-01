import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { getGetDashboardPeriodTotalsQueryKey, useGetDashboardPeriodTotals } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const kes = (value: number) => `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

/**
 * The period at a glance - the web's period totals on Reports, which the phone
 * did not have: what was spent, what came in to fund it and the difference,
 * then the bank's money in and out, savings, and money borrowed (shown, and
 * counted in none of the others).
 */
export function PeriodTotalsCard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const colors = useColors();
  const params = startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
  const { data, isLoading, isError } = useGetDashboardPeriodTotals(params, {
    query: { queryKey: getGetDashboardPeriodTotalsQueryKey(params), retry: false },
  });
  const cell = (label: string, value: string, note?: string, tone?: string) => (
    <View style={{ width: '50%', paddingVertical: 8, paddingRight: 8 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
      <Text style={{ color: tone ?? colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {note ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{note}</Text> : null}
    </View>
  );
  return (
    <View style={{ gap: 8 }} testID="period-totals-section">
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>This period at a glance</Text>
      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 }}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : isError || !data ? (
          <Text style={{ color: colors.mutedForeground }}>Couldn’t load these totals.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cell('SPENT', kes(data.spendingTotal), `${data.expenseCount} ${data.expenseCount === 1 ? 'expense' : 'expenses'}`)}
            {cell('FUNDED', kes(data.contributionTotal), undefined, colors.primary)}
            {cell('DIFFERENCE', `${data.netMovement >= 0 ? '+' : ''}${kes(data.netMovement)}`, undefined, data.netMovement < 0 ? '#ef4444' : colors.primary)}
            {cell('BANK, MONEY IN', kes(data.bankDepositTotal), `${data.bankDepositCount} ${data.bankDepositCount === 1 ? 'deposit' : 'deposits'}`)}
            {cell('BANK, MONEY OUT', kes(data.bankDisbursementTotal), `${data.bankDisbursementCount} ${data.bankDisbursementCount === 1 ? 'withdrawal' : 'withdrawals'}`)}
            {cell('SAVED', kes(data.savingsTotal), `${data.savingsCount} ${data.savingsCount === 1 ? 'addition' : 'additions'}`)}
            {data.borrowedTotal > 0 ? cell('BORROWED', kes(data.borrowedTotal), 'Not income, so in none of the above') : null}
          </View>
        )}
      </View>
    </View>
  );
}
