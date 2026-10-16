import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useGroupMpesaSource } from '@/hooks/useGroupMpesaSource';
import { GROUP_MPESA_CHOICES, type GroupMpesaSourceKind } from '@/lib/groupMpesa';

/**
 * "Which M-Pesa does this group use?" - asked once of a shared group's owner or
 * admin, so nobody's own M-Pesa is read into the group by mistake (lib/groupMpesa).
 * Until it is answered, the group reads no phone messages at all.
 */
export function GroupMpesaQuestion({ canManage }: { canManage: boolean }) {
  const colors = useColors();
  const { group, unanswered, save } = useGroupMpesaSource();
  const [picked, setPicked] = useState<GroupMpesaSourceKind | null>(null);
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  if (!canManage || !unanswered) return null;
  const choice = GROUP_MPESA_CHOICES.find((one) => one.source === picked) ?? null;

  const answer = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await save({ source: picked, lineNumber: number.trim() || null });
    } catch (error) {
      Alert.alert('Could not save that', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="group-mpesa-question">
      <View style={styles.head}>
        <Feather name="smartphone" size={15} color={colors.primary} />
        <Text style={[styles.kicker, { color: colors.primary }]}>THIS GROUP'S M-PESA</Text>
      </View>
      <Text style={[styles.question, { color: colors.foreground }]}>Which M-Pesa does {group?.name || 'this group'} use?</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        So Jamvi only reads the group's own money here - never a member's personal M-Pesa by mistake.
      </Text>
      {GROUP_MPESA_CHOICES.map((one) => {
        const on = picked === one.source;
        return (
          <Pressable
            key={one.source}
            onPress={() => { setPicked(one.source); setNumber(''); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={`group-mpesa-${one.source}`}
            style={[styles.option, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}12` : 'transparent' }]}
          >
            <Text style={[styles.optionTitle, { color: colors.foreground }]}>{one.title}</Text>
            <Text style={[styles.optionText, { color: colors.mutedForeground }]}>{one.description}</Text>
          </Pressable>
        );
      })}
      {choice?.asksNumber ? (
        <TextInput
          value={number}
          onChangeText={setNumber}
          keyboardType="phone-pad"
          placeholder={choice.asksNumber === 'phone' ? 'Your M-Pesa number, e.g. 0712 345 678' : `The ${choice.title.replace('A ', '')} number`}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          testID="group-mpesa-number"
        />
      ) : null}
      <Pressable
        onPress={() => void answer()}
        disabled={!picked || saving}
        accessibilityRole="button"
        testID="group-mpesa-save"
        style={[styles.save, { backgroundColor: colors.primary, opacity: !picked || saving ? 0.5 : 1 }]}
      >
        {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  question: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  option: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 2 },
  optionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  optionText: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  save: { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
