import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetBudgetCategories } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { isNotSure } from '@/lib/entriesToSort';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;

/**
 * Money moved from one category to another for a month (api-server
 * lib/transaction-splits moveBetween): "maybe at the end of the month user can
 * post the journals to align the categories" (10 Oct 2026). Taken from that
 * month's entries under the category, newest first, with a note saying why.
 * Undone from the entry it made, on Bank (Split this payment -> Undo).
 */
export function MoveMoneySheet({ from, month, year, onClose }: { from: string | null; month: number; year: number; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: categoryList = [] } = useGetBudgetCategories();
  const leaves = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name) && row.name !== from).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList, from]);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTo('');
    setAmount('');
    setNote('');
    setPicking(false);
    setSearch('');
  }, [from]);

  const pickable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? leaves.filter((one) => one.toLowerCase().includes(needle)) : leaves;
  }, [leaves, search]);

  const move = async () => {
    const value = Number(amount.replace(/[^0-9.]/g, '')) || 0;
    if (!from || !to || value <= 0) { Alert.alert('Almost', 'Choose where it goes, and how much.'); return; }
    setBusy(true);
    try {
      const { moved } = await customFetch<{ moved: number }>('/api/transaction-splits/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, amount: value, month, year, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
      Alert.alert(
        moved > 0 ? 'Moved' : 'Nothing to move',
        moved <= 0
          ? `${from} has no spending in ${MONTHS[month - 1]} to move.`
          : moved < value
            ? `${kes(moved)} moved from ${from} to ${to} - all ${from} had in ${MONTHS[month - 1]}.`
            : `${kes(moved)} moved from ${from} to ${to} for ${MONTHS[month - 1]}.`,
      );
      onClose();
    } catch (error) {
      Alert.alert('Could not move it', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={from !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]} testID="move-money-sheet">
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.foreground }]}>{picking ? 'Move it to…' : `Move money from ${from ?? ''}`}</Text>
            <Pressable onPress={picking ? () => setPicking(false) : onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {picking ? (
            <>
              <CategorySearchBox value={search} onChange={setSearch} testID="move-money-search" />
              <FlatList
                data={pickable}
                keyExtractor={(one) => one}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => { setTo(item); setPicking(false); setSearch(''); }} style={styles.option} testID={`move-money-to-${item}`}>
                    <Text style={{ color: colors.foreground }}>{item}</Text>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <View style={styles.body}>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                For {MONTHS[month - 1]} {year}: money spent under {from} that was really for something else - rent Jane paid from what you sent her, say.
              </Text>
              <Pressable onPress={() => setPicking(true)} style={[styles.field, { borderColor: colors.border }]} testID="move-money-to">
                <Text style={{ color: to ? colors.foreground : colors.mutedForeground }}>{to ? `To ${to}` : 'To which category…'}</Text>
              </Pressable>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="How much"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.field, { borderColor: colors.border, color: colors.foreground }]}
                testID="move-money-amount"
              />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Why (optional), such as Rent paid by Jane"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.field, { borderColor: colors.border, color: colors.foreground }]}
                testID="move-money-note"
              />
              <Pressable onPress={() => void move()} disabled={busy} accessibilityRole="button" testID="move-money-save" style={[styles.button, { backgroundColor: colors.primary }]}>
                {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Move it</Text>}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '85%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold', flex: 1 },
  body: { paddingHorizontal: 16, gap: 10 },
  hint: { fontSize: 13, lineHeight: 18 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  button: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
