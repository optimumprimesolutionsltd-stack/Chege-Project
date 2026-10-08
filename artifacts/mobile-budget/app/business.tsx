import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { autoLinkReversals, getGetDashboardBusinessQueryKey, useGetDashboardBusiness } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { ScrollerScrollView } from '@/components/PageScrollReset';

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

type Entry = { date: string; description: string; amount: number };
type Line = { category: string; amount: number; shareOfSales?: number | null; entries?: Entry[]; more?: number };
type Figures = { sales: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number };
/** One of the business's own bank accounts over the period (api-server businessAccountSummary). */
type BusinessAccount = { accountId: number; name: string; businessName?: string | null; moneyIn: number; moneyOut: number; byCategory: Array<{ category: string; amount: number }> };

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
  salesEntries?: Entry[];
  moreSalesEntries?: number;
  previous?: Figures & { from: string; to: string };
};

const DETAILS_KEY = 'jamvi:business-details-open';

function shortDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

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
  // Which businesses show their details. Off until asked for, and remembered
  // on this phone - a convenience, so it is fine to lose.
  const [detailed, setDetailed] = useState<Set<number>>(new Set());
  // A reversed stock payment counted as cost until its money back was matched
  // to it, and matching only ran straight after an import - so a pair of KCB
  // payments, one reversed, both showed as stock and made a loss. Matched
  // quietly on opening; what cannot be matched on its own stays on Bank.
  const queryClient = useQueryClient();
  useEffect(() => {
    autoLinkReversals()
      .then((result) => { if (result.linked > 0) void queryClient.invalidateQueries(); })
      .catch(() => {});
  }, [queryClient]);
  useEffect(() => {
    AsyncStorage.getItem(DETAILS_KEY)
      .then((raw) => { if (raw) setDetailed(new Set((JSON.parse(raw) as number[]).filter(Number.isFinite))); })
      .catch(() => {});
  }, []);
  const toggleDetails = (id: number) =>
    setDetailed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(DETAILS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });

  // The details cost more to work out, so they are only asked for when shown.
  const params = { month, year, ...(detailed.size > 0 ? { detail: true } : {}) };
  const { data, isLoading, isError, refetch } = useGetDashboardBusiness(params, {
    query: { queryKey: getGetDashboardBusinessQueryKey(params) },
  });
  const businesses = (data?.businesses ?? []) as Statement[];
  // Business sits above the tabs, so pushing the Reports tab changed the tab
  // underneath and left this screen on top: the button seemed to do nothing.
  // Close back down to the tabs, then open Reports with this stream's Cost
  // categories sheet already up.
  const changeCosts = (incomeSourceId: number, name: string) => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate({ pathname: '/(tabs)/reports', params: { costsFor: String(incomeSourceId), costsName: name } });
  };
  const totals = data?.totals;
  // One switch for the whole screen, beside each business's own: every
  // business open, or every one closed.
  const allDetailed = businesses.length > 0 && businesses.every((business) => detailed.has(business.incomeSourceId));
  const toggleAllDetails = () => {
    const next = allDetailed ? new Set<number>() : new Set(businesses.map((business) => business.incomeSourceId));
    setDetailed(next);
    AsyncStorage.setItem(DETAILS_KEY, JSON.stringify([...next])).catch(() => {});
  };

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

  const entryRows = (key: string, entries: Entry[], more = 0) => (
    <View testID={`business-entries-${key}`}>
      {entries.map((entry, index) => (
        <View key={`${key}/${index}`} style={[styles.row, styles.entryRow]}>
          <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>{shortDay(entry.date)}</Text>
          <Text style={[styles.subLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{entry.description || '—'}</Text>
          <Text style={[styles.subAmount, { color: colors.mutedForeground }]}>{kes(entry.amount)}</Text>
        </View>
      ))}
      {more > 0 ? (
        <Text style={[styles.subLabel, styles.entryRow, { color: colors.mutedForeground }]}>and {more} more</Text>
      ) : null}
    </View>
  );

  const costRows = (key: string, label: string, total: number, lines: Line[], withDetails = false) => {
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
        {isOpen ? lines.map((line) => {
          const lineKey = `${key}/${line.category}`;
          const entriesOpen = opened.has(lineKey);
          const canOpen = withDetails && (line.entries?.length ?? 0) > 0;
          return (
            <View key={lineKey}>
              <Pressable
                onPress={canOpen ? () => toggle(lineKey) : undefined}
                disabled={!canOpen}
                accessibilityRole={canOpen ? 'button' : 'text'}
                style={[styles.row, styles.subRow]}
                testID={`business-line-${lineKey}`}
              >
                <Text style={[styles.subLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{line.category || 'Uncategorised'}</Text>
                <View style={styles.rowRight}>
                  {withDetails && line.shareOfSales != null ? (
                    <Text style={[styles.share, { color: colors.mutedForeground }]}>{Math.round(line.shareOfSales)}% of sales</Text>
                  ) : null}
                  <Text style={[styles.subAmount, { color: colors.mutedForeground }]}>{kes(line.amount)}</Text>
                  {canOpen ? <Feather name={entriesOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.mutedForeground} /> : null}
                </View>
              </Pressable>
              {entriesOpen && line.entries ? entryRows(lineKey, line.entries, line.more ?? 0) : null}
            </View>
          );
        }) : null}
      </View>
    );
  };

  const comparison = (business: Statement) => {
    const previous = business.previous;
    if (!previous) return null;
    const monthName = new Date(`${previous.from}T00:00:00`).toLocaleDateString('en-KE', { month: 'long' });
    const changeRow = (label: string, now: number, then: number) => {
      const change = now - then;
      return (
        <View key={label} style={[styles.row, styles.subRow]}>
          <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{label}</Text>
          <View style={styles.rowRight}>
            <Text style={[styles.subAmount, { color: colors.mutedForeground }]}>{kes(then)}</Text>
            <Text style={[styles.share, styles.change, { color: change === 0 ? colors.mutedForeground : change > 0 ? '#16a34a' : LOSS }]}>
              {change === 0 ? 'same' : `${change > 0 ? '▲' : '▼'} ${kes(Math.abs(change))}`}
            </Text>
          </View>
        </View>
      );
    };
    return (
      <View style={[styles.compare, { borderColor: colors.border }]} testID={`business-compare-${business.incomeSourceId}`}>
        <Text style={[styles.compareTitle, { color: colors.foreground }]}>Compared with {monthName}</Text>
        {changeRow('Sales', business.sales, previous.sales)}
        {changeRow('Cost of goods sold', business.costOfGoodsSold, previous.costOfGoodsSold)}
        {changeRow('Gross profit', business.grossProfit, previous.grossProfit)}
        {changeRow('Expenses', business.expenses, previous.expenses)}
        {changeRow('Net profit', business.netProfit, previous.netProfit)}
      </View>
    );
  };

  const statement = (business: Statement) => {
    const withDetails = detailed.has(business.incomeSourceId) && business.previous !== undefined;
    const salesKey = `${business.incomeSourceId}-sales`;
    const salesOpen = opened.has(salesKey);
    const salesEntries = business.salesEntries ?? [];
    return (
      <View key={business.incomeSourceId} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`business-statement-${business.incomeSourceId}`}>
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{business.name}</Text>
          <Text style={[styles.cardNet, { color: amountColor(business.netProfit) }]}>
            {business.netProfit < 0 ? 'Loss' : 'Profit'} {kes(Math.abs(business.netProfit))}
          </Text>
        </View>
        {withDetails && salesEntries.length > 0 ? (
          <>
            <Pressable onPress={() => toggle(salesKey)} accessibilityRole="button" accessibilityState={{ expanded: salesOpen }} style={styles.row} testID={`business-${salesKey}`}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Sales ({salesEntries.length + (business.moreSalesEntries ?? 0)})</Text>
              <View style={styles.rowRight}>
                <Text style={[styles.amount, { color: amountColor(business.sales) }]}>{kes(business.sales)}</Text>
                <Feather name={salesOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
              </View>
            </Pressable>
            {salesOpen ? entryRows(salesKey, salesEntries, business.moreSalesEntries ?? 0) : null}
          </>
        ) : row('Sales', business.sales)}
        {costRows(`${business.incomeSourceId}-cogs`, 'Cost of goods sold', business.costOfGoodsSold, business.costOfGoodsSoldLines, withDetails)}
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        {row('Gross profit', business.grossProfit, { strong: true, share: margin(business.grossProfit, business.sales) })}
        {costRows(`${business.incomeSourceId}-expense`, 'Expenses', business.expenses, business.expenseLines, withDetails)}
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        {row('Net profit', business.netProfit, { strong: true, share: margin(business.netProfit, business.sales), testID: `business-net-${business.incomeSourceId}` })}
        {withDetails ? comparison(business) : null}
        {withDetails && business.costOfGoodsSold > business.sales ? (
          <Text style={[styles.note2, { color: colors.mutedForeground }]} testID={`business-stock-note-${business.incomeSourceId}`}>
            Stock counts in the month it is bought, not the month it sells. A month you stock up can show a loss that later
            months make back as that stock sells.
          </Text>
        ) : null}
        <View style={styles.cardFoot}>
          <Pressable onPress={() => toggleDetails(business.incomeSourceId)} accessibilityRole="button" hitSlop={6} testID={`business-details-${business.incomeSourceId}`}>
            <Text style={[styles.link, { color: colors.primary }]}>{detailed.has(business.incomeSourceId) ? 'Hide details' : 'Show details'}</Text>
          </Pressable>
          <Pressable
            onPress={() => changeCosts(business.incomeSourceId, business.name)}
            accessibilityRole="button"
            accessibilityLabel="Change which costs count, in Reports, Income streams, Cost categories"
            hitSlop={6}
            testID={`business-change-costs-${business.incomeSourceId}`}
          >
            <Text style={[styles.link, { color: colors.primary }]}>Change costs</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="business-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Business</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>Profit and loss for each business</Text>
        </View>
        {businesses.length > 0 ? (
          <Pressable onPress={toggleAllDetails} accessibilityRole="button" hitSlop={8} testID="business-details-all">
            <Text style={[styles.link, { color: colors.primary }]}>{allDetailed ? 'Hide all details' : 'Show all details'}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollerScrollView scroller={{ top: 8, bottom: insets.bottom + 16 }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" testID="business-prev">
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.month, { color: colors.foreground }]}>{MONTHS[month - 1]} {year}</Text>
          <Pressable onPress={() => step(1)} disabled={isCurrentMonth} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" testID="business-next">
            <Feather name="chevron-right" size={22} color={isCurrentMonth ? colors.muted : colors.foreground} />
          </Pressable>
        </View>

        {/* The business's own bank accounts, kept out of personal (api-server lib/business-accounts). */}
        {((data as { businessAccounts?: BusinessAccount[] } | undefined)?.businessAccounts ?? []).map((account) => (
          <View key={account.accountId} style={[styles.note, { borderColor: colors.border, gap: 6 }]} testID={`business-account-${account.accountId}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="briefcase" size={14} color={colors.primary} />
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold' }}>{account.businessName ? `${account.businessName} · ${account.name}` : account.name}</Text>
            </View>
            <Text style={{ color: colors.foreground }}>In KES {kes(account.moneyIn)} · Out KES {kes(account.moneyOut)} · Net KES {kes(account.moneyIn - account.moneyOut)}</Text>
            {account.byCategory.slice(0, 6).map((line) => (
              <View key={line.category} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.mutedForeground, flex: 1 }} numberOfLines={1}>{line.category}</Text>
                <Text style={{ color: colors.mutedForeground }}>KES {kes(line.amount)}</Text>
              </View>
            ))}
          </View>
        ))}

        {isError ? (
          <Pressable onPress={() => refetch()} style={[styles.note, { borderColor: colors.border }]} accessibilityRole="button" testID="business-retry">
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Couldn’t load this. Tap to retry.</Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : businesses.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]} testID="business-none">
            <Text style={[styles.noteText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>No business set up yet</Text>
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
      </ScrollerScrollView>
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
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 2 },
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
  note: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 6, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  footnote: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  entryRow: { paddingLeft: 28, paddingVertical: 2 },
  entryDate: { fontSize: 11, fontFamily: 'Inter_400Regular', width: 44 },
  compare: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8 },
  compareTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  change: { minWidth: 72, textAlign: 'right' },
  note2: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 8 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
