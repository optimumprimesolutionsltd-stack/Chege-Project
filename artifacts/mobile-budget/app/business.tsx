import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getGetDashboardBusinessQueryKey, useGetDashboardBusiness } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LOSS = '#ef4444';

function kes(n: number): string {
  const rounded = Math.round(n);
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString('en-KE')}`;
}

/** A margin as a share of sales, or nothing when there were no sales to share. */
function margin(part: number, sales: number): string | null {
  return sales > 0 ? `${Math.round((part / sales) * 100)}%` : null;
}

type Line = { category: string; amount: number };
type Statement = {
  incomeSourceId: number;
  name: string;
  sales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  costOfGoodsSoldLines: Line[];
  expenseLines: Line[];
};

/**
 * A profit and loss statement for each side hustle, month by month.
 *
 * Sales less cost of goods sold is gross profit - what selling earned before
 * the cost of running things; less expenses is net profit - what the business
 * actually made. The same figures as All income, laid out the way a business
 * reads them. Which linked costs are which is chosen in Reports' Cost
 * categories picker.
 */
export default function BusinessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const params = { month, year };
  const { data, isLoading, isError, refetch } = useGetDashboardBusiness(params, {
    query: { queryKey: getGetDashboardBusinessQueryKey(params) },
  });
  const businesses = (data?.businesses ?? []) as Statement[];
  const totals = data?.totals;

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };
  const toggle = (key: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const amountColor = (n: number) => (n < 0 ? LOSS : colors.foreground);

  const row = (label: string, value: number, options: { strong?: boolean; minus?: boolean; share?: string | null; testID?: string } = {}) => (
    <View style={styles.row} testID={options.testID}>
      <Text style={[options.strong ? styles.strongLabel : styles.label, { color: options.strong ? colors.foreground : colors.mutedForeground }]}>
        {options.minus ? '− ' : ''}{label}
      </Text>
      <View style={styles.rowRight}>
        {options.share ? <Text style={[styles.share, { color: colors.mutedForeground }]}>{options.share}</Text> : null}
        <Text style={[options.strong ? styles.strongAmount : styles.amount, { color: options.minus ? colors.foreground : amountColor(value) }]}>
          {kes(value)}
        </Text>
      </View>
    </View>
  );

  const costRows = (key: string, label: string, total: number, lines: Line[]) => {
    const isOpen = opened.has(key);
    return (
      <View>
        <Pressable
          onPress={lines.length > 0 ? () => toggle(key) : undefined}
          disabled={lines.length === 0}
          accessibilityRole={lines.length > 0 ? 'button' : 'text'}
          accessibilityState={lines.length > 0 ? { expanded: isOpen } : undefined}
          style={styles.row}
          testID={`business-${key}`}
        >
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            − {label}{lines.length > 0 ? ` (${lines.length})` : ''}
          </Text>
          <View style={styles.rowRight}>
            <Text style={[styles.amount, { color: colors.foreground }]}>{kes(total)}</Text>
            {lines.length > 0 ? <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} /> : null}
          </View>
        </Pressable>
        {isOpen ? lines.map((line) => (
          <View key={`${key}/${line.category}`} style={[styles.row, styles.subRow]}>
            <Text style={[styles.subLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{line.category || 'Uncategorised'}</Text>
            <Text style={[styles.subAmount, { color: colors.mutedForeground }]}>{kes(line.amount)}</Text>
          </View>
        )) : null}
      </View>
    );
  };

  const statement = (business: Statement) => (
    <View key={business.incomeSourceId} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`business-statement-${business.incomeSourceId}`}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{business.name}</Text>
        <Text style={[styles.cardNet, { color: amountColor(business.netProfit) }]}>
          {business.netProfit < 0 ? 'Loss' : 'Profit'} {kes(Math.abs(business.netProfit))}
        </Text>
      </View>
      {row('Sales', business.sales)}
      {costRows(`${business.incomeSourceId}-cogs`, 'Cost of goods sold', business.costOfGoodsSold, business.costOfGoodsSoldLines)}
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      {row('Gross profit', business.grossProfit, { strong: true, share: margin(business.grossProfit, business.sales) })}
      {costRows(`${business.incomeSourceId}-expense`, 'Expenses', business.expenses, business.expenseLines)}
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      {row('Net profit', business.netProfit, { strong: true, share: margin(business.netProfit, business.sales), testID: `business-net-${business.incomeSourceId}` })}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="business-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Business</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>Profit and loss for each side hustle</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" testID="business-prev">
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.month, { color: colors.foreground }]}>{MONTHS[month - 1]} {year}</Text>
          <Pressable onPress={() => step(1)} disabled={isCurrentMonth} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" testID="business-next">
            <Feather name="chevron-right" size={22} color={isCurrentMonth ? colors.muted : colors.foreground} />
          </Pressable>
        </View>

        {isError ? (
          <Pressable onPress={() => refetch()} style={[styles.note, { borderColor: colors.border }]} accessibilityRole="button" testID="business-retry">
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Couldn’t load this. Tap to retry.</Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : businesses.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]} testID="business-none">
            <Text style={[styles.noteText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>No side hustle set up yet</Text>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              On Reports, open an income stream and link its costs - stock, fuel, repairs - with Cost categories. It then shows here as a business.
            </Text>
          </View>
        ) : (
          <>
            {businesses.length > 1 && totals ? (
              <View style={[styles.card, { backgroundColor: colors.muted, borderColor: colors.border }]} testID="business-totals">
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>All businesses</Text>
                  <Text style={[styles.cardNet, { color: amountColor(totals.netProfit) }]}>
                    {totals.netProfit < 0 ? 'Loss' : 'Profit'} {kes(Math.abs(totals.netProfit))}
                  </Text>
                </View>
                {row('Sales', totals.sales)}
                {row('Cost of goods sold', totals.costOfGoodsSold, { minus: true })}
                {row('Gross profit', totals.grossProfit, { strong: true, share: margin(totals.grossProfit, totals.sales) })}
                {row('Expenses', totals.expenses, { minus: true })}
                {row('Net profit', totals.netProfit, { strong: true, share: margin(totals.netProfit, totals.sales) })}
              </View>
            ) : null}
            {businesses.map(statement)}
            <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
              Sales are what came in under each income stream, as on All income. Which costs are cost of goods sold and which are
              expenses is set in Reports, Cost categories.
            </Text>
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
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: 'Inter_700Bold' },
  cardNet: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  strongLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  amount: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  strongAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  share: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  subRow: { paddingLeft: 16, paddingVertical: 3 },
  subLabel: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  subAmount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  note: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  footnote: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
});
