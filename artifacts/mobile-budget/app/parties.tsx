/**
 * Creditors and debtors: everybody money stands between you and.
 *
 * These existed already — a party with owedByUs is a creditor, one with
 * owedToUs is a debtor, and KCB is as much a creditor as Mwangi is. But they
 * could only be made inside the banking sheet, at the moment of a posting,
 * and once made there was nowhere to see them or correct a figure. An opening
 * balance typed wrong stayed wrong.
 *
 * Both directions are shown, and both can be set on one person, because the
 * schema has always held two columns rather than one signed number: a chama
 * member can owe the kitty and be owed by it at the same time, and netting
 * them off hides both. Somebody who is a debtor this month and a creditor the
 * next is not two people.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { handleLapsedError } from '@/lib/lapsedError';
import { readAmount, toMoney } from '@/lib/bankAmount';
import { customFetch } from '@workspace/api-client-react';

type Party = {
  id: number;
  name: string;
  kind?: string | null;
  owedToUs?: number | null;
  owedByUs?: number | null;
};

function formatKES(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * What somebody typed into a balance box.
 *
 * Blank is not zero. Blank means the balance is not tracked; zero means it is
 * tracked and settled, which is worth being able to say and worth seeing.
 */
function readBalance(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null;
  const parsed = readAmount(value);
  if (parsed === null || parsed < 0) return 'invalid';
  return toMoney(parsed);
}

