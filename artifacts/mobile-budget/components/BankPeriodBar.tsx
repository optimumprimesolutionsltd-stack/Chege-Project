import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { PeriodPreset } from '@/lib/bankPeriod';

const PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'custom', label: 'Pick dates' },
];

const isoOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const show = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose';

/** A date period for the Bank tab: quick ranges, or a from and to date. */
export function BankPeriodBar({
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
}: {
  preset: PeriodPreset;
  onPreset: (next: PeriodPreset) => void;
  from: string;
  to: string;
  onFrom: (next: string) => void;
  onTo: (next: string) => void;
}) {
  const colors = useColors();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  return (
    <View style={{ gap: 8, marginBottom: 10 }} testID="bank-period">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <Feather name="calendar" size={15} color={colors.mutedForeground} />
        {PRESETS.map((option) => {
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
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? colors.primaryForeground : colors.foreground }}>
                {option.label}
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
                style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}
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
