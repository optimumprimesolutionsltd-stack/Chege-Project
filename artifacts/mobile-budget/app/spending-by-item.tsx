import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  getGetDashboardSpendingByItemQueryKey,
  useGetDashboardSpendingByItem,
} from '@workspace/api-client-react';
import { isoDay, longDay, orderedRange } from '@/lib/dayRange';
import { useColors } from '@/hooks/useColors';
import { getExpenseEditHref } from '@/lib/expenseEditLink';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

/** The first day of the month `back` months before this one. */
function monthsAgoIso(back: number): string {
  const today = new Date();
  return isoDay(new Date(today.getFullYear(), today.getMonth() - back, 1));
}

const PRESETS = [3, 6, 12] as const;
type Preset = (typeof PRESETS)[number];

/**
 * "How much have I spent on this?" — where "this" is a thing, not a category.
 *
 * The Budget tab answers per category: how much on Food, how much on
 * Transport. But nobody budgets a category called Netflix, and the question
 * people actually ask is about the thing itself. The one field that already
 * names it is the expense's description, so this lists what each named thing
 * has cost, largest first, over a span the person chooses.
 */
export default function SpendingByItemScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();
  const category = typeof params.category === 'string' && params.category.length > 0 ? params.category : undefined;

  const [preset, setPreset] = useState<Preset>(12);
  const [customDates, setCustomDates] = useState(false);
  const [from, setFrom] = useState<string>(() => monthsAgoIso(11));
  const [to, setTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [search, setSearch] = useState('');
  const [openItem, setOpenItem] = useState<string | null>(null);

  const [rangeFrom, rangeTo] = orderedRange(
    customDates ? from : monthsAgoIso(preset - 1),
    customDates ? to : isoDay(new Date()),
  );

  const query = useMemo(
    () => ({
      from: rangeFrom,
      to: rangeTo,
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(category ? { category } : {}),
    }),
    [rangeFrom, rangeTo, search, category],
  );

  const { data, isLoading, isError, refetch } = useGetDashboardSpendingByItem(query, {
    // The span and the search both belong in the key, or changing either would
    // show the previous answer from cache under the new controls.
    query: { queryKey: getGetDashboardSpendingByItemQueryKey(query) },
  });

  const detailQuery = useMemo(
    () => ({ ...query, ...(openItem ? { item: openItem } : {}) }),
    [query, openItem],
  );

  const { data: detail, isLoading: detailLoading } = useGetDashboardSpendingByItem(detailQuery, {
    query: {
      queryKey: getGetDashboardSpendingByItemQueryKey(detailQuery),
      enabled: openItem !== null,
    },
  });

  const items = data?.items ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="spending-by-item-back"
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>What you spend on</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {category ? `Within ${category}` : 'Every expense, grouped by what it was for'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a shop, bill or subscription"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
            testID="spending-by-item-search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear the search">
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.presets}>
          {PRESETS.map((months) => {
            const active = !customDates && preset === months;
            return (
              <Pressable
                key={months}
                onPress={() => { setCustomDates(false); setPreset(months); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`spending-preset-${months}`}
                style={[
                  styles.presetBtn,
                  { borderColor: colors.border },
                  active && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.presetLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {months} months
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCustomDates((on) => !on)}
            accessibilityRole="button"
            accessibilityState={{ selected: customDates }}
            testID="spending-custom-dates"
            style={[
              styles.presetBtn,
              { borderColor: colors.border },
              customDates && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.presetLabel, { color: customDates ? colors.primaryForeground : colors.mutedForeground }]}>
              Exact dates
            </Text>
          </Pressable>
        </View>

        {customDates ? (
          <View style={styles.dateRow}>
            {(['from', 'to'] as const).map((which) => (
              <Pressable
                key={which}
                onPress={() => setPicker(which)}
                style={[styles.dateField, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`${which === 'from' ? 'Start' : 'End'} date`}
                testID={`spending-day-${which}`}
              >
                <Text style={[styles.dateCaption, { color: colors.mutedForeground }]}>
                  {which === 'from' ? 'From' : 'To'}
                </Text>
                <Text style={[styles.dateValue, { color: colors.foreground }]}>
                  {longDay(which === 'from' ? from : to)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {customDates && picker ? (
          <DateTimePicker
            value={new Date((picker === 'from' ? from : to) + 'T00:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              const which = picker;
              setPicker(Platform.OS === 'ios' ? which : null);
              if (selected && which) {
                const iso = isoDay(selected);
                if (which === 'from') setFrom(iso);
                else setTo(iso);
              }
            }}
          />
        ) : null}

        <View style={[styles.totalCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.totalValue, { color: colors.foreground }]}>
            {isLoading ? 'Loading…' : `KES ${formatKES(data?.total)}`}
          </Text>
          <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
            {data ? `${longDay(data.from)} – ${longDay(data.to)}` : ' '}
          </Text>
        </View>

        {isError ? (
          <Pressable
            onPress={() => refetch()}
            style={[styles.note, { borderColor: colors.border }]}
            accessibilityRole="button"
            testID="spending-by-item-retry"
          >
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              Couldn’t load this. Tap to retry.
            </Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : items.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
              {search.trim()
                ? `Nothing matching “${search.trim()}” in this period.`
                : 'No expenses recorded in this period.'}
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const open = openItem === item.description;
            return (
              <View key={item.description} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => setOpenItem(open ? null : item.description)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${item.description}, ${formatKES(item.total)} shillings over ${item.count} ${item.count === 1 ? 'expense' : 'expenses'}`}
                  testID={`spending-item-${item.description}`}
                  style={styles.cardHead}
                >
                  <View style={styles.cardText}>
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.count} {item.count === 1 ? 'time' : 'times'} · last {longDay(item.lastDate)}
                      {item.categories.length > 0 ? ` · ${item.categories.join(', ')}` : ''}
                    </Text>
                  </View>
                  <View style={styles.cardAmount}>
                    <Text style={[styles.itemTotal, { color: colors.foreground }]}>{formatKES(item.total)}</Text>
                    <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                  </View>
                </Pressable>

                {open ? (
                  detailLoading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
                  ) : (
                    <View style={[styles.entries, { borderColor: colors.border }]}>
                      {(detail?.entries ?? []).map((entry) => (
                        <Pressable
                          key={entry.id}
                          onPress={() => router.push(getExpenseEditHref({ id: entry.id, date: entry.date }))}
                          accessibilityRole="button"
                          accessibilityLabel={`Open the expense from ${longDay(entry.date)}`}
                          testID={`spending-entry-${entry.id}`}
                          style={styles.entryRow}
                        >
                          <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>{longDay(entry.date)}</Text>
                          <Text style={[styles.entryWho, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {entry.paidFromBank ? 'Joint bank' : entry.payerName}
                          </Text>
                          <Text style={[styles.entryAmount, { color: colors.foreground }]}>{formatKES(entry.amount)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  // Without this the title is starved by the back chevron on a narrow phone.
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  body: { padding: 16, gap: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  presetLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  dateCaption: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dateValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  totalCard: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  totalValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  totalCaption: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  note: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  cardText: { flex: 1, minWidth: 0 },
  cardAmount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  itemMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  itemTotal: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  entries: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  entryDate: { fontSize: 12, fontFamily: 'Inter_400Regular', width: 96 },
  entryWho: { flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'Inter_400Regular' },
  entryAmount: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