export default function PartiesScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Party[]>('/api/contributors'),
    staleTime: 30_000,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // One draft, shared by the add form and whichever row is open: only one can
  // be open at a time, and two drafts would be two ways to lose one.
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState<'person' | 'institution'>('person');
  const [draftOwedByUs, setDraftOwedByUs] = useState('');
  const [draftOwedToUs, setDraftOwedToUs] = useState('');

  const totals = useMemo(() => {
    let owe = 0;
    let owed = 0;
    for (const party of parties) {
      if (typeof party.owedByUs === 'number') owe += party.owedByUs;
      if (typeof party.owedToUs === 'number') owed += party.owedToUs;
    }
    return { owe: toMoney(owe), owed: toMoney(owed), net: toMoney(owed - owe) };
  }, [parties]);

  const creditors = parties.filter((party) => typeof party.owedByUs === 'number');
  const debtors = parties.filter((party) => typeof party.owedToUs === 'number');
  const untracked = parties.filter(
    (party) => typeof party.owedByUs !== 'number' && typeof party.owedToUs !== 'number',
  );

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraftName('');
    setDraftKind('person');
    setDraftOwedByUs('');
    setDraftOwedToUs('');
  };

  const startEdit = (party: Party) => {
    setAdding(false);
    setEditingId(party.id);
    setDraftName(party.name);
    setDraftKind(party.kind === 'institution' ? 'institution' : 'person');
    setDraftOwedByUs(typeof party.owedByUs === 'number' ? String(party.owedByUs) : '');
    setDraftOwedToUs(typeof party.owedToUs === 'number' ? String(party.owedToUs) : '');
  };

  const closeDraft = () => {
    setAdding(false);
    setEditingId(null);
  };

  const saveDraft = async () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Who is it?', 'Give the person or institution a name, such as Mwangi or KCB.');
      return;
    }
    const owedByUs = readBalance(draftOwedByUs);
    const owedToUs = readBalance(draftOwedToUs);
    if (owedByUs === 'invalid' || owedToUs === 'invalid') {
      Alert.alert('Check the balances', 'Enter zero or more, with up to two decimal places. Leave blank for not tracked.');
      return;
    }

    setBusy(true);
    try {
      // Both directions are sent, including null, so clearing a box really
      // stops tracking it rather than leaving the old figure behind.
      const body = JSON.stringify({ name, kind: draftKind, owedByUs, owedToUs });
      if (editingId === null) {
        await customFetch('/api/contributors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } else {
        await customFetch(`/api/contributors/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      closeDraft();
    } catch (error: unknown) {
      if (!handleLapsedError(error)) {
        Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const draftForm = (
    <View style={[styles.draft, { borderColor: colors.primary, backgroundColor: `${colors.primary}0e` }]} testID="parties-draft">
      <TextInput
        value={draftName}
        onChangeText={setDraftName}
        placeholder="Name, e.g. Mwangi or KCB"
        placeholderTextColor={colors.mutedForeground}
        testID="parties-draft-name"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
      />
      <View style={styles.kindRow}>
        {(['person', 'institution'] as const).map((kind) => (
          <TouchableOpacity
            key={kind}
            onPress={() => setDraftKind(kind)}
            testID={`parties-draft-kind-${kind}`}
            style={[
              styles.kindChip,
              {
                borderColor: draftKind === kind ? colors.primary : colors.border,
                backgroundColor: draftKind === kind ? `${colors.primary}18` : 'transparent',
              },
            ]}
          >
            <Text style={{ color: draftKind === kind ? colors.primary : colors.mutedForeground, fontSize: 12 }}>
              {kind === 'person' ? 'A person' : 'A bank or business'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Both, on one person, because somebody can be each at once. */}
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>I owe them</Text>
      <TextInput
        value={draftOwedByUs}
        onChangeText={setDraftOwedByUs}
        placeholder="Blank if not tracked"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        testID="parties-draft-owed-by-us"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
      />
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>They owe me</Text>
      <TextInput
        value={draftOwedToUs}
        onChangeText={setDraftOwedToUs}
        placeholder="Blank if not tracked"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        testID="parties-draft-owed-to-us"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
      />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
        Blank is not the same as zero. Blank means the balance is not tracked; zero means it is tracked and settled.
      </Text>

      <View style={styles.draftActions}>
        <Pressable onPress={closeDraft} testID="parties-draft-cancel" style={styles.draftCancel}>
          <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
        </Pressable>
        <TouchableOpacity
          onPress={() => void saveDraft()}
          disabled={busy}
          testID="parties-draft-save"
          style={[styles.draftSave, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderParty = (party: Party, direction: 'owe' | 'owed' | 'none') => {
    const isBoth = typeof party.owedByUs === 'number' && typeof party.owedToUs === 'number';
    const figure =
      direction === 'owe' ? party.owedByUs ?? 0 : direction === 'owed' ? party.owedToUs ?? 0 : null;
    return (
      <View key={`${direction}-${party.id}`}>
        <Pressable
          onPress={() => (editingId === party.id ? closeDraft() : startEdit(party))}
          testID={`parties-row-${party.id}`}
          style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
              {party.name}
              {party.kind === 'institution' ? ' · institution' : ''}
            </Text>
            {isBoth ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }} testID={`parties-both-${party.id}`}>
                Owes you KES {formatKES(party.owedToUs)} · you owe KES {formatKES(party.owedByUs)}
              </Text>
            ) : null}
          </View>
          {figure === null ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Nothing tracked</Text>
          ) : (
            <Text style={{ color: direction === 'owe' ? '#f87171' : '#22c55e', fontFamily: 'Inter_700Bold' }}>
              KES {formatKES(figure)}
            </Text>
          )}
          <Feather name="edit-2" size={14} color={colors.mutedForeground} />
        </Pressable>
        {editingId === party.id ? draftForm : null}
      </View>
    );
  };

  return (
    <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} testID="parties-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Creditors and debtors</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Everybody money stands between you and — people and institutions alike. A loan from a bank sits here the same
        way money owed to a neighbour does.
      </Text>

      <View style={[styles.totals, { borderColor: colors.border, backgroundColor: colors.card }]} testID="parties-totals">
        <View style={styles.totalCell}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>YOU OWE</Text>
          <Text style={{ color: '#f87171', fontFamily: 'Inter_700Bold', fontSize: 17 }}>KES {formatKES(totals.owe)}</Text>
        </View>
        <View style={styles.totalCell}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>OWED TO YOU</Text>
          <Text style={{ color: '#22c55e', fontFamily: 'Inter_700Bold', fontSize: 17 }}>KES {formatKES(totals.owed)}</Text>
        </View>
      </View>
      {/* Shown, never stored: the two columns stay apart so neither is hidden. */}
      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }} testID="parties-net">
        Net: {totals.net >= 0 ? 'KES ' + formatKES(totals.net) + ' in your favour' : 'KES ' + formatKES(Math.abs(totals.net)) + ' against you'}
      </Text>

      <TouchableOpacity onPress={startAdd} testID="parties-add" style={[styles.addBtn, { borderColor: colors.primary }]}>
        <Feather name="plus" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Add somebody</Text>
      </TouchableOpacity>
      {adding ? draftForm : null}

      {isLoading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} /> : null}

      {creditors.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>YOU OWE THEM — CREDITORS</Text>
          {creditors.map((party) => renderParty(party, 'owe'))}
        </>
      ) : null}

      {debtors.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>THEY OWE YOU — DEBTORS</Text>
          {debtors.map((party) => renderParty(party, 'owed'))}
        </>
      ) : null}

      {untracked.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>NO BALANCE TRACKED</Text>
          {untracked.map((party) => renderParty(party, 'none'))}
        </>
      ) : null}

      {!isLoading && parties.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 24, lineHeight: 19 }} testID="parties-empty">
          Nobody recorded yet. Add whoever you owe or whoever owes you — then paying them, or being paid, can be
          recorded on the Banking tab and the balance offered against it.
        </Text>
      ) : null}
    </PageScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  totals: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  totalCell: { flex: 1, gap: 2 },
  section: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, height: 46, marginTop: 16 },
  draft: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10, marginBottom: 10, gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44, fontFamily: 'Inter_400Regular' },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  draftActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 6 },
  draftCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  draftSave: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 22 },
});
