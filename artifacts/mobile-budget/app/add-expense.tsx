import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  useCreateExpense,
  useGetBudgetCategories,
  useGetMembers,
  useGetDashboardCategoryBreakdown,
  getGetExpensesQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Food: 'shopping-cart',
  Transport: 'truck',
  Health: 'heart',
  Education: 'book',
  Utilities: 'zap',
  Entertainment: 'tv',
  Clothing: 'tag',
  Savings: 'archive',
  Housing: 'home',
  Communication: 'phone',
  Other: 'more-horizontal',
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AddExpenseSheet() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const now = new Date();
  const { data: breakdown } = useGetDashboardCategoryBreakdown({ month: now.getMonth() + 1, year: now.getFullYear() });

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [paidById, setPaidById] = useState('');
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  // Multi-source funding splits: each entry is one income stream that funded this expense
  const [fundingSplits, setFundingSplits] = useState<{ label: string; amount: string; fromBank: boolean }[]>([]);
  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { mutate: createExpense, isPending } = useCreateExpense({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
        const now = new Date();
        queryClient.invalidateQueries({
          queryKey: getGetDashboardSummaryQueryKey({ month: now.getMonth() + 1, year: now.getFullYear() }),
        });
        router.dismiss();
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', 'Failed to save expense. Please try again.');
      },
    },
  });

  const handleSubmit = useCallback(() => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!parsed || parsed <= 0) {
      Alert.alert('Amount required', 'Please enter a valid amount.');
      return;
    }
    if (!category) {
      Alert.alert('Category required', 'Please choose a category.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please add a description.');
      return;
    }
    if (!paidById) {
      Alert.alert('Paid by required', 'Please choose who paid for this expense.');
      return;
    }

    // Validate funding splits if provided
    const activeSplits = fundingSplits.filter(s => s.label.trim() || s.amount);
    if (activeSplits.length > 0 && !paidFromBank) {
      const missingLabel = activeSplits.some(s => !s.label.trim());
      if (missingLabel) { Alert.alert('Label required', 'Give each income source a name.'); return; }
      const splitsTotal = activeSplits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      if (Math.abs(splitsTotal - parsed) >= 1) {
        Alert.alert('Amounts don\'t add up', `Your sources total KES ${splitsTotal.toLocaleString()} but the expense is KES ${parsed.toLocaleString()}. Adjust until they match.`);
        return;
      }
    }

    const incomeSplits = !paidFromBank && activeSplits.length > 0
      ? activeSplits.map(s => ({ label: s.label.trim(), amount: parseFloat(s.amount) || 0 }))
      : [];

    createExpense({
      data: {
        amount: parsed,
        category,
        description: description.trim(),
        notes: notes.trim() || undefined,
        paidById,
        isRecurring,
        date,
        paidFromBank,
        ...(incomeSplits.length > 0 ? { incomeSplits } : {}),
      } as Parameters<typeof createExpense>[0]['data'],
    });
  }, [amount, category, description, notes, paidById, fundingSplits, isRecurring, date, paidFromBank, createExpense]);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Derive category list — use API categories if loaded, fallback to common ones
  const categoryList =
    categories.length > 0
      ? categories.map((c) => c.name)
      : Object.keys(CATEGORY_ICONS);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Handle bar */}
      <View style={[styles.handle, { backgroundColor: colors.border }]} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.dismiss()} style={styles.cancelBtn}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Log Expense</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isPending}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 }]}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
      >
        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={[styles.currencyLabel, { color: colors.mutedForeground }]}>KES</Text>
          <TextInput
            style={[styles.amountInput, { color: colors.foreground }]}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
        </View>

        {/* Category */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categoryList.map((cat) => {
            const icon = CATEGORY_ICONS[cat] ?? 'tag';
            const selected = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.muted,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Feather name={icon} size={14} color={selected ? '#fff' : colors.mutedForeground} />
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: selected ? '#fff' : colors.foreground },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Running balance for selected category */}
        {category ? (() => {
          const cat = breakdown?.find(b => b.category === category);
          if (!cat) return null;
          const over = cat.spentAmount >= cat.budgetAmount;
          return (
            <View style={[styles.balancePill, { backgroundColor: over ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderColor: over ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)' }]}>
              <Feather name="bar-chart-2" size={12} color={over ? '#ef4444' : '#4ade80'} />
              <Text style={[styles.balancePillText, { color: over ? '#ef4444' : '#4ade80' }]}>
                Spent this month: KES {cat.spentAmount.toLocaleString()} / {cat.budgetAmount.toLocaleString()}
                {over ? '  ·  Over budget!' : `  ·  KES ${(cat.budgetAmount - cat.spentAmount).toLocaleString()} left`}
              </Text>
            </View>
          );
        })() : null}

        {/* Description */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius,
            },
          ]}
          placeholder="What was this for?"
          placeholderTextColor={colors.mutedForeground}
          value={description}
          onChangeText={setDescription}
          returnKeyType="next"
        />

        {/* Notes */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>NOTES (optional)</Text>
        <TextInput
          style={[
            styles.textInput,
            styles.notesInput,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius,
            },
          ]}
          placeholder="Any extra details…"
          placeholderTextColor={colors.mutedForeground}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Who paid */}
        {members.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              PAID BY <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <View style={styles.paidByRow}>
              {members.map((m) => {
                const selected = paidById === m.userId;
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => setPaidById(m.userId)}
                    style={[
                      styles.paidByPill,
                      {
                        backgroundColor: selected ? colors.primary : colors.muted,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius,
                      },
                    ]}
                  >
                    <Feather
                      name="user"
                      size={14}
                      color={selected ? '#fff' : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.paidByText,
                        { color: selected ? '#fff' : colors.foreground },
                      ]}
                    >
                      {m.userName?.split(' ')[0] ?? 'Member'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!paidById && (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Tap to choose who paid
              </Text>
            )}
          </>
        )}

        {/* Funding breakdown — shown when payer selected */}
        {paidById && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>FUNDED FROM</Text>

            {/* Joint bank toggle — mutually exclusive with splits */}
            <Pressable
              onPress={() => { setPaidFromBank(b => !b); if (!paidFromBank) setFundingSplits([]); }}
              style={[
                styles.bankChip,
                {
                  backgroundColor: paidFromBank ? 'rgba(14,79,110,0.15)' : colors.muted,
                  borderColor: paidFromBank ? '#38bdf8' : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Feather name="credit-card" size={14} color={paidFromBank ? '#38bdf8' : colors.mutedForeground} />
              <Text style={[styles.paidByText, { flex: 1, color: paidFromBank ? '#38bdf8' : colors.foreground }]}>
                Paid from joint bank account
              </Text>
              {paidFromBank && <Feather name="check" size={14} color="#38bdf8" />}
            </Pressable>
            {paidFromBank && (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Already counted via deposit — won't be double-counted as a contribution
              </Text>
            )}

            {/* Multi-source splits — shown when joint bank is NOT selected */}
            {!paidFromBank && (
              <>
                {fundingSplits.map((split, idx) => (
                    <View key={idx} style={[styles.splitRow, {
                      borderColor: split.fromBank ? '#38bdf8' : colors.border,
                      backgroundColor: split.fromBank ? 'rgba(14,79,110,0.12)' : colors.muted,
                      borderRadius: colors.radius,
                    }]}>
                      <TextInput
                        style={[styles.splitLabel, { color: colors.foreground }]}
                        placeholder="Source name"
                        placeholderTextColor={colors.mutedForeground}
                        value={split.label}
                        onChangeText={v => setFundingSplits(ss => ss.map((s, i) => i === idx ? { ...s, label: v } : s))}
                        returnKeyType="next"
                      />
                      <View style={[styles.splitAmountBox, { borderLeftColor: split.fromBank ? '#38bdf850' : colors.border }]}>
                        <Text style={[styles.splitCurrency, { color: split.fromBank ? '#38bdf8' : colors.mutedForeground }]}>KES</Text>
                        <TextInput
                          style={[styles.splitAmountInput, { color: split.fromBank ? '#38bdf8' : colors.foreground }]}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="numeric"
                          value={split.amount}
                          onChangeText={v => setFundingSplits(ss => ss.map((s, i) => i === idx ? { ...s, amount: v } : s))}
                        />
                      </View>
                      {/* Bank toggle — marks this portion as already-counted via deposit */}
                      <Pressable
                        onPress={() => setFundingSplits(ss => ss.map((s, i) => i === idx ? { ...s, fromBank: !s.fromBank, label: !s.fromBank ? (s.label || 'Joint bank') : s.label } : s))}
                        hitSlop={8}
                        style={[styles.splitBankBtn, { borderLeftColor: split.fromBank ? '#38bdf850' : colors.border, backgroundColor: split.fromBank ? 'rgba(56,189,248,0.15)' : 'transparent' }]}
                      >
                        <Feather name="credit-card" size={14} color={split.fromBank ? '#38bdf8' : colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        onPress={() => setFundingSplits(ss => ss.filter((_, i) => i !== idx))}
                        hitSlop={10}
                        style={[styles.splitRemoveBtn, { borderLeftColor: split.fromBank ? '#38bdf850' : colors.border }]}
                      >
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                ))}

                {/* Add source button */}
                <Pressable
                  onPress={() => setFundingSplits(ss => [...ss, { label: '', amount: '' }])}
                  style={[styles.addSplitBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                >
                  <Feather name="plus" size={14} color={colors.primary} />
                  <Text style={[styles.addSplitText, { color: colors.primary }]}>Split across income sources</Text>
                </Pressable>

                {/* Running total hint */}
                {fundingSplits.length > 0 && (() => {
                  const splitsTotal = fundingSplits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                  const bankTotal  = fundingSplits.filter(r => r.fromBank).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                  const countable  = splitsTotal - bankTotal;
                  const expAmt = parseFloat(amount.replace(/,/g, '')) || 0;
                  const ok = expAmt > 0 && Math.abs(splitsTotal - expAmt) < 1;
                  return (
                    <>
                      <Text style={[styles.hintText, { color: ok ? '#4ade80' : '#f87171', fontFamily: ok ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                        {ok
                          ? `✓ Sources add up to KES ${splitsTotal.toLocaleString()}`
                          : `Sources total KES ${splitsTotal.toLocaleString()} — expense is KES ${expAmt.toLocaleString()}`}
                      </Text>
                      {ok && bankTotal > 0 && (
                        <Text style={[styles.hintText, { color: 'rgba(56,189,248,0.8)' }]}>
                          KES {countable.toLocaleString()} counts as contribution · KES {bankTotal.toLocaleString()} from bank (already counted)
                        </Text>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* Date */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[
            styles.dateRow,
            { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <Text style={[styles.dateText, { color: colors.foreground, flex: 1 }]}>
            {formatDateDisplay(date)}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={new Date(date + 'T00:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selected) {
                const y = selected.getFullYear();
                const m = String(selected.getMonth() + 1).padStart(2, '0');
                const d = String(selected.getDate()).padStart(2, '0');
                setDate(`${y}-${m}-${d}`);
              }
            }}
          />
        )}

        {/* Recurring toggle */}
        <View
          style={[
            styles.toggleRow,
            { borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <View style={styles.toggleInfo}>
            <Feather name="refresh-cw" size={16} color={colors.primary} />
            <View>
              <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Recurring</Text>
              <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                Copy to next month automatically
              </Text>
            </View>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cancelBtn: { padding: 4 },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 6 },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  currencyLabel: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 6,
  },
  amountInput: {
    fontSize: 52,
    fontWeight: '800' as const,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    letterSpacing: -2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  categoryScroll: { marginHorizontal: -20 },
  categoryScrollContent: { paddingHorizontal: 20, gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
  },
  notesInput: {
    height: 80,
    paddingTop: 13,
  },
  paidByRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  paidByPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  paidByText: {
    fontSize: 14,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateArrow: { padding: 14 },
  dateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  balancePillText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  splitLabel: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  splitAmountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 4,
  },
  splitCurrency: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  splitAmountInput: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    minWidth: 72,
    textAlign: 'right',
  },
  splitBankBtn: {
    padding: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  splitRemoveBtn: {
    padding: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 4,
  },
  addSplitText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
