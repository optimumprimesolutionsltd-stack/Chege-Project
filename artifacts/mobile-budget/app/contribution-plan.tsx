import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Contributor = { id: number; name: string; hasAccount: boolean; monthlyTarget: number | null };

const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });
const parseAmount = (raw: string): number | null | false => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : false;
};

/**
 * The plan: what each member is expected to give per month. Kept apart from
 * recording, which is only for what actually came in.
 */
export default function ContributionPlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<{ defaultMonthlyTarget: number | null }>({
    queryKey: ['contribution-settings'],
    queryFn: () => customFetch('/api/contribution-settings'),
    retry: false,
  });
  const { data: contributors = [], isLoading } = useQuery<Contributor[]>({
    queryKey: ['contributors'],
    queryFn: () => customFetch('/api/contributors'),
    retry: false,
  });

  const [groupTarget, setGroupTarget] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  useEffect(() => {
    setGroupTarget(settings?.defaultMonthlyTarget != null ? String(settings.defaultMonthlyTarget) : '');
  }, [settings?.defaultMonthlyTarget]);

  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const saveGroupTarget = async (applyToEveryone: boolean) => {
    const value = parseAmount(groupTarget);
    if (value === false) {
      Alert.alert('Enter an amount', 'Use a number of zero or more, or leave it blank.');
      return;
    }
    setSavingGroup(true);
    try {
      await customFetch('/api/contribution-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultMonthlyTarget: value, applyToEveryone }),
      });
      await queryClient.invalidateQueries();
      Alert.alert('Saved', applyToEveryone ? 'Everyone is now expected to give this amount.' : 'New members will be expected to give this amount.');
    } catch {
      Alert.alert('Could not save', 'Nothing has been changed.');
    } finally {
      setSavingGroup(false);
    }
  };

  const saveMemberTarget = async (contributorId: number) => {
    const value = parseAmount(editValue);
    if (value === false) {
      Alert.alert('Enter an amount', 'Use a number of zero or more, or leave it blank.');
      return;
    }
    try {
      await customFetch(`/api/contributors/${contributorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTarget: value }),
      });
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contributors'] }),
        queryClient.invalidateQueries({ queryKey: ['contribution-grid'] }),
      ]);
    } catch {
      Alert.alert('Could not save', 'That amount was not changed.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Expected from each member</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          The monthly amount the group is working to. It is what arrears and the variance are measured against — leave it
          blank where giving is voluntary.
        </Text>

        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.foreground }]}>Group default, per member per month</Text>
          <TextInput
            value={groupTarget}
            onChangeText={setGroupTarget}
            keyboardType="number-pad"
            placeholder="e.g. 1000"
            placeholderTextColor={colors.mutedForeground}
            editable={!savingGroup}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          />
          <View style={styles.groupButtons}>
            <Pressable
              onPress={() => void saveGroupTarget(false)}
              disabled={savingGroup}
              style={[styles.btn, { borderColor: colors.border, opacity: savingGroup ? 0.5 : 1 }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => void saveGroupTarget(true)}
              disabled={savingGroup || contributors.length === 0}
              style={[styles.btn, { borderColor: colors.border, opacity: savingGroup || contributors.length === 0 ? 0.5 : 1 }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Apply to everyone</Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : contributors.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground, borderColor: colors.border }]}>
            No contributors yet. Add people on "Record this month", then set what each is expected to give here.
          </Text>
        ) : (
          <View style={[styles.list, { borderColor: colors.border }]}>
            {contributors.map((contributor, index) => (
              <View
                key={contributor.id}
                style={[styles.member, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              >
                <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>{contributor.name}</Text>
                {editing === contributor.id ? (
                  <View style={styles.editRow}>
                    <TextInput
                      value={editValue}
                      onChangeText={setEditValue}
                      keyboardType="number-pad"
                      autoFocus
                      placeholder="blank = none"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.editInput, { borderColor: colors.border, color: colors.foreground }]}
                    />
                    <Pressable onPress={() => void saveMemberTarget(contributor.id)} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Save</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setEditing(contributor.id);
                      setEditValue(contributor.monthlyTarget != null ? String(contributor.monthlyTarget) : '');
                    }}
                    style={styles.valueRow}
                    hitSlop={8}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                      {contributor.monthlyTarget != null ? `KES ${kes(contributor.monthlyTarget)}/mo` : 'Not set'}
                    </Text>
                    <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', flex: 1 },
  intro: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 10 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  groupButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { height: 40, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 18 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  member: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12 },
  memberName: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: { width: 110, height: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, textAlign: 'right', fontSize: 14 },
  saveBtn: { height: 38, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
