import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import {
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardCategoryLedgerQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetExpensesQueryKey,
  getGetBudgetCategoriesQueryKey,
  useGetDashboardCategoryBreakdown,
  useGetDashboardCategoryLedger,
  useGetGroup,
  customFetch,
} from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { WorkspaceIdentityRow } from '@/components/WorkspaceIdentityRow';
import { getLedgerExpenseEditHref } from '@/lib/expenseEditLink';
import { workspaceBudgetName } from '@/lib/workspaceIdentity';

type BudgetCategory = {
  id: number;
  name: string;
  budgetAmount: number;
  priority: number;
  color: string;
  isRecurring: boolean;
  activeMonth?: number | null;
  activeYear?: number | null;
};
type IncomeSource = { id: number; userId: string; name: string; isMain: boolean; expectedMonthlyAmount: number };
type Member = { userId: string; userName?: string | null; role?: 'owner' | 'admin' | 'member' };
type LedgerTarget = { category: string; isBudgeted: boolean };

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const RECURRING_BUDGET_HANDOFF_KEY = 'jamvi:recurring-budget-handoff';

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Survival Essentials',
  2: 'Health & Education',
  3: 'Essentials',
  4: 'Connectivity & Grooming',
  5: 'Discretionary',
  999: 'Needs a budget',
};

const PRIORITY_GUIDE: Record<number, string> = {
  1: 'Must-pay basics: food, housing, and core utilities.',
  2: 'Protect health, learning, and costs that should not wait.',
  3: 'Keep the household running: transport and everyday supplies.',
  4: 'Stay connected and cared for: data, grooming, and similar costs.',
  5: 'Flexible spending that can wait when money is tight.',
  999: 'Spending recorded without a matching budget category yet.',
};

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

