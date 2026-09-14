import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { formatInterestRate, rankDebtsForPayoff, type DebtCategory, type PayoffStrategy } from '@/lib/debts';

const QUERY_KEY = ['budget-categories-full'];

const STRATEGY_COPY: Record<PayoffStrategy, { label: string; hint: string }> = {
  snowball: { label: 'Snowball', hint: 'Smallest balance first — quick wins that keep a plan going.' },
  avalanche: { label: 'Avalanche', hint: 'Highest interest rate first — costs the least overall.' },
};

function toDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * A debt is a budget category with a balance and interest rate tracked on
 * it — no separate ledger. Ranks tracked debts by snowball or avalanche, and
 * lets a manager tag a category as a debt or update its balance directly.
 */
export function DebtPayoffCard({ canManage }: { canManage: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [strategy, setStrategy] = useState<PayoffStrategy>('snowball');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [editRate, setEditRate] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newRate, setNewRate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: categories = [], isLoading } = useQuery<DebtCategory[]>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<DebtCategory[]>('/api/budget-categories'),
    staleTime: 30_000,
  });

  const ranked = rankDebtsForPayoff(categories, strategy);

  const startEditing = (debt: DebtCategory) => {
    setEditingId(debt.id);
    setEditBalance(String(debt.debtBalance ?? 0));
    setEditRate(debt.debtInterestRateBps != null ? String(debt.debtInterestRateBps / 100) : '');
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await customFetch(`/api/budget-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debtBalance: Math.max(0, Number(toDigits(editBalance)) || 0),
          debtInterestRateBps: editRate.trim() ? Math.round(Number(editRate) * 100) : null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setEditingId(null);
    } catch (error) {
      Alert.alert('Could not update this debt', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const stopTracking = async (id: number, name: string) => {
    Alert.alert('Stop tracking this debt?', `${name} stays as a spending category — only the balance and rate are cleared.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop tracking', style: 'destructive', onPress: () => void (async () => {
          try {
            await customFetch(`/api/budget-categories/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ debtBalance: null, debtInterestRateBps: null }),
            });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          } catch (error) {
            Alert.alert('Could not update this debt', error instanceof Error ? error.message : 'Please try again.');
          }
        })(),
      },
    ]);
  };

  const addDebt = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Name required', 'What is this debt called? e.g. Fuliza, SACCO loan.');
      return;
    }
    setSaving(true);
    try {
      const debtBalance = Math.max(0, Number(toDigits(newBalance)) || 0);
      const debtInterestRateBps = newRate.trim() ? Math.round(Number(newRate) * 100) : null;
      const existing = categories.find((category) => category.name.trim().toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
      if (existing) {
        await customFetch(`/api/budget-categories/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ debtBalance, debtInterestRateBps }),
        });
      } else {
        await customFetch('/api/budget-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, budgetAmount: 0, debtBalance, debtInterestRateBps }),
        });
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setNewName('');
      setNewBalance('');
      setNewRate('');
      setAddingNew(false);
    } catch (error) {
      Alert.alert('Could not track this debt', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.card, { borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <Feather name="trending-down" size={16} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>Debt payoff order</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Track a balance on any category — Fuliza, a SACCO loan, a shopkeeper's debt — and see which to pay off first.
      </Text>

      {ranked.length > 0 ? (
        <>
          <View style={styles.strategyRow}>
            {(Object.keys(STRATEGY_COPY) as PayoffStrategy[]).map((value) => {
              const selected = strategy === value;
              return (
                <Pressable
                  key={value}
                  testID={`debt-strategy-${value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setStrategy(value)}
                  style={[styles.strategyChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : 'transparent' }]}
                >
                  <Text style={[styles.strategyLabel, { color: selected ? colors.primary : colors.foreground }]}>{STRATEGY_COPY[value].label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>{STRATEGY_COPY[strategy].hint}</Text>

          {ranked.map((debt, index) => (
            <View key={debt.id} style={[styles.debtRow, { borderColor: colors.border }]}>
              <View style={[styles.rank, { backgroundColor: index === 0 ? colors.primary : colors.background, borderColor: colors.border }]}>
                <Text style={[styles.rankText, { color: index === 0 ? colors.primaryForeground : colors.mutedForeground }]}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.debtName, { color: colors.foreground }]}>{debt.name}</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                  KES {debt.debtBalance!.toLocaleString('en-KE')} · {formatInterestRate(debt.debtInterestRateBps)}
                </Text>
                {editingId === debt.id ? (
                  <View style={styles.editForm}>
                    <TextInput
                      testID={`debt-balance-input-${debt.id}`}
                      keyboardType="number-pad"
                      value={editBalance}
                      onChangeText={(value) => setEditBalance(toDigits(value))}
                      placeholder="Balance (KES)"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    />
                    <TextInput
                      testID={`debt-rate-input-${debt.id}`}
                      keyboardType="decimal-pad"
                      value={editRate}
                      onChangeText={setEditRate}
                      placeholder="Rate % per year (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    />
                    <View style={styles.editActions}>
                      <Pressable testID={`debt-save-${debt.id}`} disabled={saving} onPress={() => void saveEdit(debt.id)} style={[styles.smallBtn, { backgroundColor: colors.primary }]}>
                        {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.smallBtnText, { color: colors.primaryForeground }]}>Save</Text>}
                      </Pressable>
                      <Pressable onPress={() => setEditingId(null)} style={styles.smallBtn}>
                        <Text style={[styles.smallBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : canManage ? (
                  <View style={styles.editActions}>
                    <Pressable testID={`debt-edit-${debt.id}`} onPress={() => startEditing(debt)}>
                      <Text style={[styles.linkText, { color: colors.primary }]}>Update balance</Text>
                    </Pressable>
                    <Pressable testID={`debt-stop-tracking-${debt.id}`} onPress={() => void stopTracking(debt.id, debt.name)}>
                      <Text style={[styles.linkText, { color: colors.destructive }]}>Stop tracking</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>Nothing tracked yet.</Text>
      )}

      {canManage ? (
        addingNew ? (
          <View style={styles.editForm}>
            <TextInput
              testID="debt-new-name-input"
              value={newName}
              onChangeText={setNewName}
              placeholder="Debt name — e.g. Fuliza"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              testID="debt-new-balance-input"
              keyboardType="number-pad"
              value={newBalance}
              onChangeText={(value) => setNewBalance(toDigits(value))}
              placeholder="Balance (KES)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              testID="debt-new-rate-input"
              keyboardType="decimal-pad"
              value={newRate}
              onChangeText={setNewRate}
              placeholder="Rate % per year (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            <View style={styles.editActions}>
              <Pressable testID="debt-new-save" disabled={saving} onPress={() => void addDebt()} style={[styles.smallBtn, { backgroundColor: colors.primary }]}>
                {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.smallBtnText, { color: colors.primaryForeground }]}>Track this debt</Text>}
              </Pressable>
              <Pressable onPress={() => setAddingNew(false)} style={styles.smallBtn}>
                <Text style={[styles.smallBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable testID="debt-add-open" onPress={() => setAddingNew(true)} style={[styles.addBtn, { borderColor: colors.border }]}>
            <Feather name="plus" size={15} color={colors.foreground} />
            <Text style={[styles.smallBtnText, { color: colors.foreground }]}>Track a debt</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  strategyRow: { flexDirection: 'row', gap: 8 },
  strategyChip: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  strategyLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  debtRow: { flexDirection: 'row', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  rank: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  debtName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  editForm: { gap: 8, marginTop: 8 },
  input: { height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 13 },
  editActions: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4 },
  linkText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  smallBtn: { paddingHorizontal: 12, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  addBtn: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, borderStyle: 'dashed' },
});
