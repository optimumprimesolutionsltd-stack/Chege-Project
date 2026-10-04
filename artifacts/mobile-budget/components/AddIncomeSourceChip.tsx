import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';

type Created = { id: number; name: string; userId?: string | null };

/**
 * "+ Add income source", right where money in is being given one.
 *
 * Money in with nowhere to say it came from was saved as plain money: the
 * M-Pesa balance came right but the income picture did not (4 Oct 2026). A
 * budget with no income sources yet - one that began as a Shared group, say -
 * now gets one made on the spot, owned by the person adding it, and the line
 * is given it straight away.
 */
export function AddIncomeSourceChip({ onCreated, testID }: { onCreated: (source: Created) => void; testID?: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || !user?.id || saving) return;
    setSaving(true);
    try {
      const created = await customFetch<Created>('/api/income-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: trimmed }),
      });
      // Every list of sources on the phone, whichever key it is kept under.
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const head = query.queryKey[0];
          return head === 'income-sources' || (typeof head === 'string' && head.startsWith('/api/income-sources'));
        },
      });
      setName('');
      setOpen(false);
      onCreated(created);
    } catch (error) {
      Alert.alert('Could not add it', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID={testID}
        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary }}
      >
        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>+ Add income source</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder="e.g. Salary, Business"
        placeholderTextColor={colors.mutedForeground}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        testID={testID ? `${testID}-name` : undefined}
        style={{ minWidth: 150, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 }}
      />
      <Pressable
        onPress={() => void save()}
        disabled={!name.trim() || saving}
        accessibilityRole="button"
        testID={testID ? `${testID}-save` : undefined}
        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primary, opacity: !name.trim() || saving ? 0.5 : 1 }}
      >
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>Add</Text>}
      </Pressable>
      <Pressable onPress={() => { setOpen(false); setName(''); }} hitSlop={8} accessibilityRole="button">
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