export default function BudgetScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    recurringSetup?: string | string[];
    category?: string | string[];
  }>();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const {
    data: breakdown = [],
    isLoading: breakdownLoading,
    isFetching: breakdownFetching,
    refetch: refetchBreakdown,
  } =
    useGetDashboardCategoryBreakdown({ month, year });
  const { data: allCategories = [], isLoading: categoriesLoading, refetch: refetchCats } = useQuery<BudgetCategory[]>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<BudgetCategory[]>('/api/budget-categories'),
    staleTime: 30_000,
  });
  const { data: incomeSources = [], refetch: refetchIncomeSources } = useQuery<IncomeSource[]>({
    queryKey: ['income-sources', 'budget-report'],
    queryFn: () => customFetch<IncomeSource[]>('/api/income-sources'),
    staleTime: 30_000,
  });
  const { data: members = [], refetch: refetchMembers } = useQuery<Member[]>({
    queryKey: ['members', 'budget-report'],
    queryFn: () => customFetch<Member[]>('/api/members'),
    staleTime: 30_000,
  });
  const { data: group } = useGetGroup();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBreakdown(), refetchCats(), refetchIncomeSources(), refetchMembers()]);
    setRefreshing(false);
  }, [refetchBreakdown, refetchCats, refetchIncomeSources, refetchMembers]);

  // Add / Edit modal state
  const [editTarget, setEditTarget] = useState<BudgetCategory | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [managePriority, setManagePriority] = useState<number | null>(null);
  const [ledgerCategory, setLedgerCategory] = useState<LedgerTarget | null>(null);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPriority, setFormPriority] = useState('1');
  const [formIsRecurring, setFormIsRecurring] = useState(true);
  const [formActiveMonth, setFormActiveMonth] = useState(month);
  const [formActiveYear, setFormActiveYear] = useState(year);
  const [saving, setSaving] = useState(false);
  const [newIncomeSource, setNewIncomeSource] = useState('');
  const [newIncomeExpected, setNewIncomeExpected] = useState('');
  const [addingIncomeSource, setAddingIncomeSource] = useState(false);
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState<number | null>(null);
  const [editingIncomeSourceName, setEditingIncomeSourceName] = useState('');
  const [savingIncomeSourceId, setSavingIncomeSourceId] = useState<number | null>(null);
  const [recurringSetupActive, setRecurringSetupActive] = useState(false);
  const [recurringSetupHandled, setRecurringSetupHandled] = useState(false);
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    refetch: refetchLedger,
  } = useGetDashboardCategoryLedger(
    {
      month,
      year,
      category: ledgerCategory?.category ?? '',
      isBudgeted: ledgerCategory?.isBudgeted ?? true,
    },
    {
      query: {
        queryKey: getGetDashboardCategoryLedgerQueryKey({
          month,
          year,
          category: ledgerCategory?.category ?? '',
          isBudgeted: ledgerCategory?.isBudgeted ?? true,
        }),
        enabled: !!ledgerCategory,
      },
    },
  );

  const openAdd = (priority = 1) => {
    setEditTarget(null);
    setFormName(''); setFormAmount(''); setFormPriority(priority.toString());
    setFormIsRecurring(true); setFormActiveMonth(month); setFormActiveYear(year);
    setAddOpen(true);
  };
  const openEdit = (cat: BudgetCategory) => {
    setManageOpen(false);
    setEditTarget(cat);
    setFormName(cat.name);
    setFormAmount(cat.budgetAmount.toString());
    setFormPriority(cat.priority.toString());
    setFormIsRecurring(cat.isRecurring);
    setFormActiveMonth(cat.activeMonth ?? month);
    setFormActiveYear(cat.activeYear ?? year);
    setAddOpen(true);
  };
  const openManage = (priority: number | null = null) => {
    setManagePriority(priority);
    setManageOpen(true);
  };
  const closeModal = () => {
    setAddOpen(false);
    setEditTarget(null);
    if (recurringSetupActive) {
      setRecurringSetupActive(false);
      router.back();
    }
  };

  React.useEffect(() => {
    const setup = Array.isArray(params.recurringSetup) ? params.recurringSetup[0] : params.recurringSetup;
    if (setup !== '1' || recurringSetupHandled || categoriesLoading) return;
    const requestedCategory = (Array.isArray(params.category) ? params.category[0] : params.category)?.trim() ?? '';
    const existing = allCategories.find(
      item => item.name.trim().toLocaleLowerCase() === requestedCategory.toLocaleLowerCase(),
    );
    setRecurringSetupActive(true);
    setRecurringSetupHandled(true);
    if (existing) {
      openEdit(existing);
      return;
    }
    setEditTarget(null);
    setFormName(requestedCategory);
    setFormAmount('');
    setFormPriority('3');
    setFormIsRecurring(true);
    setFormActiveMonth(month);
    setFormActiveYear(year);
    setAddOpen(true);
  }, [allCategories, categoriesLoading, month, params.category, params.recurringSetup, recurringSetupHandled, year]);

  const refreshAll = async () => {
    qc.removeQueries({
      queryKey: getGetDashboardCategoryBreakdownQueryKey(),
      type: 'inactive',
    });
    await Promise.all([
      refetchCats(),
      refetchBreakdown(),
      refetchIncomeSources(),
      refetchMembers(),
      qc.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
    ]);
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const canManageSharedIncome = group?.isPrivate === false && members.some(
    member => member.userId === user?.id && (member.role === 'owner' || member.role === 'admin'),
  );
  const canManageCategories = group?.isPrivate === true || canManageSharedIncome;
  const refreshIncomeSources = async () => {
    await Promise.all([
      refetchIncomeSources(),
      qc.invalidateQueries({ queryKey: ['income-sources'] }),
    ]);
  };
  const handleAddIncomeSource = async () => {
    const name = newIncomeSource.trim();
    if (!name) {
      Alert.alert('Source name required', 'Enter a name before adding the income source.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Sign in again before adding an income source.');
      return;
    }

    setAddingIncomeSource(true);
    try {
      await customFetch('/api/income-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name,
          isMain: false,
          expectedMonthlyAmount: Math.max(0, Math.round(Number(newIncomeExpected) || 0)),
        }),
      });
      setNewIncomeSource('');
      setNewIncomeExpected('');
      await refreshIncomeSources();
      Alert.alert('Income source added', `${name} is now available for expenses and deposits.`);
    } catch (error) {
      Alert.alert('Could not add income source', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setAddingIncomeSource(false);
    }
  };
  const handleSaveExpectedIncome = async (source: IncomeSource, rawAmount: string) => {
    const expectedMonthlyAmount = Math.max(0, Math.round(Number(rawAmount) || 0));
    if (expectedMonthlyAmount === source.expectedMonthlyAmount) return;
    try {
      await customFetch(`/api/income-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: source.name, isMain: source.isMain, expectedMonthlyAmount }),
      });
      await refreshIncomeSources();
    } catch {
      Alert.alert('Could not save expected income', 'Enter a whole amount in KES.');
    }
  };
  const handleDeleteIncomeSource = (source: IncomeSource) => {
    Alert.alert(
      'Remove income source',
      `Remove "${source.name}" from "${workspaceBudgetName(group)}"? Existing expenses will not be changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await customFetch(`/api/income-sources/${source.id}`, { method: 'DELETE' });
              await refreshIncomeSources();
            } catch {
              Alert.alert('Could not remove income source', 'Please try again.');
            }
          },
        },
      ],
    );
  };
  const handleStartEditIncomeSource = (source: IncomeSource) => {
    setEditingIncomeSourceId(source.id);
    setEditingIncomeSourceName(source.name);
  };
  const handleCancelEditIncomeSource = () => {
    setEditingIncomeSourceId(null);
    setEditingIncomeSourceName('');
  };
  const handleSaveIncomeSource = async (source: IncomeSource) => {
    const name = editingIncomeSourceName.trim();
    if (!name) {
      Alert.alert('Source name required', 'Enter a name before saving the income source.');
      return;
    }
    setSavingIncomeSourceId(source.id);
    try {
      await customFetch(`/api/income-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          isMain: source.isMain,
          expectedMonthlyAmount: source.expectedMonthlyAmount,
        }),
      });
      handleCancelEditIncomeSource();
      await refreshIncomeSources();
      Alert.alert('Income source updated');
    } catch (error) {
      Alert.alert('Could not update income source', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingIncomeSourceId(null);
    }
  };

  const handleSave = async () => {
    const rawAmount = formAmount.trim();
    const amt = rawAmount === '' && editTarget ? 0 : parseInt(rawAmount, 10);
    if (!formName.trim() || isNaN(amt) || amt < 0) {
      Alert.alert('Missing fields', 'Name and a valid amount are required.');
      return;
    }
    setSaving(true);
    try {
      const url = editTarget ? `/api/budget-categories/${editTarget.id}` : '/api/budget-categories';
      await customFetch(url, {
        method: editTarget ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          budgetAmount: amt,
          priority: parseInt(formPriority, 10) || 1,
          isRecurring: formIsRecurring,
          activeMonth: formIsRecurring ? null : formActiveMonth,
          activeYear: formIsRecurring ? null : formActiveYear,
        }),
      });
      await refreshAll();
      if (recurringSetupActive) {
        const rawHandoff = await AsyncStorage.getItem(RECURRING_BUDGET_HANDOFF_KEY);
        const handoff = rawHandoff ? JSON.parse(rawHandoff) as Record<string, unknown> : {};
        await AsyncStorage.setItem(
          RECURRING_BUDGET_HANDOFF_KEY,
          JSON.stringify(
            handoff.expenseDraft
              ? { ...handoff, categoryName: formName.trim() }
              : { monthlyBudget: String(amt), isRecurring: true },
          ),
        );
      }
      closeModal();
    } catch {
      Alert.alert('Error', 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cat: BudgetCategory) => {
    Alert.alert(
      `Remove "${cat.name}" from "${workspaceBudgetName(group)}"?`,
      'This removes the budget limit. Existing expenses in this category are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await customFetch(`/api/budget-categories/${cat.id}`, { method: 'DELETE' });
              await refreshAll();
            } catch {
              Alert.alert('Error', 'Could not remove category.');
            }
          },
        },
      ],
    );
  };

  const isLoading = breakdownLoading || breakdownFetching;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const reportBudget = breakdown.reduce((sum, category) => sum + category.budgetAmount, 0);
  const reportActual = breakdown.reduce((sum, category) => sum + category.spentAmount, 0);
  const reportVariance = reportBudget - reportActual;
  const overallPct = reportBudget > 0 ? Math.min(reportActual / reportBudget, 1) : 0;
  const memberNames = new Map(members.map(member => [member.userId, member.userName || 'Member']));
  const groupedIncomeSources = incomeSources.reduce((groups, source) => {
    const existing = groups.get(source.userId) ?? [];
    existing.push(source);
    groups.set(source.userId, existing);
    return groups;
  }, new Map<string, IncomeSource[]>());
  const activeCategories = allCategories.filter(category =>
    category.isRecurring || (category.activeMonth === month && category.activeYear === year),
  );
  const reportedCategoryNames = new Set(breakdown.map(category => category.category));
  const unusedCategories = activeCategories.filter(category => !reportedCategoryNames.has(category.name));
  const tiersToShow = Array.from(new Set([
    1,
    2,
    3,
    4,
    5,
    ...breakdown.map(category => category.priority),
    ...activeCategories.map(category => category.priority),
  ])).sort((a, b) => a - b);
  const tierReport = tiersToShow.map(tier => {
    const reported = breakdown.filter(category => category.priority === tier);
    const budgetOnly = activeCategories.filter(category =>
      category.priority === tier && !reportedCategoryNames.has(category.name),
    );
    return {
      tier,
      budget: reported.reduce((sum, category) => sum + category.budgetAmount, 0)
        + budgetOnly.reduce((sum, category) => sum + category.budgetAmount, 0),
      actual: reported.reduce((sum, category) => sum + category.spentAmount, 0),
    };
  }).filter(row => row.budget > 0 || row.actual > 0);
  const ledgerEntries = ledger?.entries ?? [];
  const ledgerTotal = ledger?.total ?? 0;
  const ledgerCategoryTotal = breakdown.find(category => category.category === ledgerCategory?.category)?.spentAmount ?? 0;
  const ledgerBudgetCategory = allCategories.find(category => category.name === ledgerCategory?.category);
  const managedCategories = managePriority == null
    ? allCategories
    : allCategories.filter(category => category.priority === managePriority);
  const summaryBudgetCategories = activeCategories.filter(category => category.budgetAmount > 0);
  const openOverallLedger = () => {
    if (summaryBudgetCategories.length === 1) {
      const [category] = summaryBudgetCategories;
      setLedgerCategory({ category: category.name, isBudgeted: true });
      return;
    }
    if (summaryBudgetCategories.length > 1) {
      openManage();
      return;
    }
    openAdd();
  };
  const summaryContext = summaryBudgetCategories.length === 1
    ? `${summaryBudgetCategories[0].name} · Tap to view ledger and manage`
    : summaryBudgetCategories.length > 1
      ? `${summaryBudgetCategories.length} budget categories · Tap to choose one`
      : 'No category is assigned yet · Tap to add one';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Add / Edit Modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {recurringSetupActive ? 'Set average monthly amount' : editTarget ? 'Edit category' : 'Add category'}
                </Text>
                <Pressable onPress={closeModal} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY NAME</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. Transport"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                />
                {editTarget ? (
                  <Text style={[styles.priorityHint, { color: colors.mutedForeground }]}>
                    Renaming keeps existing expenses and tagged bank payments under the new name.
                  </Text>
                ) : null}
                {recurringSetupActive ? (
                  <Text style={[styles.priorityHint, { color: colors.mutedForeground }]}>
                    Enter the average amount you expect to spend each month. Jamvi will use it as this category&apos;s monthly budget.
                  </Text>
                ) : null}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  {recurringSetupActive ? 'AVERAGE MONTHLY AMOUNT (KES)' : 'BUDGET AMOUNT (KES)'}
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="e.g. 15000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
                <Text style={[styles.priorityHint, { color: colors.mutedForeground }]}>
                  Enter 0, or clear the amount while editing, to pause this budget. Existing expenses stay recorded.
                </Text>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PRIORITY TIER</Text>
                <View style={styles.priorityRow}>
                  {[1, 2, 3, 4, 5].map(p => (
                    <Pressable
                      key={p}
                      onPress={() => setFormPriority(p.toString())}
                      style={[styles.priorityChip, {
                        backgroundColor: formPriority === p.toString() ? colors.primary + '22' : colors.muted,
                        borderColor: formPriority === p.toString() ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={[styles.priorityChipText, {
                        color: formPriority === p.toString() ? colors.primary : colors.mutedForeground,
                      }]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.priorityHint, { color: colors.mutedForeground }]}>
                  Tier {formPriority}: {PRIORITY_LABELS[parseInt(formPriority, 10)] ?? ''}
                </Text>
                <View style={[styles.priorityGuide, { backgroundColor: colors.accent }]}>
                  <Feather name="info" size={15} color={colors.accentForeground} />
                  <Text style={[styles.priorityGuideText, { color: colors.accentForeground }]}>
                     Tiers help you decide what to fund first when money is limited. Use Tier 1 for must-pay needs and Tier 5 for flexible spending. {PRIORITY_GUIDE[parseInt(formPriority, 10)] ?? ''}
                  </Text>
                </View>
                <View style={[styles.recurrenceRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recurrenceTitle, { color: colors.foreground }]}>Recurring budget</Text>
                    <Text style={[styles.recurrenceHint, { color: colors.mutedForeground }]}>
                      {formIsRecurring
                        ? 'Repeats every month'
                        : `Only for ${MONTHS_SHORT[formActiveMonth - 1]} ${formActiveYear}`}
                    </Text>
                  </View>
                  <Switch
                    value={formIsRecurring}
                    onValueChange={(value) => {
                      setFormIsRecurring(value);
                      if (!value && editTarget?.isRecurring !== false) {
                        setFormActiveMonth(month);
                        setFormActiveYear(year);
                      }
                    }}
                    trackColor={{ false: colors.border, true: colors.primary + '88' }}
                    thumbColor={formIsRecurring ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>{editTarget ? 'Save changes' : 'Add category'}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal visible={manageOpen} animationType="slide" transparent onRequestClose={() => { setManageOpen(false); setManagePriority(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
               <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                 {managePriority == null ? 'Edit existing budgets' : `Edit Tier ${managePriority} budgets`}
               </Text>
               <Pressable onPress={() => { setManageOpen(false); setManagePriority(null); }} hitSlop={8}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
               {managedCategories.length === 0 ? (
                <Text style={[styles.manageEmpty, { color: colors.mutedForeground }]}>No budget categories yet.</Text>
               ) : managedCategories.map(category => (
                <Pressable
                  key={category.id}
                  onPress={() => openEdit(category)}
                  style={[styles.manageRow, { borderColor: colors.border, backgroundColor: colors.muted }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.manageName, { color: colors.foreground }]}>{category.name}</Text>
                    <Text style={[styles.manageAmount, { color: colors.mutedForeground }]}>
                      KES {formatKES(category.budgetAmount)} · {category.isRecurring
                        ? 'Recurring monthly'
                        : `One-time for ${MONTHS_SHORT[(category.activeMonth ?? month) - 1]} ${category.activeYear ?? year}`}
                    </Text>
                  </View>
                  <Feather name="edit-2" size={16} color={colors.primary} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={!!ledgerCategory} animationType="slide" transparent onRequestClose={() => setLedgerCategory(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{ledgerCategory?.category ?? 'Category'} spending</Text>
                <Text style={[styles.ledgerMonth, { color: colors.mutedForeground }]}>
                  {MONTHS_SHORT[month - 1]} {year}
                </Text>
              </View>
              <Pressable onPress={() => setLedgerCategory(null)} hitSlop={8} accessibilityLabel="Close spending ledger">
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {ledgerBudgetCategory ? (
              <View style={[styles.ledgerBudgetActions, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <View style={styles.ledgerBudgetCopy}>
                  <Text style={[styles.ledgerBudgetLabel, { color: colors.mutedForeground }]}>BUDGET LIMIT</Text>
                  <Text style={[styles.ledgerBudgetValue, { color: colors.foreground }]}>
                    KES {formatKES(ledgerBudgetCategory.budgetAmount)}
                  </Text>
                  <Text style={[styles.ledgerBudgetHint, { color: colors.mutedForeground }]}>
                    {ledgerBudgetCategory.isRecurring
                      ? 'Repeats every month'
                      : `For ${MONTHS_SHORT[(ledgerBudgetCategory.activeMonth ?? month) - 1]} ${ledgerBudgetCategory.activeYear ?? year}`}
                  </Text>
                </View>
                {canManageCategories ? (
                  <View style={styles.ledgerBudgetButtons}>
                    <Pressable
                      onPress={() => {
                        setLedgerCategory(null);
                        openEdit(ledgerBudgetCategory);
                      }}
                      style={[styles.ledgerBudgetButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${ledgerBudgetCategory.name} budget`}
                    >
                      <Feather name="edit-2" size={13} color={colors.primary} />
                      <Text style={[styles.ledgerBudgetButtonText, { color: colors.primary }]}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setLedgerCategory(null);
                        handleDelete(ledgerBudgetCategory);
                      }}
                      style={[styles.ledgerBudgetButton, { borderColor: colors.destructive + '66', backgroundColor: colors.card }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${ledgerBudgetCategory.name} budget`}
                    >
                      <Feather name="trash-2" size={13} color={colors.destructive} />
                      <Text style={[styles.ledgerBudgetButtonText, { color: colors.destructive }]}>Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={[styles.ledgerBudgetHint, { color: colors.mutedForeground }]}>
                    Only owners and admins can edit or remove this budget.
                  </Text>
                )}
              </View>
            ) : null}
            <ScrollView contentContainerStyle={styles.ledgerBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.ledgerSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.ledgerSummaryValue, { color: colors.foreground }]}>
                  {ledgerLoading ? 'Loading…' : `KES ${formatKES(ledgerCategoryTotal)}`}
                </Text>
                <Text style={[styles.ledgerSummaryLabel, { color: colors.mutedForeground }]}>
                  {ledgerLoading
                    ? 'Loading expenses for this category'
                    : `${ledgerEntries.length} item${ledgerEntries.length === 1 ? '' : 's'} in this budget`}
                </Text>
              </View>
              {ledgerLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 34 }} />
              ) : ledgerError ? (
                <View style={[styles.ledgerState, { borderColor: colors.border }]}>
                  <Feather name="alert-circle" size={24} color={colors.destructive} />
                  <Text style={[styles.ledgerStateTitle, { color: colors.foreground }]}>Could not load spending</Text>
                  <Text style={[styles.ledgerStateText, { color: colors.mutedForeground }]}>Try again to see this category's expenses.</Text>
                  <Pressable onPress={() => refetchLedger()} style={[styles.ledgerRetry, { backgroundColor: colors.primary }]}>
                    <Text style={styles.ledgerRetryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : ledgerEntries.length === 0 ? (
                <View style={[styles.ledgerState, { borderColor: colors.border }]}>
                  <Feather name="inbox" size={25} color={colors.mutedForeground} />
                  <Text style={[styles.ledgerStateTitle, { color: colors.foreground }]}>No spending recorded</Text>
                  <Text style={[styles.ledgerStateText, { color: colors.mutedForeground }]}>
                    No {ledgerCategory?.category} spending was recorded in {MONTHS_SHORT[month - 1]} {year}.
                  </Text>
                </View>
              ) : (
                <>
                  {ledgerEntries.map(entry => {
                    const editHref = getLedgerExpenseEditHref(entry);
                    return (
                    <Pressable
                      key={entry.id}
                      disabled={!editHref}
                      onPress={() => {
                        if (!editHref) return;
                        setLedgerCategory(null);
                        router.push(editHref as never);
                      }}
                      accessibilityRole={editHref ? 'button' : undefined}
                      accessibilityLabel={editHref ? `Edit ${entry.description}` : undefined}
                      style={({ pressed }) => [
                        styles.ledgerExpense,
                        { borderColor: colors.border, backgroundColor: colors.muted },
                        pressed && editHref ? { opacity: 0.75 } : null,
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.ledgerDescription, { color: colors.foreground }]} numberOfLines={2}>{entry.description}</Text>
                        <Text style={[styles.ledgerMeta, { color: colors.mutedForeground }]}>
                          {new Date(`${entry.date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{entry.payerName}
                          {!ledgerCategory?.isBudgeted ? ` · ${entry.category}` : ''}
                          {entry.source === 'bank_disbursement' ? ' · Joint bank disbursement' : ''}
                        </Text>
                        {editHref ? <Text style={[styles.ledgerMeta, { color: colors.primary, marginTop: 3 }]}>Tap to edit expense</Text> : null}
                      </View>
                      <Text style={[styles.ledgerAmount, { color: colors.foreground }]}>KES {formatKES(entry.amount)}</Text>
                      {editHref ? <Feather name="edit-2" size={14} color={colors.primary} /> : null}
                    </Pressable>
                  )})}
                  <View style={[styles.ledgerTotal, { borderTopColor: colors.border }]}>
                    <Text style={[styles.ledgerTotalLabel, { color: colors.mutedForeground }]}>Expense ledger total</Text>
                    <Text style={[styles.ledgerTotalValue, { color: colors.foreground }]}>KES {formatKES(ledgerTotal)}</Text>
                  </View>
                </>
              )}
              <Pressable onPress={() => setLedgerCategory(null)} style={[styles.ledgerClose, { borderColor: colors.border }]}>
                <Text style={[styles.ledgerCloseText, { color: colors.foreground }]}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PageScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }}
      >
        {/* Header */}
        <LinearGradient colors={[colors.brandNavy, '#05255E', colors.brandBlue]} style={[styles.header, { paddingTop: topPad + 16 }]}>
          <WorkspaceIdentityRow group={group} />
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Budget</Text>
            <View style={styles.headerRight}>
              <View style={styles.monthNav}>
                <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                  <Feather name="chevron-left" size={20} color="rgba(247,250,246,0.7)" />
                </Pressable>
                <Text style={styles.monthLabel}>{MONTHS_SHORT[month - 1]} {year}</Text>
                <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8} disabled={isCurrentMonth}>
                  <Feather name="chevron-right" size={20} color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'} />
                </Pressable>
              </View>
              <View style={styles.reportActions}>
                <Pressable onPress={() => openManage()} style={styles.manageBtn} hitSlop={4}>
                  <Feather name="edit-2" size={14} color="#d9fbe5" />
                  <Text style={styles.manageBtnText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => openAdd()} style={styles.addBtn} hitSlop={4}>
                  <Feather name="plus" size={18} color="#4ade80" />
                </Pressable>
              </View>
            </View>
          </View>

          {!isLoading ? (
            <Pressable
              onPress={openOverallLedger}
              accessibilityRole="button"
              accessibilityLabel={summaryBudgetCategories.length === 1
                ? `Open ${summaryBudgetCategories[0].name} budget ledger`
                : 'Open budget categories'}
              testID="budget-overall-ledger"
              style={({ pressed }) => [styles.overallCard, pressed && styles.pressedCard]}
            >
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>BUDGET VS ACTUAL</Text>
                <Text style={styles.overallPct}>{Math.round(overallPct * 100)}%</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.barFill, { width: `${overallPct * 100}%`, backgroundColor: overallPct >= 1 ? '#f87171' : '#4ade80' }]} />
              </View>
              <View style={styles.overallAmounts}>
                <View>
                  <Text style={styles.overallMiniLabel}>BUDGET</Text>
                  <Text style={styles.overallSpent}>KES {formatKES(reportBudget)}</Text>
                </View>
                <View>
                  <Text style={styles.overallMiniLabel}>ACTUAL</Text>
                  <Text style={styles.overallSpent}>KES {formatKES(reportActual)}</Text>
                </View>
                <View>
                  <Text style={styles.overallMiniLabel}>{reportVariance < 0 ? 'OVER' : 'LEFT'}</Text>
                  <Text style={[styles.overallSpent, reportVariance < 0 && { color: '#f87171' }]}>KES {formatKES(Math.abs(reportVariance))}</Text>
                </View>
              </View>
              <View style={styles.overallContextRow}>
                <Feather name="arrow-up-right" size={13} color="#d9fbe5" />
                <Text style={styles.overallContext}>{summaryContext}</Text>
              </View>
            </Pressable>
          ) : <ActivityIndicator color="#4ade80" style={{ marginVertical: 16 }} />}
        </LinearGradient>

        <View style={styles.incomeSection}>
          <View style={styles.incomeHeader}>
            <View>
              <Text style={[styles.incomeTitle, { color: colors.foreground }]}>Income streams</Text>
              <Text style={[styles.incomeSubtitle, { color: colors.mutedForeground }]}>Add and manage the sources that fund your budget</Text>
            </View>
            <Feather name="credit-card" size={19} color={colors.secondary} />
          </View>
          <View style={[styles.incomeAddRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.incomeAddInput, { color: colors.foreground }]}
              placeholder="Income source"
              placeholderTextColor={colors.mutedForeground}
              value={newIncomeSource}
              onChangeText={setNewIncomeSource}
              editable={!addingIncomeSource}
              returnKeyType="done"
              onSubmitEditing={() => void handleAddIncomeSource()}
            />
            <TextInput
              style={[styles.incomeExpectedInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Expected KES"
              placeholderTextColor={colors.mutedForeground}
              value={newIncomeExpected}
              onChangeText={setNewIncomeExpected}
              editable={!addingIncomeSource}
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Pressable
              onPress={() => void handleAddIncomeSource()}
              disabled={addingIncomeSource || !newIncomeSource.trim()}
              style={[styles.incomeAddButton, { backgroundColor: colors.primary, opacity: addingIncomeSource || !newIncomeSource.trim() ? 0.45 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Add income source"
            >
              {addingIncomeSource ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={17} color="#fff" />}
            </Pressable>
          </View>
          {incomeSources.length === 0 ? (
            <View style={[styles.incomeEmpty, { borderColor: colors.border }]}>
              <Text style={[styles.incomeEmptyTitle, { color: colors.foreground }]}>No income streams set up yet</Text>
              <Text style={[styles.incomeEmptyText, { color: colors.mutedForeground }]}>Add your first source above so it is ready for expenses and deposits.</Text>
            </View>
          ) : (
            Array.from(groupedIncomeSources.entries()).map(([userId, sources]) => (
              <View key={userId} style={[styles.incomeGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.incomeMember, { color: colors.mutedForeground }]}>{memberNames.get(userId) ?? 'Group member'}</Text>
                <View style={styles.incomeChips}>
                  {sources.map(source => (
                    <View key={source.id} style={[styles.incomeManagedRow, { borderColor: colors.border }]}>
                      <View style={styles.incomeManagedName}>
                        {editingIncomeSourceId === source.id ? (
                          <TextInput
                            autoFocus
                            value={editingIncomeSourceName}
                            onChangeText={setEditingIncomeSourceName}
                            editable={savingIncomeSourceId !== source.id}
                            style={[styles.incomeEditInput, { borderColor: colors.border, color: colors.foreground }]}
                            accessibilityLabel={`Edit ${source.name}`}
                          />
                        ) : (
                          <View style={styles.incomeNameLine}>
                            <Text style={[styles.incomeChipText, { color: colors.foreground }]} numberOfLines={1}>{source.name}</Text>
                            {source.isMain ? <Text style={[styles.incomeMain, { color: colors.primary }]}>MAIN</Text> : null}
                          </View>
                        )}
                        {canManageSharedIncome && editingIncomeSourceId !== source.id ? (
                          <Text style={[styles.incomeOwner, { color: colors.mutedForeground }]}>
                            For {memberNames.get(source.userId) ?? 'Group member'}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.incomeManagedActions}>
                        <TextInput
                          defaultValue={String(source.expectedMonthlyAmount ?? 0)}
                          keyboardType="numeric"
                          editable={canManageSharedIncome || source.userId === user?.id}
                          onEndEditing={(event) => {
                            if (canManageSharedIncome || source.userId === user?.id) {
                              void handleSaveExpectedIncome(source, event.nativeEvent.text);
                            }
                          }}
                          placeholder="Expected KES"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.incomeExpectedInput, { borderColor: colors.border, color: colors.foreground }]}
                          accessibilityLabel={`Expected monthly income for ${source.name}`}
                        />
                        {(canManageSharedIncome || source.userId === user?.id) ? (
                          editingIncomeSourceId === source.id ? (
                            <View style={styles.incomeEditActions}>
                              <Pressable
                                onPress={() => void handleSaveIncomeSource(source)}
                                disabled={savingIncomeSourceId === source.id || !editingIncomeSourceName.trim()}
                                accessibilityRole="button"
                                accessibilityLabel={`Save ${source.name}`}
                              >
                                {savingIncomeSourceId === source.id
                                  ? <ActivityIndicator size="small" color={colors.primary} />
                                  : <Feather name="check" size={17} color={colors.primary} />}
                              </Pressable>
                              <Pressable
                                onPress={handleCancelEditIncomeSource}
                                disabled={savingIncomeSourceId === source.id}
                                accessibilityRole="button"
                                accessibilityLabel={`Cancel editing ${source.name}`}
                              >
                                <Feather name="x" size={17} color={colors.mutedForeground} />
                              </Pressable>
                            </View>
                          ) : (
                            <View style={styles.incomeEditActions}>
                              <Pressable
                                onPress={() => handleStartEditIncomeSource(source)}
                                accessibilityRole="button"
                                accessibilityLabel={`Edit ${source.name}`}
                                hitSlop={8}
                              >
                                <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleDeleteIncomeSource(source)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${source.name}`}
                                hitSlop={8}
                              >
                                <Feather name="trash-2" size={16} color={colors.destructive} />
                              </Pressable>
                            </View>
                          )
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.tierSection}>
          <View style={styles.tierHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tierTitle, { color: colors.foreground }]}>Priority tier report</Text>
              <Text style={[styles.tierSubtitle, { color: colors.mutedForeground }]}>
                 Tiers help protect essential spending first: Tier 1 is most urgent and Tier 5 can wait.
              </Text>
            </View>
            <Feather name="layers" size={19} color={colors.secondary} />
          </View>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : tierReport.length === 0 ? (
            <View style={[styles.tierEmpty, { borderColor: colors.border }]}>
              <Text style={[styles.tierEmptyText, { color: colors.mutedForeground }]}>
                Add budget categories to see your tier report.
              </Text>
            </View>
          ) : (
            tierReport.map(row => {
              const isOver = row.actual > row.budget && row.budget > 0;
              const ratio = row.budget > 0 ? Math.min(row.actual / row.budget, 1) : 0;
              return (
                <View key={row.tier} style={[styles.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                   <View style={styles.tierCardTop}>
                    <View style={[styles.tierBadge, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={[styles.tierBadgeText, { color: colors.primary }]}>T{row.tier}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tierName, { color: colors.foreground }]}>
                        {PRIORITY_LABELS[row.tier] ?? `Priority ${row.tier}`}
                      </Text>
                      <Text style={[styles.tierDescription, { color: colors.mutedForeground }]}>
                        {PRIORITY_GUIDE[row.tier] ?? 'Spending grouped at this level of urgency.'}
                      </Text>
                    </View>
                     <View style={styles.tierGroupActions}>
                       <Pressable
                         onPress={() => openAdd(row.tier)}
                         style={[styles.tierAction, { borderColor: colors.border, backgroundColor: colors.muted }]}
                         accessibilityRole="button"
                         accessibilityLabel={`Create category in tier ${row.tier}`}
                       >
                         <Feather name="plus" size={13} color={colors.primary} />
                         <Text style={[styles.tierActionText, { color: colors.primary }]}>Add</Text>
                       </Pressable>
                        <Pressable
                          onPress={() => openManage(row.tier)}
                          style={[styles.tierAction, { borderColor: colors.border, backgroundColor: colors.muted }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit categories in tier ${row.tier}`}
                        >
                          <Feather name="edit-2" size={12} color={colors.primary} />
                          <Text style={[styles.tierActionText, { color: colors.primary }]}>Edit</Text>
                        </Pressable>
                       <Text style={[styles.tierAmount, { color: isOver ? colors.destructive : colors.primary }]}>
                         {formatKES(row.actual)}
                       </Text>
                     </View>
                  </View>
                  <View style={[styles.tierTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.tierFill, { width: `${ratio * 100}%`, backgroundColor: isOver ? colors.destructive : colors.primary }]} />
                  </View>
                  <Text style={[styles.tierMeta, { color: colors.mutedForeground }]}>
                    Actual KES {formatKES(row.actual)} · Budget KES {formatKES(row.budget)}
                    {isOver ? ' · Over budget' : row.budget > 0 ? ` · KES ${formatKES(row.budget - row.actual)} left` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Category list */}
        <View style={styles.list}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY CATEGORY</Text>
          {!isLoading && breakdown.length > 0 ? (
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
              {canManageCategories
                ? 'Tap a category to see its expenses. Use Edit or Remove to manage the budget.'
                : 'Tap a category to see the expenses behind its total. Owners and admins manage category budgets.'}
            </Text>
          ) : null}

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
           ) : breakdown.length === 0 && unusedCategories.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="bar-chart-2" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No budget yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Start by adding a category and the amount you want to set aside for it.
              </Text>
              <Pressable
                testID="budget-create-first-category"
                accessibilityRole="button"
                accessibilityLabel="Add your first budget category"
                onPress={() => openAdd()}
                style={[styles.emptyAction, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={17} color={colors.primaryForeground} />
                <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Add first category</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {breakdown.map((cat) => {
                const pct = cat.budgetAmount > 0 ? Math.min(cat.spentAmount / cat.budgetAmount, 1) : 0;
                const isOver = cat.spentAmount > cat.budgetAmount && cat.budgetAmount > 0;
                const icon = getCategoryIcon(cat.category);
                const fullCat = allCategories.find(c => c.name === cat.category);

                return (
                  <Pressable
                    key={cat.category}
                    onPress={() => setLedgerCategory({ category: cat.category, isBudgeted: cat.isBudgeted })}
                    testID={`budget-ledger-${cat.category}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${cat.category} spending`}
                    style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.catTop}>
                      <View style={[styles.catIcon, { backgroundColor: isOver ? '#3a1a1a' : '#1a3320' }]}>
                        <Feather name={icon} size={16} color={isOver ? '#f87171' : '#4ade80'} />
                      </View>
                      <View style={styles.catInfo}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat.category}</Text>
                        <Text style={[styles.catFrequency, { color: colors.mutedForeground }]}>
                          {!cat.isBudgeted
                            ? 'No active budget assigned'
                            : cat.isRecurring
                            ? 'Recurring monthly'
                            : `One-time · ${MONTHS_SHORT[(cat.activeMonth ?? month) - 1]} ${cat.activeYear ?? year}`}
                        </Text>
                        <Text style={[styles.catRemaining, { color: isOver ? '#f87171' : colors.mutedForeground }]}>
                          {isOver ? `KES ${formatKES(cat.spentAmount - cat.budgetAmount)} over` : `KES ${formatKES(cat.remaining)} left`}
                        </Text>
                      </View>
                      <View style={styles.catActions}>
                        <View style={styles.catAmounts}>
                          <Text style={[styles.catSpent, { color: colors.foreground }]}>{formatKES(cat.spentAmount)}</Text>
                          <Text style={[styles.catBudget, { color: colors.mutedForeground }]}>/ {formatKES(cat.budgetAmount)}</Text>
                        </View>
                        {fullCat && canManageCategories && (
                          <>
                            <Pressable onPress={() => openEdit(fullCat)} hitSlop={8} style={styles.editBtn}>
                              <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                              <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => handleDelete(fullCat)} hitSlop={8} style={styles.editBtn}>
                              <Feather name="trash-2" size={13} color="#ef4444" />
                              <Text style={[styles.editBtnText, { color: '#ef4444' }]}>Remove</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: isOver ? '#f87171' : '#4ade80' }]} />
                    </View>
                    <View style={styles.viewSpendingRow}>
                      <Text style={[styles.viewSpendingText, { color: colors.primary }]}>View spending</Text>
                      <Feather name="arrow-right" size={15} color={colors.primary} />
                    </View>
                  </Pressable>
                );
              })}
              {unusedCategories.map((cat) => {
                const icon = getCategoryIcon(cat.name);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setLedgerCategory({ category: cat.name, isBudgeted: true })}
                    testID={`budget-ledger-${cat.name}`}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${cat.name} spending`}
                    style={[styles.catCard, styles.catCardMuted, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.catTop}>
                      <View style={[styles.catIcon, { backgroundColor: '#1a3320' }]}>
                        <Feather name={icon} size={16} color="#4ade80" />
                      </View>
                      <View style={styles.catInfo}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat.name}</Text>
                        <Text style={[styles.catFrequency, { color: colors.mutedForeground }]}>
                          {cat.isRecurring
                            ? 'Recurring monthly'
                            : `One-time · ${MONTHS_SHORT[(cat.activeMonth ?? month) - 1]} ${cat.activeYear ?? year}`}
                        </Text>
                        <Text style={[styles.catRemaining, { color: colors.mutedForeground }]}>
                          No spending recorded
                        </Text>
                      </View>
                      <View style={styles.catActions}>
                        <View style={styles.catAmounts}>
                          <Text style={[styles.catSpent, { color: colors.foreground }]}>0</Text>
                          <Text style={[styles.catBudget, { color: colors.mutedForeground }]}>/ {formatKES(cat.budgetAmount)}</Text>
                        </View>
                        {canManageCategories && (
                          <>
                            <Pressable onPress={() => openEdit(cat)} hitSlop={8} style={styles.editBtn} accessibilityLabel={`Edit ${cat.name} budget`}>
                              <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                              <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => handleDelete(cat)} hitSlop={8} style={styles.editBtn} accessibilityLabel={`Remove ${cat.name} budget`}>
                              <Feather name="trash-2" size={13} color="#ef4444" />
                              <Text style={[styles.editBtnText, { color: '#ef4444' }]}>Remove</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.border }]} />
                    <View style={styles.viewSpendingRow}>
                      <Text style={[styles.viewSpendingText, { color: colors.primary }]}>View spending</Text>
                      <Feather name="arrow-right" size={15} color={colors.primary} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </PageScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '700' as const, color: '#F4F8FF', fontFamily: 'Inter_700Bold' },
   headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
   reportActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 14, color: '#F4F8FF', fontFamily: 'Inter_500Medium', minWidth: 64, textAlign: 'center' },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center' },
   manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)' },
   manageBtnText: { color: '#d9fbe5', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  overallCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16 },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overallLabel: { fontSize: 12, color: '#A5B9D4', fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  overallPct: { fontSize: 14, fontWeight: '700' as const, color: '#F4F8FF', fontFamily: 'Inter_700Bold' },
   overallAmounts: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 },
   overallMiniLabel: { color: '#A5B9D4', fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 3 },
  overallSpent: { fontSize: 16, fontWeight: '700' as const, color: '#F4F8FF', fontFamily: 'Inter_700Bold' },
  overallTarget: { fontSize: 14, color: '#A5B9D4', fontFamily: 'Inter_400Regular', alignSelf: 'flex-end' },
  overallContextRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 13 },
  overallContext: { flex: 1, color: '#d9fbe5', fontSize: 11, fontFamily: 'Inter_500Medium' },
  pressedCard: { opacity: 0.82 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
   incomeSection: { paddingHorizontal: 16, paddingTop: 18 },
   incomeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 4, marginBottom: 10 },
   incomeTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
   incomeSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
   incomeEmpty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 16, alignItems: 'center' },
   incomeEmptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
   incomeEmptyText: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
   incomeAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 10 },
   incomeAddInput: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, fontFamily: 'Inter_400Regular' },
   incomeExpectedInput: { width: 92, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 6, fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right' },
   incomeAddButton: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
   incomeGroup: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
   incomeMember: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 },
   incomeChips: { gap: 8 },
   incomeManagedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
   incomeManagedName: { flex: 1, minWidth: 0 },
   incomeManagedActions: { alignItems: 'flex-end', gap: 7 },
   incomeNameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
   incomeChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
   incomeMain: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, opacity: 0.7 },
   incomeOwner: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
   incomeEditInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, fontFamily: 'Inter_400Regular' },
   incomeEditActions: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 18 },
  list: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  sectionHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginHorizontal: 4, marginTop: -6, marginBottom: 12 },
  catCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  catCardMuted: { opacity: 0.76 },
  catTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
   catFrequency: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
  catRemaining: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  catActions: { alignItems: 'flex-end', gap: 4 },
  catAmounts: { alignItems: 'flex-end' },
  catSpent: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  catBudget: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 3 },
  editBtnText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  viewSpendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  viewSpendingText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 6 },
  emptyActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '85%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  modalBody: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: 'Inter_400Regular' },
  priorityRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  priorityChipText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  priorityHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  priorityGuide: { borderRadius: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: 10 },
  priorityGuideText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 },
   recurrenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 14 },
   recurrenceTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
   recurrenceHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
   manageRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
   manageName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
   manageAmount: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
   manageEmpty: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 28 },
  ledgerMonth: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  ledgerBody: { paddingHorizontal: 20, paddingBottom: 26 },
  ledgerSummary: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  ledgerSummaryValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  ledgerSummaryLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  ledgerBudgetActions: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, marginHorizontal: 20, marginBottom: 2, padding: 12 },
  ledgerBudgetCopy: { flex: 1 },
  ledgerBudgetLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7 },
  ledgerBudgetValue: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 3 },
  ledgerBudgetHint: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14, marginTop: 3 },
  ledgerBudgetButtons: { alignItems: 'flex-end', gap: 6 },
  ledgerBudgetButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, minWidth: 72, justifyContent: 'center' },
  ledgerBudgetButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  ledgerState: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 24, alignItems: 'center', marginVertical: 8 },
  ledgerStateTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 10 },
  ledgerStateText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, textAlign: 'center', marginTop: 4 },
  ledgerRetry: { borderRadius: 10, paddingHorizontal: 15, paddingVertical: 9, marginTop: 14 },
  ledgerRetryText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ledgerExpense: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 },
  ledgerDescription: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  ledgerMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  ledgerAmount: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  ledgerTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 14, marginTop: 8 },
  ledgerTotalLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  ledgerTotalValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  ledgerClose: { borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 18 },
  ledgerCloseText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  tierSection: { paddingHorizontal: 16, paddingTop: 24 },
  tierHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  tierTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  tierSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 3 },
  tierEmpty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center' },
  tierEmptyText: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  tierCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  tierCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tierBadge: { minWidth: 36, height: 28, paddingHorizontal: 7, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tierBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tierName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  tierDescription: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15, marginTop: 2 },
  tierAmount: { fontSize: 13, fontFamily: 'Inter_700Bold', marginLeft: 6 },
   tierGroupActions: { alignItems: 'flex-end', gap: 7, marginLeft: 6 },
   tierAction: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
   tierActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  tierTrack: { height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  tierFill: { height: '100%', borderRadius: 4 },
  tierMeta: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 7 },
});
