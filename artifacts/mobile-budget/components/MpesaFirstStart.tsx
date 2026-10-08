/**
 * The first time: one statement, from a day you choose (lib/mpesaFirstStart).
 * Steps 1 and 2; the statement card below it is step 3.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColors } from '@/hooks/useColors';
import { isoDay, longDay } from '@/lib/dayRange';
import { startPresets } from '@/lib/mpesaFirstStart';

export function MpesaFirstStart({ from, onFrom, keepsUp }: {
  from: string;
  onFrom: (from: string) => void;
  /** This phone can read M-Pesa's messages, so it keeps up by itself afterwards. */
  keepsUp: boolean;
}) {
  const colors = useColors();
  const [picking, setPicking] = useState(false);
  const presets = startPresets();
  const picked = !presets.some((preset) => preset.from === from);
  const chip = (on: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted,
  }) as const;
  const step = (n: number, title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }}>{n}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{title}</Text>
    </View>
  );

  return (
    <View style={{ gap: 14, borderWidth: 1, borderColor: colors.foreground, borderRadius: 12, padding: 14, backgroundColor: colors.card }} testID="mpesa-first-start">
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>Start with your M-Pesa statement</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
          {keepsUp
            ? 'One statement brings in everything from the day you choose up to today. After that, Jamvi reads new M-Pesa messages for you.'
            : 'One statement brings in everything from the day you choose up to today. After that, share new M-Pesa messages to Jamvi as they come.'}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        {step(1, 'From when?')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {presets.map((preset) => (
            <Pressable key={preset.key} onPress={() => { setPicking(false); onFrom(preset.from); }} accessibilityRole="radio" accessibilityState={{ selected: from === preset.from }}
              testID={`mpesa-first-from-${preset.key}`} style={chip(from === preset.from)}>
              <Text style={{ color: from === preset.from ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{preset.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPicking(true)} accessibilityRole="radio" accessibilityState={{ selected: picked }} testID="mpesa-first-from-pick" style={chip(picked)}>
            <Text style={{ color: picked ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{picked ? longDay(from) : 'Pick a date'}</Text>
          </Pressable>
        </View>
        {picking ? (
          <DateTimePicker
            value={new Date(`${from}T00:00:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (Platform.OS !== 'ios') setPicking(false);
              if (selected) onFrom(isoDay(selected));
            }}
          />
        ) : null}
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }} testID="mpesa-first-range">{longDay(from)} to today</Text>
      </View>

      <View style={{ gap: 6 }}>
        {step(2, 'Get the statement from M-Pesa')}
        <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
          Ask M-Pesa for a full statement from {longDay(from)} to today - in the M-PESA or My Safaricom app under Statements, or by dialling *334# and choosing My Account, then M-PESA Statement.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          It comes by email as a PDF, and M-Pesa sends its password by SMS. A statement that starts earlier is fine: Jamvi leaves out everything before {longDay(from)}.
        </Text>
      </View>

      {step(3, 'Choose it below and read it')}
    </View>
  );
}
