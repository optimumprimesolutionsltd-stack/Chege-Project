import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Unlinked = { id: number; kind: 'borrowed' | 'lend'; amount: number; date: string; description: string; suggestedPartyId: number | null };
type Party = { id: number; name: string };

const kes = (n: number) => Math.round(n).toLocaleString('en-KE');
const SHOWN = 25;

/**
 * Borrowed and lent entries with nobody behind them - "Who was this?".
 *
 * Reports counted every borrowing and loan, but Who owes who only counts what
 * is linked to a person, and entries saved before people were kept with them
 * (or by a save Jamvi was closed in the middle of) have none. So it showed
 * nobody owing anything while Reports said 350,000 was borrowed. Each entry
 * here is given its person in one tap - the one its description names first -
 * and Work it out then counts it.
 */
export function UnlinkedDebts({ parties, onLinked, onWorkOut }: { parties: readonly Party[]; onLinked: () => void; onWorkOut: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [linking, setLinking] = useState<number | 'all' | null>(null);
  // How many were linked here: once some are, Work it out is what counts them.
  const [linked, setLinked] = useState(0);
  const { data } = useQuery<{ entries: Unlinked[] }>({
    queryKey: ['unlinked-debts'],
    queryFn: () => customFetch<{ entries: Unlinked[] }>('/api/contributors/unlinked-debts'),
    staleTime: 30_000,
  });
  const entries = data?.entries ?? [];
  const workOutNote = linked > 0 ? (
    <Pressable onPress={onWorkOut} accessibilityRole="button" testID="parties-unlinked-work-out" style={{ marginTop: 8 }}>
      <Text style={[styles.link, { color: colors.primary }]}>{linked} linked. Work it out from my entries to update the balances</Text>
    </Pressable>
  ) : null;
  if (entries.length === 0) return workOutNote ? <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.card }]}>{workOutNote}</View> : null;

  const borrowed = entries.filter((entry) => entry.kind === 'borrowed').reduce((sum, entry) => sum + entry.amount, 0);
  const lent = entries.filter((entry) => entry.kind === 'lend').reduce((sum, entry) => sum + entry.amount, 0);
  const suggested = entries.filter((entry) => entry.suggestedPartyId !== null);
  const nameOf = (id: number | null) => parties.find((party) => party.id === id)?.name ?? '';

  const link = async (links: Array<{ transactionId: number; partyId: number; kind: 'borrowed' | 'lend' }>, which: number | 'all') => {
    if (linking !== null || links.length === 0) return;
    setLinking(which);
    try {
      for (let start = 0; start < links.length; start += 500) {
        await customFetch('/api/debt-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: links.slice(start, start + 500) }),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['unlinked-debts'] });
      setLinked((count) => count + links.length);
      onLinked();
    } catch (error: unknown) {
      Alert.alert('Could not link them', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLinking(null);
    }
  };

  const shown = showAll ? entries : entries.slice(0, SHOWN);
  return (
    <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.card }]} testID="parties-unlinked">
      <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="parties-unlinked-toggle">
        <Text style={[styles.title, { color: colors.foreground }]}>Who was this? {entries.length} {entries.length === 1 ? 'entry has' : 'entries have'} nobody linked</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {[borrowed > 0 ? `KES ${kes(borrowed)} borrowed` : null, lent > 0 ? `KES ${kes(lent)} lent` : null].filter(Boolean).join(' · ')} - not counted here until you say who it was with.
        </Text>
        <Text style={[styles.link, { color: colors.primary }]}>{open ? 'Hide' : 'Say who'}</Text>
      </Pressable>
      {workOutNote}

      {open ? (
        <View style={{ marginTop: 8 }}>
          {suggested.length > 1 ? (
            <Pressable
              onPress={() => void link(suggested.map((entry) => ({ transactionId: entry.id, partyId: entry.suggestedPartyId!, kind: entry.kind })), 'all')}
              disabled={linking !== null}
              style={[styles.allButton, { backgroundColor: colors.primary, opacity: linking !== null ? 0.6 : 1 }]}
              accessibilityRole="button"
              testID="parties-unlinked-link-suggested"
            >
              {linking === 'all' ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Link the {suggested.length} named in their description</Text>
              )}
            </Pressable>
          ) : null}
          {parties.length === 0 ? (
            <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 6 }]}>Add the people or lenders below first, then say who each entry was with.</Text>
          ) : null}
          {shown.map((entry) => {
            const order = [...parties].sort((a, b) => (a.id === entry.suggestedPartyId ? -1 : b.id === entry.suggestedPartyId ? 1 : 0));
            return (
              <View key={entry.id} style={[styles.entry, { borderColor: colors.border }]} testID={`parties-unlinked-${entry.id}`}>
                <View style={styles.entryTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.entryLabel, { color: colors.foreground }]} numberOfLines={1}>{entry.description || (entry.kind === 'borrowed' ? 'Borrowed' : 'Lent')}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>{entry.kind === 'borrowed' ? 'Borrowed' : 'Lent'} · {entry.date}</Text>
                  </View>
                  <Text style={[styles.entryAmount, { color: entry.kind === 'borrowed' ? '#f87171' : '#22c55e' }]}>KES {kes(entry.amount)}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 6 }}>
                  {order.map((party) => {
                    const isSuggested = party.id === entry.suggestedPartyId;
                    return (
                      <Pressable
                        key={party.id}
                        onPress={() => void link([{ transactionId: entry.id, partyId: party.id, kind: entry.kind }], entry.id)}
                        disabled={linking !== null}
                        style={[styles.chip, { borderColor: isSuggested ? colors.primary : colors.border, backgroundColor: isSuggested ? colors.primary + '1f' : colors.muted }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${entry.kind === 'borrowed' ? 'Borrowed from' : 'Lent to'} ${party.name}`}
                        testID={`parties-unlinked-${entry.id}-party-${party.id}`}
                      >
                        {isSuggested ? <Feather name="star" size={11} color={colors.primary} /> : null}
                        <Text style={{ color: isSuggested ? colors.primary : colors.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{party.name}</Text>
                      </Pressable>
                    );
                  })}
                  {linking === entry.id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </ScrollView>
                {entry.suggestedPartyId !== null ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Suggested: {nameOf(entry.suggestedPartyId)}</Text> : null}
              </View>
            );
          })}
          {entries.length > SHOWN ? (
            <Pressable onPress={() => setShowAll((value) => !value)} hitSlop={8} accessibilityRole="button" style={{ paddingTop: 8 }}>
              <Text style={[styles.link, { color: colors.primary }]}>{showAll ? 'Show fewer' : `Show all ${entries.length}`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  allButton: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 6 },
  entry: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  entryAmount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
