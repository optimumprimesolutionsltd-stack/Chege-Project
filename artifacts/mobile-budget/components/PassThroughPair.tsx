import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetJointAccount } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { partiesToOffer, suggestedParty } from '@/lib/sortAsDebt';
import { pairCandidates, pairSummary, passThroughKinds, type LedgerRow, type PassThroughMode } from '@/lib/passThrough';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';
import { plainSaveError } from '@/lib/saveRetry';

type Party = { id: number; name: string };

/** The entry the sheet was opened on. */
export type PairEntry = { id: number; direction: 'in' | 'out'; amount: number; date: string; description: string; accountId?: number | null };

const kes = (value: number | string) => Number(value).toLocaleString('en-KE', { maximumFractionDigits: 2 });

const MODES: Array<{ mode: PassThroughMode; label: string; hint: string }> = [
  { mode: 'held', label: 'I was holding it for someone', hint: 'Their money came in and went out again. Neither is yours.' },
  { mode: 'settle', label: 'Someone who owed me paid someone I owe', hint: 'Both debts come down by what passed through.' },
];

/** A person picked from Who owes who, or a new name. */
type Pick = { id: number | null; name: string };

function PersonPicker({ title, parties, value, onChange, testID }: {
  title: string; parties: readonly Party[]; value: Pick; onChange: (pick: Pick) => void; testID: string;
}) {
  const colors = useColors();
  const chip = (on: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted,
  }) as const;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {parties.map((party) => (
          <Pressable key={party.id} onPress={() => onChange(value.id === party.id ? { id: null, name: '' } : { id: party.id, name: party.name })}
            accessibilityRole="button" accessibilityState={{ selected: value.id === party.id }} testID={`${testID}-party-${party.id}`} style={chip(value.id === party.id)}>
            <Text style={{ color: value.id === party.id ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{party.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={value.id === null ? value.name : ''}
        onChangeText={(text) => onChange({ id: null, name: text })}
        placeholder="Or add someone new"
        placeholderTextColor={colors.mutedForeground}
        testID={`${testID}-new`}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }}
      />
    </View>
  );
}

/**
 * "Passed through my M-Pesa": an entry and its other half, both already
 * imported, sorted out together (lib/passThrough).
 */
export function PassThroughPair({ entry, mode: startMode = 'held', onClose, onDone }: {
  entry: PairEntry;
  /** Which kind it opens on: the choice tapped on Sort them out. */
  mode?: PassThroughMode;
  onClose: () => void;
  onDone: (change: { text: string; ids: number[]; undo: () => Promise<void> }) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = entry.accountId ? { accountId: entry.accountId } : undefined;
  const { data: ledger, isLoading: loadingLedger } = useGetJointAccount(params, {
    query: { queryKey: getGetJointAccountQueryKey(params), staleTime: 60_000 },
  });
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Party[]>('/api/contributors'),
    staleTime: 30_000,
  });

  const [mode, setMode] = useState<PassThroughMode>(startMode);
  const [otherId, setOtherId] = useState<number | null>(null);
  const [owner, setOwner] = useState<Pick>({ id: null, name: '' });
  const [payee, setPayee] = useState<Pick>({ id: null, name: '' });
  const [saving, setSaving] = useState(false);
  // Suggested once; after the person picks or clears someone, theirs to keep.
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [payeeTouched, setPayeeTouched] = useState(false);

  const rows = ((ledger as { transactions?: LedgerRow[] } | undefined)?.transactions ?? []) as LedgerRow[];
  const candidates = useMemo(() => pairCandidates(entry, rows), [entry, rows]);
  const other = candidates.find((row) => row.id === otherId) ?? null;
  // The same amount on the nearest day is picked for the person; theirs to change.
  const [otherPicked, setOtherPicked] = useState(false);
  useEffect(() => {
    if (otherPicked || candidates.length === 0) return;
    setOtherPicked(true);
    if (Math.round(Number(candidates[0].amount) * 100) === Math.round(entry.amount * 100)) setOtherId(candidates[0].id);
  }, [candidates, entry.amount, otherPicked]);

  const inDescription = entry.direction === 'in' ? entry.description : other?.description ?? '';
  const outDescription = entry.direction === 'out' ? entry.description : other?.description ?? '';
  // Whose money it was is who sent it in; who was paid is who it went out to.
  useEffect(() => {
    if (ownerTouched || owner.id !== null || owner.name !== '') return;
    const found = suggestedParty(inDescription, parties);
    if (found) setOwner({ id: found.id, name: found.name });
  }, [inDescription, parties, owner, ownerTouched]);
  useEffect(() => {
    if (payeeTouched || payee.id !== null || payee.name !== '') return;
    const found = suggestedParty(outDescription, parties);
    if (found) setPayee({ id: found.id, name: found.name });
  }, [outDescription, parties, payee, payeeTouched]);

  const offered = useMemo(() => partiesToOffer(parties, null), [parties]);
  const named = (pick: Pick) => pick.id !== null || pick.name.trim() !== '';
  const canSave = other !== null && named(owner) && (mode === 'held' || named(payee)) && !saving;

  const resolve = async (pick: Pick): Promise<Party> => {
    if (pick.id !== null) return { id: pick.id, name: pick.name };
    return customFetch<Party>('/api/contributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pick.name.trim(), kind: 'person' }),
    });
  };
  const sortAs = (id: number, kind: string, partyId: number) => customFetch(`/api/entries-to-sort/${id}/debt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, partyId }),
  });
  const putBack = (id: number) => customFetch(`/api/entries-to-sort/${id}/debt`, { method: 'DELETE' });

  const save = async () => {
    if (!canSave || !other) return;
    setSaving(true);
    const inId = entry.direction === 'in' ? entry.id : other.id;
    const outId = entry.direction === 'out' ? entry.id : other.id;
    const kinds = passThroughKinds(mode);
    let inDone = false;
    try {
      const ownerParty = await resolve(owner);
      // The same name typed twice is one new person, not two.
      const payeeParty = mode === 'held'
        ? ownerParty
        : !named(payee) || (payee.id === null && payee.name.trim().toLowerCase() === ownerParty.name.trim().toLowerCase())
          ? ownerParty
          : await resolve(payee);
      if (mode === 'settle' && payeeParty.id === ownerParty.id) {
        Alert.alert('They are the same person', 'Pick who paid you back and who you paid - two different people. Or choose "I was holding it for someone".');
        return;
      }
      // Money in first, as it happened. If the money out cannot be saved, the
      // money in is put back, so the pair is never left half done.
      await sortAs(inId, kinds.in, ownerParty.id);
      inDone = true;
      await sortAs(outId, kinds.out, payeeParty.id);
      onDone({
        text: pairSummary(mode, { owner: ownerParty.name, payee: payeeParty.name }),
        ids: [inId, outId],
        undo: async () => { await putBack(outId); await putBack(inId); },
      });
    } catch (error) {
      if (inDone) await putBack(inId).catch(() => {});
      Alert.alert('Could not sort them out', plainSaveError(error));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      void queryClient.invalidateQueries({ queryKey: ['unlinked-debts'] });
      void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
      setSaving(false);
    }
  };

  const card = (on: boolean) => ({
    borderWidth: 1, borderRadius: 8, padding: 12,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : 'transparent',
  }) as const;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 4, gap: 12, maxHeight: '90%' }} testID="pass-through-pair-sheet">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Passed through my M-Pesa</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                {entry.description} · {entry.direction === 'out' ? '−' : '+'}KES {kes(entry.amount)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="pass-through-pair-close">
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              {MODES.map((one) => (
                <Pressable key={one.mode} onPress={() => setMode(one.mode)} accessibilityRole="radio" accessibilityState={{ selected: mode === one.mode }} testID={`pass-through-mode-${one.mode}`} style={card(mode === one.mode)}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{one.label}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{one.hint}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                {entry.direction === 'in' ? 'Where did it go out?' : 'Where did it come in?'}
              </Text>
              {loadingLedger ? <ActivityIndicator color={colors.primary} /> : candidates.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }} testID="pass-through-no-candidates">
                  No {entry.direction === 'in' ? 'money out' : 'money in'} within a week of {entry.date} that could be the other half.
                </Text>
              ) : candidates.map((row) => (
                <Pressable key={row.id} onPress={() => setOtherId(otherId === row.id ? null : row.id)} accessibilityRole="radio" accessibilityState={{ selected: otherId === row.id }} testID={`pass-through-other-${row.id}`}
                  style={[card(otherId === row.id), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }} numberOfLines={1}>{row.description || '—'}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{row.date.slice(0, 10)}</Text>
                  </View>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                    {row.type === 'deposit' ? '+' : '−'}KES {kes(row.amount)}
                  </Text>
                </Pressable>
              ))}
              {other && Math.round(Number(other.amount) * 100) !== Math.round(entry.amount * 100) ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }} testID="pass-through-amounts-differ">
                  The amounts differ by KES {kes(Math.abs(Number(other.amount) - entry.amount))}. Each entry keeps its own amount.
                </Text>
              ) : null}
            </View>

            <PersonPicker
              title={mode === 'held' ? 'Whose money was it?' : 'Who paid you back?'}
              parties={offered}
              value={owner}
              onChange={(pick) => { setOwnerTouched(true); setOwner(pick); }}
              testID="pass-through-owner"
            />
            {mode === 'settle' ? (
              <PersonPicker title="Who did you pay?" parties={offered} value={payee} onChange={(pick) => { setPayeeTouched(true); setPayee(pick); }} testID="pass-through-payee" />
            ) : null}
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {mode === 'held'
                ? 'The money in is saved as borrowed from them and the money out as paid back to them, so neither counts as income or spending.'
                : 'The money in is saved as them paying you back and the money out as paying the one you owe, so neither counts as income or spending.'}
            </Text>
          </ScrollView>
          <Pressable onPress={() => void save()} disabled={!canSave} accessibilityRole="button" testID="pass-through-pair-save"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', opacity: canSave ? 1 : 0.5 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Save both</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
