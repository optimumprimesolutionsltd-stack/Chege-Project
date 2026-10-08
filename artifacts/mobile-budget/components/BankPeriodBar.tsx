import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { PeriodPreset } from '@/lib/bankPeriod';
import { monthsOfYear, yearsOf } from '@/lib/yearMonths';

const isoOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const show = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose';

/**
 * A date period for the Bank tab: All time, the whole year, each month Jan to
 * Dec with how many entries it holds ("on the bank tab, i requested to see
 * months here", 8 Oct 2026 - as in Sort them out), or a from and to date. A ‹ year ›
 * switch shows when the entries span more than one year.
 */
export function BankPeriodBar({
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
  entries = [],
}: {
  preset: PeriodPreset;
  onPreset: (next: PeriodPreset) => void;
  from: string;
  to: string;
  onFrom: (next: string) => void;
  onTo: (next: string) => void;
  /** The account's entries, for each month's count and the years offered. */
  entries?: readonly { date: string | null }[];
}) {
  const colors = useColors();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(() => {
    const chosen = Number(preset.startsWith('month:') ? preset.slice(6, 10) : preset.startsWith('year:') ? preset.slice(5) : NaN);
    return Number.isInteger(chosen) && chosen > 1900 ? chosen : thisYear;
  });
  const years = useMemo(() => yearsOf(entries, thisYear), [entries, thisYear]);
  const months = useMemo(() => monthsOfYear(entries, year), [entries, year]);
  const options: Array<{ value: PeriodPreset; label: string; count?: number }> = [
    { value: 'all', label: 'All time' },
    { value: `year:${year}`, label: year === thisYear ? 'This year' : `All ${year}` },
    ...months.map((month) => ({ value: `month:${month.key}` as PeriodPreset, label: month.label, count: month.count })),
    { value: 'custom', label: 'Pick dates' },
  ];

  return (
    <View style={{ gap: 8, marginBottom: 10 }} testID="bank-period">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <Feather name="calendar" size={15} color={colors.mutedForeground} />
        {years.length > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} testID="bank-period-year">
            <Pressable disabled={year <= years[0]} onPress={() => setYear((current) => current - 1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous year">
              <Feather name="chevron-left" size={18} color={year <= years[0] ? colors.border : colors.primary} />
            </Pressable>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{year}</Text>
            <Pressable disabled={year >= years[years.length - 1]} onPress={() => setYear((current) => current + 1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next year">
              <Feather name="chevron-right" size={18} color={year >= years[years.length - 1] ? colors.border : colors.primary} />
            </Pressable>
          </View>
        ) : null}
        {options.map((option) => {
          const active = preset === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onPreset(option.value)}
              testID={`bank-period-${option.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.muted,
                opacity: option.count === 0 && !active ? 0.45 : 1,
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? colors.primaryForeground : colors.foreground }}>
                {option.label}{option.count !== undefined ? ` (${option.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {preset === 'custom' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {(['from', 'to'] as const).map((which, index) => (
            <React.Fragment key={which}>
              {index === 1 ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>to</Text> : null}
              <Pressable
                onPress={() => setPicking(which)}
                testID={`bank-period-${which}`}
                style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}
              >
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                  {which === 'from' ? 'From ' : 'To '}
                  {show(which === 'from' ? from : to)}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {picking ? (
        <DateTimePicker
          value={new Date(`${(picking === 'from' ? from : to) || isoOf(new Date())}T00:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_event: DateTimePickerEvent, picked?: Date) => {
            const which = picking;
            setPicking(Platform.OS === 'ios' ? which : null);
            if (!picked) return;
            if (which === 'from') onFrom(isoOf(picked));
            else onTo(isoOf(picked));
          }}
        />
      ) : null}
    </View>
  );
}
