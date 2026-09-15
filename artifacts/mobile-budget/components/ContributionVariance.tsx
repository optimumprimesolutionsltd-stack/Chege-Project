import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { isoDay, longDay, monthStartIso, orderedRange } from '@/lib/dayRange';
import { useColors } from '@/hooks/useColors';
import { useCollapsed } from '@/hooks/useCollapsed';
import {
  ContributorEditorFooter,
  EditableName,
  EditListButton,
  RemoveRowButton,
  useContributorEditor,
} from '@/components/ContributorEditor';

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

type VarianceRow = { contributorId: number; name: string; expected: number | null; given: number; variance: number | null };
type ContributionVarianceResponse = { periodLabel: string; rows: VarianceRow[]; totalExpected: number; totalGiven: number };

const RANGES = [1, 3, 6, 12] as const;

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
export function ContributionVariance({ canManage = false }: { canManage?: boolean }) {
  const colors = useColors();
  const editor = useContributorEditor();
  const { open, toggle } = useCollapsed('expected-vs-actual');
  const [months, setMonths] = useState<number>(6);
  // A day-precise range alongside the whole-month presets, for a mid-month
  // "are we on track so far" check rather than only ever whole months.
  const [isCustom, setIsCustom] = useState(false);
  const [dayFrom, setDayFrom] = useState<string>(monthStartIso);
  const [dayTo, setDayTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [rangeFrom, rangeTo] = orderedRange(dayFrom, dayTo);

  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
    enabled: !isCustom,
  });
  const { data: customData, isLoading: customLoading, isError: customError } = useQuery<ContributionVarianceResponse>({
    queryKey: ['contribution-variance', rangeFrom, rangeTo],
    queryFn: () => customFetch(`/api/contributions/variance?from=${rangeFrom}&to=${rangeTo}`),
    retry: false,
    enabled: isCustom,
  });

  const monthCount = data?.months.length ?? 0;
  const periodLabel = isCustom
    ? customData?.periodLabel ?? ''
    : monthCount === 0
      ? ''
      : monthCount === 1
        ? data!.months[0].label
        : `${data!.months[0].label} – ${data!.months[monthCount - 1].label}`;
  const rows = isCustom
    ? (customData?.rows ?? [])
    : (data?.rows ?? []).map((row) => {
      const given = row.amounts.reduce((sum, amount) => sum + amount, 0);
      const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : null;
      return {
        contributorId: row.contributorId,
        name: row.name,
        expected,
        given,
        variance: expected != null ? given - expected : null,
      };
    });
  const totalExpected = isCustom ? customData?.totalExpected ?? 0 : rows.reduce((sum, row) => sum + (row.expected ?? 0), 0);
  const totalGiven = isCustom ? customData?.totalGiven ?? 0 : rows.reduce((sum, row) => sum + row.given, 0);
  const groupVariance = totalExpected > 0 ? totalGiven - totalExpected : null;
  const loading = isCustom ? customLoading : isLoading;
  const hasError = isCustom ? customError : isError;
  const hasData = isCustom ? !!customData : !!data;

  const varianceText = (value: number | null) => {
    if (value == null) return { label: '—', color: colors.mutedForeground };
    if (value === 0) return { label: 'On plan', color: colors.mutedForeground };
    return {
      label: `${value > 0 ? '+' : '−'}KES ${kes(Math.abs(value))}`,
      color: value > 0 ? colors.success : colors.destructive,
    };
  };

  const groupLine = varianceText(groupVariance);
  const collapsedSummary =
    totalExpected > 0
      ? `Given KES ${kes(totalGiven)} of KES ${kes(totalExpected)} expected · ${groupLine.label === 'On plan' ? 'on plan' : groupLine.label}`
      : `Given KES ${kes(totalGiven)} — no set amounts`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={styles.headerRow} onPress={toggle}>
        <View style={styles.headerText}>
          <View style={styles.headingRow}>
            <Feather name="bar-chart-2" size={15} color={colors.primary} />
            <Text style={[styles.heading, { color: colors.foreground }]}>Expected vs actual</Text>
            {open ? <EditListButton editor={editor} canManage={canManage} /> : null}
          </View>
          {open ? (
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {periodLabel ? (
                <>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{periodLabel}</Text>
                  {monthCount > 1 ? ` · ${monthCount} months` : ''} — expected against what each member gave.
                </>
              ) : (
                `What each member was expected to give over the last ${months} months, against what they gave.`
              )}
            </Text>
          ) : (
            <Text style={[styles.sub, { color: groupLine.color }]}>{collapsedSummary}</Text>
          )}
        </View>
        <View style={styles.headRight}>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
        </View>
      </Pressable>

      {/* The range controls sit on their own line. Beside the heading they
          left it a few characters wide once the pills carried labels, and
          "Expected vs actual" wrapped one letter per line. */}
      {open ? (
              <View style={styles.ranges}>
                {RANGES.map((range) => {
                  const active = !isCustom && months === range;
                  return (
                    <Pressable
                      key={range}
                      onPress={() => { setIsCustom(false); setMonths(range); }}
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
                <Pressable
                  onPress={() => setIsCustom(true)}
                  testID="contribution-variance-custom-range"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCustom }}
                  accessibilityLabel="Pick an exact date range"
                  hitSlop={6}
                  style={[
                    styles.rangeBtn,
                    styles.customRangeBtn,
                    { borderColor: colors.border },
                    isCustom && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  {/* An 11px bare calendar among the 3m/6m/12m pills read as an
                      icon someone had left behind rather than a fourth choice —
                      it needs the same word-shaped weight as its neighbours. */}
                  <Feather name="calendar" size={13} color={isCustom ? colors.primaryForeground : colors.mutedForeground} />
                  <Text
                    style={[
                      styles.rangeLabel,
                      { color: isCustom ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    Dates
                  </Text>
                </Pressable>
              </View>
      ) : null}

      {open && isCustom ? (
        <View style={styles.dayRow}>
          {(['from', 'to'] as const).map((which) => {
            const value = which === 'from' ? dayFrom : dayTo;
            return (
              <Pressable
                key={which}
                onPress={() => setPicker(which)}
                style={[styles.dayField, { borderColor: colors.border }]}
                testID={`contribution-variance-day-${which}`}
              >
                <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{which === 'from' ? 'From' : 'To'}</Text>
                <View style={styles.dayValueRow}>
                  <Feather name="calendar" size={13} color={colors.primary} />
                  <Text style={[styles.dayValue, { color: colors.foreground }]}>{longDay(value)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {open && isCustom && picker && (
        <DateTimePicker
          value={new Date((picker === 'from' ? dayFrom : dayTo) + 'T00:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          maximumDate={new Date()}
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            const which = picker;
            setPicker(Platform.OS === 'ios' ? which : null);
            if (selected && which) {
              const iso = isoDay(selected);
              if (which === 'from') setDayFrom(iso);
              else setDayTo(iso);
            }
          }}
        />
      )}

      {!open ? null : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : hasError || !hasData ? (
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

          <ContributorEditorFooter editor={editor} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  // minWidth 0 is what stops a flex child being squeezed narrower than its
  // own content: without it the heading kept its share of the row only until
  // the controls beside it grew, then wrapped one letter per line.
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  sub: { fontSize: 12, lineHeight: 17 },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignSelf: 'flex-start', marginTop: 8 },
  rangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rangeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  customRangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  dayRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  dayField: { flex: 1, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
  dayLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
