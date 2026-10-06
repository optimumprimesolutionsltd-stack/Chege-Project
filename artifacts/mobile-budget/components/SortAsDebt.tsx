import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { debtKindLabel, debtKindsFor, suggestedParty, type DebtKind } from '@/lib/sortAsDebt';
import { plainSaveError } from '@/lib/saveRetry';
import type { EntryToSort } from '@/lib/entriesToSort';

type Party = { id: number; name: string };

const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

/**
 * "Debt" on an entry in Sort them out: lent, paid back, borrowed or paid back
 * to you, and who with - a person already in Who owes who, or a new one.
 * Several entries naming the same person can be done at once.
 */
export function SortAsDebt({ entry, others, onClose, onSorted }: {
  entry: EntryToSort;
  /** Other entries on the list from the same payer or payee. */
  others: readonly EntryToSort[];
  onClose: () => void;
  onSorted: (change: { text: string; undo: () => Promise<void> }) => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const kinds = debtKindsFor(entry.direction);
  const [kind, setKind] = useState<DebtKind | null>(null);
  const [partyId, setPartyId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Party[]>('/api/contributors'),
    staleTime: 30_000,
  });
  const suggested = useMemo(() => suggestedParty(entry.description, parties), [entry.description, parties]);
  // Picked for the person once, when the description names them; theirs to change.
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  useEffect(() => {
    if (suggestionUsed || !suggested) return;
    setSuggestionUsed(true);
    setPartyId(suggested.id);
  }, [suggested, suggestionUsed]);
  const option = kinds.find((one) => one.kind === kind) ?? null;
  const typed = newName.trim();
  const canSave = option !== null && (partyId !== null || typed !== '' || !option.needsPerson);

  const save = async (all: boolean) => {
    if (!option || saving) return;
    setSaving(true);
    const done: EntryToSort[] = [];
    try {
      let person = partyId;
      let personName = parties.find((party) => party.id === partyId)?.name ?? null;
      if (typed !== '') {
        const created = await customFetch<Party>('/api/contributors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: typed, kind: 'person' }),
        });
        person = created.id;
        personName = created.name;
      }
      for (const one of all ? [entry, ...others] : [entry]) {
        await customFetch(`/api/entries-to-sort/${one.id}/debt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: option.kind, partyId: person }),
        });
        done.push(one);
      }
    } catch (error) {
      Alert.alert('Could not sort it out', plainSaveError(error));
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['parties'] }),
        queryClient.invalidateQueries({ queryKey: ['unlinked-debts'] }),
      ]);
      setSaving(false);
    }
    if (done.length === 0) return;
    const who = parties.find((party) => party.id === partyId)?.name ?? (typed || null);
    onSorted({
      text: `${done.length === 1 ? done[0].description : `${done.length} entries`}: ${debtKindLabel(option.kind)}${who ? ` · ${who}` : ''}`,
      undo: async () => {
        for (const one of done) await customFetch(`/api/entries-to-sort/${one.id}/debt`, { method: 'DELETE' });
      },
    });
  };
  const confirm = () => {
    if (others.length === 0) {
      void save(false);
      return;
    }
    Alert.alert(
      `${others.length + 1} entries from ${entry.description}`,
      `Mark all ${others.length + 1} as ${debtKindLabel(option!.kind).toLowerCase()}, or just this one?`,
      [
        { text: 'Just this one', onPress: () => void save(false) },
        { text: `All ${others.length + 1}`, onPress: () => void save(true) },
      ],
    );
  };

  const chip = (on: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted,
  }) as const;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12, maxHeight: '85%' }} testID="sort-debt-sheet">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>A debt</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                {entry.description} · {entry.direction === 'out' ? '−' : '+'}KES {kes(entry.amount)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="sort-debt-close">
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <View style={{ gap: 8 }}>
              {kinds.map((one) => (
                <Pressable key={one.kind} onPress={() => setKind(one.kind)} accessibilityRole="radio" accessibilityState={{ selected: kind === one.kind }} testID={`sort-debt-kind-${one.kind}`}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 12, borderColor: kind === one.kind ? colors.primary : colors.border, backgroundColor: kind === one.kind ? `${colors.primary}14` : 'transparent' }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{one.label}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{one.hint}</Text>
                </Pressable>
              ))}
            </View>
            {option ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Who with?</Text>
                {isLoading ? <ActivityIndicator color={colors.primary} /> : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {parties.map((party) => (
                      <Pressable key={party.id} onPress={() => { setPartyId(partyId === party.id ? null : party.id); setNewName(''); }} accessibilityRole="button" accessibilityState={{ selected: partyId === party.id }} testID={`sort-debt-party-${party.id}`} style={chip(partyId === party.id)}>
                        <Text style={{ color: partyId === party.id ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{party.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <TextInput
                  value={newName}
                  onChangeText={(text) => { setNewName(text); if (text.trim()) setPartyId(null); }}
                  placeholder="Or add someone new"
                  placeholderTextColor={colors.mutedForeground}
                  testID="sort-debt-new-person"
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }}
                />
                {!option.needsPerson && partyId === null && typed === '' ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Not sure who? Save it anyway - Who owes who lists it under "Who was this?" to fill in later.</Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
          <Pressable onPress={confirm} disabled={!canSave || saving} accessibilityRole="button" testID="sort-debt-save"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', opacity: !canSave || saving ? 0.5 : 1 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Save</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
