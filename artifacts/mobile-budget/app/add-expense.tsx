import React, { useState, useCallback, useEffect } from 'react';
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
import { useQueryClient, useQuery } from '@tanstack/react-query';
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
  customFetch,
} from '@workspace/api-client-react';

const PALETTE = ['#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#3b82f6', '#a855f7', '#ef4444'];
type IncomeSource = { id: number; name: string; isMain: boolean; userId: string };

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
  const [payerIds, setPayerIds] = useState<string[]>([]);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const paidById = payerIds.length === 1 ? payerIds[0] : '';
  const [isRecurring, setIsRecurring] = useState(false);
  // Funding — joint bank toggle + personal income sources from DB
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [otherLabel, setOtherLabel] = useState('');
  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Load this payer's income sources from DB
  const { data: incomeSources = [], isLoading: sourcesLoading } = useQuery<IncomeSource[]>({
    queryKey: ['income-sources', paidById],
    queryFn: async () => {
      if (!paidById) return [];
      return customFetch<IncomeSource[]>(`/api/income-sources?userId=${paidById}`);
    },
    enabled: !!paidById,
    staleTime: 60_000,
  });

  // Reset funding selections whenever the payer changes
  useEffect(() => {
    setPaidFromBank(false);
    setSelectedSources([]);
    setSplitAmounts({});
    setOtherLabel('');
  }, [paidById]);

  const { mutateAsync: createExpenseAsync } = useCreateExpense();
  const [isPending, setIsPending] = useState(false);

  const invalidateExpenses = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    const now = new Date();
    queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey({ month: now.getMonth() + 1, year: now.getFullYear() }),
    });
  }, [queryClient]);

  const handleSubmit = useCallback(async () => {
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
    if (payerIds.length === 0 && !paidFromBank) {
      Alert.alert('Paid by required', 'Please choose who paid, or select Joint bank.');
      return;
    }
    if (date > todayIso()) {
      Alert.alert('Future date not allowed', 'This records actual spending — please use today or an earlier date.');
      return;
    }

    const isMultiPayer = payerIds.length > 1;

    if (isMultiPayer) {
      const splitTotal = payerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0);
      if (Math.abs(splitTotal - parsed) >= 1) {
        Alert.alert("Amounts don't add up", `Payer portions total KES ${splitTotal.toLocaleString()} but the expense is KES ${parsed.toLocaleString()}.`);
        return;
      }
    } else {
      if (!paidFromBank && selectedSources.length === 0) {
        Alert.alert('Source required', 'Please choose where this money came from.');
        return;
      }
      if (selectedSources.includes('Other') && !otherLabel.trim()) {
        Alert.alert('Label required', 'Please describe the "Other" source.');
        return;
      }
      if (selectedSources.length > 1) {
        const splitsTotal = selectedSources.reduce((s, k) => s + (parseFloat(splitAmounts[k] || '0') || 0), 0);
        if (Math.abs(splitsTotal - parsed) >= 1) {
          Alert.alert("Amounts don't add up", `Sources total KES ${splitsTotal.toLocaleString()} but the expense is KES ${parsed.toLocaleString()}.`);
          return;
        }
      }
    }

    setIsPending(true);
    try {
      if (isMultiPayer) {
        for (const pid of payerIds) {
          const portionAmt = parseFloat(payerAmounts[pid] || '0') || 0;
          if (portionAmt <= 0) continue;
          await createExpenseAsync({
            data: {
              amount: portionAmt,
              category,
              description: description.trim(),
              notes: notes.trim() || undefined,
              paidById: pid,
              isRecurring,
              date,
              paidFromBank: false,
            } as Parameters<typeof createExpenseAsync>[0]['data'],
          });
        }
      } else {
        const isSplit = selectedSources.length > 1;
        const incomeSplits = selectedSources.map(name => ({
          label: name === 'Other' ? otherLabel.trim() : name,
          amount: isSplit ? (parseFloat(splitAmounts[name] || '0') || 0) : parsed,
        })).filter(s => s.amount > 0);

        await createExpenseAsync({
          data: {
            amount: parsed,
            category,
            description: description.trim(),
            notes: notes.trim() || undefined,
            paidById: paidFromBank ? undefined : paidById,
            isRecurring,
            date,
            paidFromBank,
            ...(incomeSplits.length > 0 ? { incomeSplits } : {}),
          } as Parameters<typeof createExpenseAsync>[0]['data'],
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateExpenses();
      router.dismiss();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to save expense. Please try again.');
    } finally {
      setIsPending(false);
    }
  }, [amount, category, description, notes, payerIds, payerAmounts, paidById, selectedSources, splitAmounts, otherLabel, isRecurring, date, paidFromBank, createExpenseAsync, invalidateExpenses]);

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

        {/* Funding breakdown — only shown for a single named payer */}
        {!paidFromBank && payerIds.length === 1 && (
        <View style={[styles.fundingCard, { backgroundColor: colors.muted, borderColor: colors.primary + '50' }]}>
          <View style={styles.fundingCardHeader}>
            <Feather name="layers" size={14} color={colors.primary} />
            <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>FUNDED FROM</Text>
            <Text style={styles.fundingRequired}>* Required</Text>
          </View>

          {/* Personal income sources — loaded from DB for the selected payer */}
          {!paidById ? (
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Select who paid above to see their income sources
            </Text>
          ) : sourcesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : incomeSources.length === 0 ? (
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              No income sources set up — add them in Settings
            </Text>
          ) : (
            <View style={styles.sourceChipsGrid}>
              {incomeSources.map((src, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                const selected = selectedSources.includes(src.name);
                return (
                  <Pressable
                    key={src.id}
                    onPress={() => setSelectedSources(prev =>
                      prev.includes(src.name) ? prev.filter(k => k !== src.name) : [...prev, src.name]
                    )}
                    style={[styles.sourceChip, {
                      backgroundColor: selected ? color + '22' : colors.background,
                      borderColor: selected ? color : colors.border,
                      borderRadius: colors.radius,
                    }]}
                  >
                    <Feather name="briefcase" size={13} color={selected ? color : colors.mutedForeground} />
                    <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>
                      {src.name}
                    </Text>
                    {selected && <Feather name="check" size={11} color={color} />}
                  </Pressable>
                );
              })}
              {/* Other — free-text for unlisted sources */}
              {(() => {
                const selected = selectedSources.includes('Other');
                return (
                  <Pressable
                    onPress={() => setSelectedSources(prev =>
                      prev.includes('Other') ? prev.filter(k => k !== 'Other') : [...prev, 'Other']
                    )}
                    style={[styles.sourceChip, {
                      backgroundColor: selected ? '#6b728022' : colors.background,
                      borderColor: selected ? '#6b7280' : colors.border,
                      borderRadius: colors.radius,
                    }]}
                  >
                    <Feather name="more-horizontal" size={13} color={selected ? '#6b7280' : colors.mutedForeground} />
                    <Text style={[styles.sourceChipText, { color: selected ? '#6b7280' : colors.foreground }]}>Other</Text>
                    {selected && <Feather name="check" size={11} color="#6b7280" />}
                  </Pressable>
                );
              })()}
            </View>
          )}
          {selectedSources.includes('Other') && (
            <TextInput
              style={[styles.textInput, {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
                borderRadius: colors.radius,
                marginTop: 8,
                paddingVertical: 10,
              }]}
              placeholder="Describe the source (e.g. Consultancy, Parents)"
              placeholderTextColor={colors.mutedForeground}
              value={otherLabel}
              onChangeText={setOtherLabel}
              returnKeyType="done"
            />
          )}

          {/* Split amounts — shown when 2+ personal sources selected */}
          {selectedSources.length > 1 && (
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                How much from each source?
              </Text>
              {selectedSources.map((name, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <View key={name} style={[styles.splitAmountRow, {
                    backgroundColor: colors.background,
                    borderColor: color + '44',
                    borderRadius: colors.radius,
                  }]}>
                    <Feather name={name === 'Other' ? 'more-horizontal' : 'briefcase'} size={14} color={color} />
                    <Text style={[styles.splitAmountLabel, { color: colors.foreground }]} numberOfLines={1}>
                      {name === 'Other' ? (otherLabel || 'Other') : name}
                    </Text>
                    <View style={styles.splitAmountInputBox}>
                      <Text style={[styles.splitCurrency, { color: colors.mutedForeground }]}>KES</Text>
                      <TextInput
                        style={[styles.splitAmountInput, { color }]}
                        placeholder="0"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numeric"
                        value={splitAmounts[name] || ''}
                        onChangeText={v => setSplitAmounts(prev => ({ ...prev, [name]: v }))}
                      />
                    </View>
                  </View>
                );
              })}
              {(() => {
                const total = selectedSources.reduce((s, k) => s + (parseFloat(splitAmounts[k] || '0') || 0), 0);
                const expAmt = parseFloat(amount.replace(/,/g, '')) || 0;
                const ok = expAmt > 0 && Math.abs(total - expAmt) < 1;
                return (
                  <Text style={[styles.hintText, {
                    color: ok ? '#4ade80' : '#f87171',
                    fontFamily: ok ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    marginTop: 2,
                  }]}>
                    {ok ? `✓ Sources add up to KES ${total.toLocaleString()}` : `Total: KES ${total.toLocaleString()} · need KES ${expAmt.toLocaleString()}`}
                  </Text>
                );
              })()}
            </View>
          )}
        </View>
        )}

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
              {/* Joint bank — unattributed, mutually exclusive with member chips */}
              <Pressable
                onPress={() => {
                  if (paidFromBank) {
                    setPaidFromBank(false);
                  } else {
                    setPayerIds([]);
                    setPaidFromBank(true);
                  }
                }}
                style={[styles.paidByPill, {
                  backgroundColor: paidFromBank ? 'rgba(56,189,248,0.15)' : colors.muted,
                  borderColor: paidFromBank ? '#38bdf8' : colors.border,
                  borderRadius: colors.radius,
                }]}
              >
                <Feather name="credit-card" size={14} color={paidFromBank ? '#38bdf8' : colors.mutedForeground} />
                <Text style={[styles.paidByText, { color: paidFromBank ? '#38bdf8' : colors.foreground }]}>
                  Joint bank
                </Text>
              </Pressable>
              {members.map((m) => {
                const selected = payerIds.includes(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => {
                      setPaidFromBank(false);
                      setPayerIds(prev =>
                        prev.includes(m.userId)
                          ? prev.filter(id => id !== m.userId)
                          : [...prev, m.userId]
                      );
                    }}
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
            {payerIds.length === 0 && !paidFromBank && (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Tap to select · select multiple to split the cost
              </Text>
            )}

            {/* Per-payer split rows — shown when 2+ payers */}
            {payerIds.length > 1 && (() => {
              const total = parseFloat(amount.replace(/,/g, '')) || 0;
              const splitTotal = payerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0);
              const diff = total - splitTotal;
              return (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                    How much did each person pay?{total > 0 ? ` (total: KES ${total.toLocaleString()})` : ''}
                  </Text>
                  {payerIds.map((pid) => {
                    const member = members.find(m => m.userId === pid);
                    const name = member?.userName?.split(' ')[0] ?? 'Member';
                    return (
                      <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: 76 }}>
                          <Feather name="user" size={13} color={colors.mutedForeground} />
                          <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{name}</Text>
                        </View>
                        <TextInput
                          style={{
                            flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
                            borderColor: colors.border, backgroundColor: colors.muted,
                            paddingHorizontal: 12, fontSize: 16, color: colors.foreground,
                            fontFamily: 'Inter_400Regular',
                          }}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          value={payerAmounts[pid] || ''}
                          onChangeText={val => setPayerAmounts(prev => ({ ...prev, [pid]: val }))}
                        />
                      </View>
                    );
                  })}
                  {Math.abs(diff) >= 1 && (
                    <Text style={{ fontSize: 12, color: diff > 0 ? '#f59e0b' : '#f87171', fontFamily: 'Inter_400Regular' }}>
                      {diff > 0
                        ? `KES ${diff.toLocaleString()} still unassigned`
                        : `Over by KES ${Math.abs(diff).toLocaleString()}`}
                    </Text>
                  )}
                </View>
              );
            })()}
          </>
        )}

        {/* Date — required, no future dates */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>
            DATE <Text style={{ color: '#ef4444' }}>*</Text>
          </Text>
          <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0, fontSize: 11 }]}>
            Backdate allowed · no future dates
          </Text>
        </View>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[
            styles.dateRow,
            { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Feather name="calendar" size={16} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.dateText, { color: colors.foreground, flex: 1 }]}>
            {formatDateDisplay(date)}
          </Text>
          {date === todayIso()
            ? <Text style={[styles.dateBadge, { backgroundColor: colors.primary + '22', color: colors.primary }]}>Today</Text>
            : <Text style={[styles.dateBadge, { backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }]}>Backdated</Text>
          }
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateBadge: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 10,
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
  // Funding card
  fundingCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  fundingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fundingRequired: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#ef4444',
  },
  sourceChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  sourceChipText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  // Split amount inputs
  splitAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  splitAmountLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  splitAmountInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  splitCurrency: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  splitAmountInput: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    minWidth: 80,
    textAlign: 'right',
  },
});
