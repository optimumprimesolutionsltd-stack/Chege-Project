import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetBudgetCategories, useGetGroup } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { applyCoversFor } from '@/hooks/useApplyCovers';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { coversFor, coversKey, coversText, formatCovers } from '@/lib/covers';
import { isNotSure } from '@/lib/entriesToSort';
import { parseStoredRules, payeeKey, payeeName, rulesStorageKey } from '@/lib/payeeLearning';
import { saveRules } from '@/lib/rulesStore';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';

type Entry = { id: number; amount: number; description: string; category: string | null };
type Info = { root: number | null; parts: Array<{ id: number; amount: number; category: string | null; isRoot: boolean }> };
type Row = { category: string; amount: string };

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;
const toNumber = (text: string) => Number(text.replace(/[^0-9.]/g, '')) || 0;

/**
 * One payment, more than one category (api-server lib/transaction-splits): "money
 * sent to her should be to cover rent or school fees" (10 Oct 2026). Split this
 * payment, or say once what this person's money covers - each category's amount
 * a month, then the rest - and every payment to them is split by itself. A split
 * payment shows its parts here, and can be put back together.
 */
export function SplitSheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const { data: categoryList = [] } = useGetBudgetCategories();
  const leaves = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);

  const [info, setInfo] = useState<Info | null>(null);
  const [rows, setRows] = useState<Row[]>([{ category: '', amount: '' }]);
  const [rest, setRest] = useState('');
  const [every, setEvery] = useState(false);
  const [picking, setPicking] = useState<number | 'rest' | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const name = entry ? payeeName(entry.description) || entry.description : '';

  useEffect(() => {
    if (!entry) return;
    setInfo(null);
    setPicking(null);
    setSearch('');
    setBusy(false);
    setRest(entry.category && !isNotSure(entry.category) ? entry.category : '');
    let active = true;
    void (async () => {
      const rules = parseStoredRules(await AsyncStorage.getItem(rulesStorageKey(group?.id)).catch(() => null));
      const kept = coversFor(entry.description, rules);
      if (active && kept) {
        setRows(kept.plan.map((item) => ({ category: item.category, amount: String(item.monthly) })));
        setRest(kept.rest);
        setEvery(true);
      } else if (active) {
        setRows([{ category: '', amount: '' }]);
        setEvery(false);
      }
      const found = await customFetch<Info>('/api/transaction-splits/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: entry.id }),
      }).catch(() => ({ root: null, parts: [] }));
      if (active) setInfo(found);
    })();
    return () => { active = false; };
  }, [entry?.id, group?.id]);

  const filled = rows.filter((row) => row.category && toNumber(row.amount) > 0);
  const taken = filled.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const left = (entry?.amount ?? 0) - taken;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
  };

  const save = async () => {
    if (!entry) return;
    if (filled.length === 0) { Alert.alert('Add a part', 'Choose a category and an amount for at least one part.'); return; }
    if (!rest) { Alert.alert('Where does the rest go?', 'Choose the category for whatever is left.'); return; }
    if (!every && left < 0) { Alert.alert('Too much', `The parts come to ${kes(taken)}, more than the ${kes(entry.amount)} paid.`); return; }
    setBusy(true);
    try {
      if (every) {
        // Said once: kept on the server with the payee rules, and this year's payments to them split now.
        const key = coversKey(entry.description);
        const plan = { plan: filled.map((row) => ({ category: row.category, monthly: toNumber(row.amount) })), rest };
        // Kept as a payee rule, whose value has a limit (api-server routes/payee-rules MAX_VALUE).
        if (formatCovers(plan).length > 200) { Alert.alert('Too many parts', 'Keep it to the few things their money covers each month.'); return; }
        const rules = parseStoredRules(await AsyncStorage.getItem(rulesStorageKey(group?.id)).catch(() => null));
        await saveRules(group?.id, { ...rules, [key]: formatCovers(plan) }, rules);
        const split = await applyCoversFor(queryClient, payeeKey(entry.description), plan, `${new Date().getFullYear()}-01-01`);
        Alert.alert(`${name}'s money`, `Covers ${coversText(plan)}. ${split} ${split === 1 ? 'payment' : 'payments'} this year split by it, and every payment after this splits by itself.`);
      } else {
        await customFetch('/api/transaction-splits/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId: entry.id, parts: filled.map((row) => ({ category: row.category, amount: toNumber(row.amount) })), rest }),
        });
      }
      refresh();
      onClose();
    } catch (error) {
      Alert.alert('Could not split it', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await customFetch('/api/transaction-splits/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: entry.id }),
      });
      refresh();
      onClose();
    } catch (error) {
      Alert.alert('Could not put it back together', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const pickable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? leaves.filter((one) => one.toLowerCase().includes(needle)) : leaves;
  }, [leaves, search]);
  const choose = (category: string) => {
    if (picking === 'rest') setRest(category);
    else if (typeof picking === 'number') setRows((current) => current.map((row, at) => (at === picking ? { ...row, category } : row)));
    setPicking(null);
    setSearch('');
  };

  const split = info && info.parts.length > 1;
  return (
    <Modal visible={entry !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]} testID="split-sheet">
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {picking !== null ? 'Choose a category' : `Split ${kes(entry?.amount ?? 0)} to ${name}`}
            </Text>
            <Pressable onPress={picking !== null ? () => setPicking(null) : onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {picking !== null ? (
            <>
              <CategorySearchBox value={search} onChange={setSearch} testID="split-category-search" />
              <FlatList
                data={pickable}
                keyExtractor={(one) => one}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => choose(item)} style={styles.option} testID={`split-category-${item}`}>
                    <Text style={{ color: colors.foreground }}>{item}</Text>
                  </Pressable>
                )}
              />
            </>
          ) : info === null ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
          ) : split ? (
            <View style={styles.body} testID="split-parts">
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>This payment is split:</Text>
              {info.parts.map((part) => (
                <Text key={part.id} style={{ color: colors.foreground }}>{part.category ?? 'No category'} · {kes(part.amount)}</Text>
              ))}
              <Pressable onPress={() => void undo()} disabled={busy} accessibilityRole="button" testID="split-undo" style={[styles.button, { borderColor: colors.destructive }]}>
                <Text style={[styles.buttonText, { color: colors.destructive }]}>{busy ? 'Putting it back…' : 'Undo the split'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                {every ? `Each month, ${name}'s money fills these first:` : 'What part of it was for what?'}
              </Text>
              {rows.map((row, at) => (
                <View key={at} style={styles.row}>
                  <Pressable onPress={() => setPicking(at)} style={[styles.field, { borderColor: colors.border, flex: 1.4 }]} testID={`split-row-${at}-category`}>
                    <Text style={{ color: row.category ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>{row.category || 'Category…'}</Text>
                  </Pressable>
                  <TextInput
                    value={row.amount}
                    onChangeText={(amount) => setRows((current) => current.map((one, index) => (index === at ? { ...one, amount } : one)))}
                    placeholder="Amount"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    style={[styles.field, { borderColor: colors.border, color: colors.foreground, flex: 1 }]}
                    testID={`split-row-${at}-amount`}
                  />
                </View>
              ))}
              <Pressable onPress={() => setRows((current) => [...current, { category: '', amount: '' }])} accessibilityRole="button" testID="split-add-row">
                <Text style={[styles.link, { color: colors.primary }]}>+ Another part</Text>
              </Pressable>
              <Pressable onPress={() => setPicking('rest')} style={[styles.field, { borderColor: colors.border }]} testID="split-rest">
                <Text style={{ color: rest ? colors.foreground : colors.mutedForeground }}>
                  {every ? 'Then the rest: ' : `The rest${left > 0 ? `, ${kes(left)}` : ''}: `}{rest || 'choose a category…'}
                </Text>
              </Pressable>
              <View style={styles.row}>
                <Switch value={every} onValueChange={setEvery} testID="split-every" />
                <Text style={{ color: colors.foreground, flex: 1 }}>
                  Every payment to {name}: these amounts each month, filled first
                </Text>
              </View>
              <Pressable onPress={() => void save()} disabled={busy} accessibilityRole="button" testID="split-save" style={[styles.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{every ? `Save for ${name}` : 'Split it'}</Text>}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  button: { minHeight: 46, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
