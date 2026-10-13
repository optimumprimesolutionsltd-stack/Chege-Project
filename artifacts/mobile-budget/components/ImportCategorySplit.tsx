import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useGetBudgetCategories } from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { isNotSure } from '@/lib/entriesToSort';
import type { CategoryPart } from '@/lib/mpesaImport';

type Row = { category: string; amount: string };

const kes = (value: number) => `KES ${(Math.round(value * 100) / 100).toLocaleString('en-KE')}`;
const toNumber = (text: string) => Number(text.replace(/[^0-9.]/g, '')) || 0;

/**
 * One M-Pesa payment, more than one category, chosen before it is saved - as Log
 * Expense splits one expense: "its 10,000 is not split but the category is the one
 * that is split" (13 Oct 2026). The line's own category keeps the rest; each row
 * here is another category's share. Saved with the line (lib/mpesaImport
 * categorySplitOf), and Bank shows the payment whole with its shares under it.
 */
export function ImportCategorySplit({
  line,
  onSave,
  onClose,
}: {
  line: { index: number; amount: number; payee: string; category: string; parts: CategoryPart[] } | null;
  onSave: (index: number, parts: CategoryPart[]) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: categoryList = [] } = useGetBudgetCategories();
  // Only categories that take an amount: a heading only totals its children.
  const leaves = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);

  const [rows, setRows] = useState<Row[]>([{ category: '', amount: '' }]);
  const [picking, setPicking] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!line) return;
    setRows(line.parts.length > 0 ? line.parts.map((part) => ({ category: part.category, amount: String(part.amount) })) : [{ category: '', amount: '' }]);
    setPicking(null);
    setSearch('');
  }, [line?.index]);

  const filled = rows.filter((row) => row.category && toNumber(row.amount) > 0);
  const taken = filled.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const left = Math.round(((line?.amount ?? 0) - taken) * 100) / 100;

  const pickable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const others = leaves.filter((one) => one !== line?.category);
    return needle ? others.filter((one) => one.toLowerCase().includes(needle)) : others;
  }, [leaves, search, line?.category]);

  const save = () => {
    if (!line) return;
    if (left <= 0) {
      Alert.alert('Too much', `The parts come to ${kes(taken)}. Leave some of the ${kes(line.amount)} for ${line.category}.`);
      return;
    }
    onSave(line.index, filled.map((row) => ({ category: row.category, amount: toNumber(row.amount) })));
    onClose();
  };

  return (
    <Modal visible={line !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]} testID="import-category-split">
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {picking !== null ? 'Choose a category' : `Split ${kes(line?.amount ?? 0)} to ${line?.payee ?? ''}`}
            </Text>
            <Pressable onPress={picking !== null ? () => setPicking(null) : onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {picking !== null ? (
            <>
              <CategorySearchBox value={search} onChange={setSearch} testID="import-split-category-search" />
              <FlatList
                data={pickable}
                keyExtractor={(one) => one}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setRows((current) => current.map((row, at) => (at === picking ? { ...row, category: item } : row)));
                      setPicking(null);
                      setSearch('');
                    }}
                    style={styles.option}
                    testID={`import-split-category-${item}`}
                  >
                    <Text style={{ color: colors.foreground }}>{item}</Text>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <View style={styles.body}>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                One payment, saved once. What part of it was for what?
              </Text>
              {rows.map((row, at) => (
                <View key={at} style={styles.row}>
                  <Pressable onPress={() => setPicking(at)} style={[styles.field, { borderColor: colors.border, flex: 1.4 }]} testID={`import-split-row-${at}-category`}>
                    <Text style={{ color: row.category ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>{row.category || 'Category…'}</Text>
                  </Pressable>
                  <TextInput
                    value={row.amount}
                    onChangeText={(amount) => setRows((current) => current.map((one, index) => (index === at ? { ...one, amount } : one)))}
                    placeholder="Amount"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    style={[styles.field, { borderColor: colors.border, color: colors.foreground, flex: 1 }]}
                    testID={`import-split-row-${at}-amount`}
                  />
                  <Pressable
                    onPress={() => setRows((current) => (current.length > 1 ? current.filter((_, index) => index !== at) : [{ category: '', amount: '' }]))}
                    hitSlop={8}
                    accessibilityLabel="Remove this part"
                    testID={`import-split-row-${at}-remove`}
                  >
                    <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => setRows((current) => [...current, { category: '', amount: '' }])} accessibilityRole="button" testID="import-split-add-row">
                <Text style={[styles.link, { color: colors.primary }]}>+ Another category</Text>
              </Pressable>
              <Text style={{ color: left > 0 ? colors.foreground : colors.destructive }} testID="import-split-rest">
                The rest, {kes(Math.max(0, left))}: {line?.category}
              </Text>
              <Pressable onPress={save} accessibilityRole="button" testID="import-split-save" style={[styles.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{filled.length > 0 ? 'Keep this split' : 'No split'}</Text>
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
