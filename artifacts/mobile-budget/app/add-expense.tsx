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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useGetExpenses,
  useGetBudgetCategories,
  useCreateBudgetCategory,
  useUpdateBudgetCategory,
  useGetMembers,
  useGetGroup,
  useGetJointAccounts,
  useGetJointAccount,
  useCreateJointAccount,
  useGetDashboardCategoryBreakdown,
  getGetExpensesQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetBudgetCategoriesQueryKey,
  getGetJointAccountsQueryKey,
  getGetDashboardCategoryBreakdownQueryKey,
  getGetDashboardCategoryLedgerQueryKey,
  getGetDashboardIncomeStreamsQueryKey,
  getGetContributionsQueryKey,
  customFetch,
  ApiError,
} from '@workspace/api-client-react';
import { getCategoryIcon } from '@/lib/categoryIcons';
import {
  addFundingSourceWithRemainder,
  buildSinglePayerFundingReplacement,
  getExpenseFundingControlState,
  getFundingRemainder,
  getNewExpenseCategoryMode,
  hydrateCategoryAllocations,
  preserveExpenseSplitsForAmount,
} from '@/lib/expenseFundingPreservation';

const PALETTE = ['#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#3b82f6', '#a855f7', '#ef4444'];
const RECURRING_BUDGET_HANDOFF_KEY = 'jamvi:recurring-budget-handoff';
type IncomeSource = { id: number; name: string; isMain: boolean; userId: string };
type ExpenseRecord = {
  id: number;
  amount: number;
  category: string;
  categoryAllocations?: Array<{ category: string; amount: number }>;
  description: string;
  notes?: string | null;
  paidById: string | null;
  incomeSourceId?: number | null;
  paidFromBank?: boolean;
  accountId?: number | null;
  incomeSplits?: {
    userId?: string | null;
    label?: string;
    amount: number;
    incomeSourceId?: number;
    fromBank: boolean;
    accountId?: number;
  }[];
  isRecurring: boolean;
  date: string;
};
type CategoryAllocation = { category: string; amount: string };
type ExpenseBudgetDraft = {
  amount: string;
  category: string;
  categoryAllocations: CategoryAllocation[];
  description: string;
  notes: string;
  payerIds: string[];
  payerAmounts: Record<string, string>;
  payerIncomeSourceIds: Record<string, number | null>;
  isRecurring: boolean;
  recurringMonthlyBudget: string;
  paidFromBank: boolean;
  selectedBankAccountId: number | null;
  selectedSources: string[];
  splitAmounts: Record<string, string>;
  allowMixedFunding: boolean;
  date: string;
};
type BudgetHandoff = {
  categoryName?: string;
  expenseDraft?: ExpenseBudgetDraft;
  monthlyBudget?: string;
  isRecurring?: boolean;
};

function getExpenseSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    const responseError = error.data;
    if (
      responseError &&
      typeof responseError === 'object' &&
      'error' in responseError &&
      typeof responseError.error === 'string'
    ) {
      return responseError.error;
    }
    if (error.status === 400) {
      return 'The expense details were not accepted. Check the amount, payer, and funding source.';
    }
  }
  return 'Failed to save expense. Please check your connection and try again.';
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function formatDateDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function incomeSourceKey(id: number): string {
  return `source:${id}`;
}

function incomeSourceIdFromKey(key: string): number | null {
  const match = /^source:(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

export default function AddExpenseSheet() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ edit?: string | string[]; month?: string | string[]; year?: string | string[] }>();
  const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const monthParam = Array.isArray(params.month) ? params.month[0] : params.month;
  const yearParam = Array.isArray(params.year) ? params.year[0] : params.year;
  const editId = editParam && /^\d+$/.test(editParam) ? Number(editParam) : null;
  const editMonth = monthParam && /^(?:[1-9]|1[0-2])$/.test(monthParam)
    ? Number(monthParam)
    : new Date().getMonth() + 1;
  const editYear = yearParam && /^\d{4}$/.test(yearParam)
    ? Number(yearParam)
    : new Date().getFullYear();
  const isEditMode = editId !== null;

  const categoriesQuery = useGetBudgetCategories();
  const categories = categoriesQuery.data ?? [];
  const { data: members = [] } = useGetMembers();
  const { data: group } = useGetGroup();
  const { data: bankAccounts = [] } = useGetJointAccounts();
  const editExpensesQuery = useGetExpenses(
    { month: editMonth, year: editYear },
    { query: { queryKey: getGetExpensesQueryKey({ month: editMonth, year: editYear }), enabled: isEditMode } },
  );
  const editingExpense = ((editExpensesQuery.data ?? []) as ExpenseRecord[])
    .find((expense) => expense.id === editId);
  const canManageShared = group?.isPrivate === true
    || group?.role === 'owner'
    || group?.role === 'admin'
    || members.some(
      (member) =>
        member.userId === user?.id &&
        (member.role === 'owner' || member.role === 'admin'),
    );
  const isSharedWorkspace = group?.isPrivate === false;
  const originalPersonalPayerId = editingExpense?.paidById
    ?? editingExpense?.incomeSplits?.find((split) => !split.fromBank)?.userId
    ?? null;
  const originalHasBankFunding = editingExpense?.paidFromBank === true
    || editingExpense?.incomeSplits?.some((split) => split.fromBank) === true;
  const originalIsSelfFunded = !!user?.id
    && originalPersonalPayerId === user.id
    && !originalHasBankFunding
    && editingExpense?.isRecurring !== true
    && (editingExpense?.incomeSplits ?? []).every(
      (split) => !split.fromBank && (!split.userId || split.userId === user.id),
    );
  const canEditExpense = !editingExpense
    || canManageShared
    || (isSharedWorkspace && editingExpense.date.slice(0, 10) === todayIso() && originalIsSelfFunded);
  const canRemoveExpense = !!editingExpense
    && (canManageShared || (!isSharedWorkspace && originalPersonalPayerId === user?.id));
  const canManageCategories = members.some(
    (member) => member.userId === user?.id && (member.role === 'owner' || member.role === 'admin'),
  );
  const selectablePayers = canManageShared
    ? members
    : members.filter((member) => member.userId === user?.id);
  const now = new Date();
  const { data: breakdown } = useGetDashboardCategoryBreakdown({ month: now.getMonth() + 1, year: now.getFullYear() });

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [categoryAllocations, setCategoryAllocations] = useState<CategoryAllocation[]>([]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [payerIds, setPayerIds] = useState<string[]>([]);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [payerIncomeSourceIds, setPayerIncomeSourceIds] = useState<Record<string, number | null>>({});
  const paidById = payerIds.length === 1 ? payerIds[0] : '';
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonthlyBudget, setRecurringMonthlyBudget] = useState('');
  // Funding — joint bank toggle + personal income sources from DB
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<number | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [newSourcePayerId, setNewSourcePayerId] = useState<string | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryBudget, setNewCategoryBudget] = useState('');
  const [newCategoryRecurring, setNewCategoryRecurring] = useState(true);
  const [newCategoryPriority, setNewCategoryPriority] = useState('3');
  const [newCategoryAddToBudget, setNewCategoryAddToBudget] = useState(false);
  const [showAdditionalCategoryPicker, setShowAdditionalCategoryPicker] = useState(false);
  const [allowMixedFunding, setAllowMixedFunding] = useState(false);
  const [isAddingBankAccount, setIsAddingBankAccount] = useState(false);
  const [newBankAccountName, setNewBankAccountName] = useState('');
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
  const [newBankOpeningBalance, setNewBankOpeningBalance] = useState('');
  const [editHydratedForId, setEditHydratedForId] = useState<number | null>(null);
  const [editFundingHydratedForId, setEditFundingHydratedForId] = useState<number | null>(null);
  const [fundingDirty, setFundingDirty] = useState(false);
  const { data: selectedBankAccount } = useGetJointAccount(
    selectedBankAccountId ? { accountId: selectedBankAccountId } : undefined,
  );
  const enteredBankAmount = parseFloat(payerAmounts.__joint_bank__ || '0') || 0;
  const originalBankAmount = editingExpense?.incomeSplits?.find((split) => split.fromBank)?.amount
    ?? (editingExpense?.paidFromBank ? editingExpense.amount : 0);
  const projectedExpenseBankBalance = paidFromBank &&
    selectedBankAccount &&
    enteredBankAmount > 0
    ? selectedBankAccount.balance + originalBankAmount - enteredBankAmount
    : null;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(RECURRING_BUDGET_HANDOFF_KEY)
        .then(async (raw) => {
          if (!active || !raw) return;
          const result = JSON.parse(raw) as BudgetHandoff;
          if (result.isRecurring && result.monthlyBudget) {
            setIsRecurring(true);
            setRecurringMonthlyBudget(result.monthlyBudget);
          }
          if (result.expenseDraft) {
            const draft = result.expenseDraft;
            setAmount(draft.amount);
            setCategory(draft.category);
            setCategoryAllocations(draft.categoryAllocations);
            setDescription(draft.description);
            setNotes(draft.notes);
            setPayerIds(draft.payerIds);
            setPayerAmounts(draft.payerAmounts);
            setPayerIncomeSourceIds(draft.payerIncomeSourceIds);
            setIsRecurring(draft.isRecurring);
            setRecurringMonthlyBudget(draft.recurringMonthlyBudget);
            setPaidFromBank(draft.paidFromBank);
            setSelectedBankAccountId(draft.selectedBankAccountId);
            setSelectedSources(draft.selectedSources);
            setSplitAmounts(draft.splitAmounts);
            setAllowMixedFunding(draft.allowMixedFunding);
            setDate(draft.date);
          }
          if (result.categoryName) {
            setCategory(result.categoryName);
            setCategoryAllocations((current) => current.length > 0
              ? current
              : [{ category: result.categoryName!, amount: result.expenseDraft?.amount ?? amount }]);
          }
          await AsyncStorage.removeItem(RECURRING_BUDGET_HANDOFF_KEY);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

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
  const payerSourceIds = [...new Set(payerIds)].sort();
  const { data: payerIncomeSources = {}, isLoading: payerSourcesLoading } = useQuery<Record<string, IncomeSource[]>>({
    queryKey: ['income-sources', 'payers', payerSourceIds],
    queryFn: async () => {
      const entries = await Promise.all(payerSourceIds.map(async (userId) => {
        const sources = await customFetch<IncomeSource[]>(`/api/income-sources?userId=${encodeURIComponent(userId)}`);
        return [userId, sources] as const;
      }));
      return Object.fromEntries(entries);
    },
    enabled: payerSourceIds.length > 0,
    staleTime: 60_000,
  });

  // Reset funding selections whenever the payer changes
  useEffect(() => {
    if (isEditMode) return;
    if (!paidById || payerIds.length !== 1) return;
    setSelectedSources([]);
    setSplitAmounts({});
    setNewSourcePayerId(null);
    setNewSourceName('');
  }, [isEditMode, paidById, payerIds.length]);

  useEffect(() => {
    if (!canManageShared && user?.id) {
      setPayerIds([user.id]);
      setPaidFromBank(false);
      setAllowMixedFunding(false);
      setIsRecurring(false);
    }
  }, [canManageShared, user?.id]);

  useEffect(() => {
    if (canManageShared && !paidFromBank && payerIds.length === 0 && selectablePayers.length === 1) {
      setPayerIds([selectablePayers[0].userId]);
    }
  }, [canManageShared, paidFromBank, payerIds.length, selectablePayers]);

  useEffect(() => {
    if (!editingExpense || editHydratedForId === editingExpense.id) return;

    const storedSplits = editingExpense.incomeSplits ?? [];
    const bankAmount = storedSplits
      .filter((split) => split.fromBank)
      .reduce((sum, split) => sum + split.amount, 0);
    const personalAmounts: Record<string, string> = {};
    const sourceIds: Record<string, number | null> = {};
    for (const split of storedSplits) {
      if (split.fromBank || !split.userId) continue;
      personalAmounts[split.userId] = String(
        (Number(personalAmounts[split.userId]) || 0) + split.amount,
      );
      if (split.incomeSourceId) sourceIds[split.userId] = split.incomeSourceId;
    }

    const personalPayerIds = [...new Set(
      storedSplits
        .filter((split) => !split.fromBank && split.userId)
        .map((split) => split.userId as string),
    )];
    if (personalPayerIds.length === 0 && editingExpense.paidById) {
      personalPayerIds.push(editingExpense.paidById);
      personalAmounts[editingExpense.paidById] = String(editingExpense.amount);
      sourceIds[editingExpense.paidById] = editingExpense.incomeSourceId ?? null;
    }

    const hasBankFunding = editingExpense.paidFromBank === true
      || storedSplits.some((split) => split.fromBank);
    setAmount(String(editingExpense.amount));
    const hydratedAllocations = hydrateCategoryAllocations(
      editingExpense.category,
      editingExpense.amount,
      editingExpense.categoryAllocations,
    ).map((allocation) => ({ category: allocation.category, amount: String(allocation.amount) }));
    setCategory(hydratedAllocations[0]?.category ?? '');
    setCategoryAllocations(hydratedAllocations);
    setDescription(editingExpense.description);
    setNotes(editingExpense.notes ?? '');
    setDate(editingExpense.date.slice(0, 10));
    setIsRecurring(editingExpense.isRecurring);
    setRecurringMonthlyBudget(
      editingExpense.isRecurring
        ? String(categories.find((item) => item.name === editingExpense.category)?.budgetAmount || '')
        : '',
    );
    setPayerIds(personalPayerIds);
    setPaidFromBank(hasBankFunding);
    setAllowMixedFunding(false);
    setSelectedBankAccountId(
      editingExpense.accountId
      ?? storedSplits.find((split) => split.fromBank)?.accountId
      ?? null,
    );
    setPayerAmounts({
      ...personalAmounts,
      ...(hasBankFunding ? { __joint_bank__: String(bankAmount || editingExpense.amount) } : {}),
    });
    setPayerIncomeSourceIds(sourceIds);
    setSelectedSources([]);
    setSplitAmounts({});
    setEditFundingHydratedForId(null);
    setFundingDirty(false);
    setEditHydratedForId(editingExpense.id);
  }, [editHydratedForId, editingExpense]);

  useEffect(() => {
    if (
      !editingExpense
      || editHydratedForId !== editingExpense.id
      || editFundingHydratedForId === editingExpense.id
    ) return;

    const sourceCount = payerIds.length + (paidFromBank ? 1 : 0);
    if (sourceCount > 1) {
      setEditFundingHydratedForId(editingExpense.id);
      return;
    }
    if (paidById && sourcesLoading) return;

    const selected: string[] = [];
    const amounts: Record<string, string> = {};
    const personalSplits = (editingExpense.incomeSplits ?? []).filter((split) => !split.fromBank);

    if (personalSplits.length === 0 && editingExpense.incomeSourceId) {
      const key = incomeSourceKey(editingExpense.incomeSourceId);
      selected.push(key);
      amounts[key] = String(editingExpense.amount);
    } else {
      for (const [index, split] of personalSplits.entries()) {
        const key = split.incomeSourceId
          ? incomeSourceKey(split.incomeSourceId)
          : `legacy:${index}:${split.label?.trim() || 'Personal funds'}`;
        if (!selected.includes(key)) selected.push(key);
        amounts[key] = String((Number(amounts[key]) || 0) + split.amount);
      }
    }

    setSelectedSources(selected);
    setSplitAmounts(amounts);
    setEditFundingHydratedForId(editingExpense.id);
  }, [
    editFundingHydratedForId,
    editHydratedForId,
    editingExpense,
    incomeSources,
    paidById,
    paidFromBank,
    payerIds.length,
    sourcesLoading,
  ]);

  const { mutateAsync: createExpenseAsync } = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateBudgetCategory();
  const updateCategory = useUpdateBudgetCategory();
  const createBankAccount = useCreateJointAccount();
  const [isPending, setIsPending] = useState(false);

  const invalidateExpenses = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryLedgerQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardIncomeStreamsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetContributionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['member-breakdown'] });
  }, [queryClient]);

  const handleCreateIncomeSource = useCallback(async (userId: string) => {
    const name = newSourceName.trim();
    if (!name) {
      Alert.alert('Source name required', 'Enter a name before adding the income source.');
      return;
    }
    setIsCreatingSource(true);
    try {
      const source = await customFetch<IncomeSource>('/api/income-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, isMain: false }),
      });
      queryClient.invalidateQueries({ queryKey: ['income-sources', userId] });
      queryClient.invalidateQueries({ queryKey: ['income-sources', 'payers'] });
      if (userId === paidById) {
        queryClient.setQueryData<IncomeSource[]>(['income-sources', paidById], (previous = []) => [
          ...previous.filter((item) => item.id !== source.id),
          source,
        ]);
        const sourceKey = incomeSourceKey(source.id);
        const assigned = selectedSources.reduce(
          (sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0),
          0,
        );
        const total = parseFloat(amount.replace(/,/g, '')) || 0;
        const remainder = total - assigned;
        const shouldAddAsAnotherPortion = selectedSources.length > 0
          && Number.isInteger(remainder)
          && remainder > 0;

        if (shouldAddAsAnotherPortion) {
          setSelectedSources((previous) => previous.includes(sourceKey) ? previous : [...previous, sourceKey]);
          setSplitAmounts((previous) => ({ ...previous, [sourceKey]: String(remainder) }));
        } else {
          setSelectedSources([sourceKey]);
        }
        if (isEditMode) setFundingDirty(true);
      } else {
        queryClient.setQueryData<Record<string, IncomeSource[]>>(
          ['income-sources', 'payers', payerSourceIds],
          (previous = {}) => ({
            ...previous,
            [userId]: [...(previous[userId] ?? []).filter((item) => item.id !== source.id), source],
          }),
        );
      }
      setPayerIncomeSourceIds((previous) => ({ ...previous, [userId]: source.id }));
      setNewSourceName('');
      setNewSourcePayerId(null);
      const assigned = selectedSources.reduce(
        (sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0),
        0,
      );
      const total = parseFloat(amount.replace(/,/g, '')) || 0;
      const remainder = total - assigned;
      Alert.alert(
        'Income source added',
        userId === paidById && selectedSources.length > 0 && Number.isInteger(remainder) && remainder > 0
          ? `${source.name} was added with the remaining KES ${remainder.toLocaleString()}.`
          : `${source.name} is ready to use for this expense.`,
      );
    } catch (error) {
      Alert.alert('Could not add income source', getExpenseSaveError(error));
    } finally {
      setIsCreatingSource(false);
    }
  }, [amount, isEditMode, newSourceName, paidById, payerSourceIds, queryClient, selectedSources, splitAmounts]);

  const handleCreateCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert('Category name required', 'Give this spending a clear name, such as Transport or Childcare.');
      return;
    }
    if (categories.some((category) => category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      Alert.alert('Category already exists', 'Select the existing category from the list instead.');
      return;
    }
    if (getNewExpenseCategoryMode({
      addToBudget: newCategoryAddToBudget,
      canManageCategories,
    }) === 'unbudgeted') {
       setCategory(name);
       setCategoryAllocations([{ category: name, amount: '' }]);
      setNewCategoryName('');
      setNewCategoryBudget('');
      setNewCategoryRecurring(true);
      setNewCategoryPriority('3');
      setNewCategoryAddToBudget(false);
      setIsCreatingCategory(false);
      Alert.alert('Unbudgeted category selected', `${name} will be recorded without changing the monthly budget.`);
      return;
    }

    const budgetAmount = Number(newCategoryBudget);
    const priority = Number(newCategoryPriority);
    const [expenseYear, expenseMonth] = date.split('-').map(Number);
    if (!Number.isInteger(budgetAmount) || budgetAmount < 0) {
      Alert.alert('Enter a valid monthly budget', 'Use a whole number of KES or zero.');
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      Alert.alert('Choose a valid priority', 'Select a priority from 1 (must-pay) to 5 (flexible).');
      return;
    }

    try {
      const created = await createCategory.mutateAsync({
        data: {
          name,
          budgetAmount,
          priority,
          isRecurring: newCategoryRecurring,
          activeMonth: newCategoryRecurring ? null : expenseMonth,
          activeYear: newCategoryRecurring ? null : expenseYear,
        },
      });
       setCategory(created.name);
       setCategoryAllocations([{ category: created.name, amount: '' }]);
      setNewCategoryName('');
      setNewCategoryBudget('');
      setNewCategoryRecurring(true);
      setNewCategoryPriority('3');
      setNewCategoryAddToBudget(false);
      setIsCreatingCategory(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ['budget-categories-full'] }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ]);
      Alert.alert('Category added', `${created.name} is selected for this expense.`);
    } catch (error) {
      const duplicate = error instanceof ApiError && error.status === 409;
      Alert.alert(
        duplicate ? 'Category name already used' : 'Could not add category',
        duplicate
          ? 'Choose a different name or select the existing category from the list.'
          : error instanceof Error ? error.message : 'Check the category details and try again.',
      );
    }
  }, [canManageCategories, categories, createCategory, date, newCategoryAddToBudget, newCategoryBudget, newCategoryName, newCategoryPriority, newCategoryRecurring, queryClient]);

  const handleCreateBankAccount = useCallback(async () => {
    const name = newBankAccountName.trim();
    const accountNumber = newBankAccountNumber.trim();
    const openingBalance = Number(newBankOpeningBalance || 0);
    if (!name) {
      Alert.alert('Account name required', 'Enter a name for this bank account.');
      return;
    }
    try {
      if (!Number.isInteger(openingBalance) || openingBalance < 0) throw new Error('Opening balance must be zero or more whole shillings.');
      const created = await createBankAccount.mutateAsync({ data: { name, accountNumber: accountNumber || undefined, openingBalance } });
      setSelectedBankAccountId(created.id);
      setNewBankAccountName('');
      setNewBankAccountNumber('');
      setNewBankOpeningBalance('');
      setIsAddingBankAccount(false);
      await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      Alert.alert('Bank account added', `${created.name} is selected for this expense.`);
    } catch (error) {
      Alert.alert('Could not add bank account', error instanceof Error ? error.message : 'Check the account name and try again.');
    }
  }, [createBankAccount, newBankAccountName, newBankAccountNumber, newBankOpeningBalance, queryClient]);

  const chooseCategory = useCallback((name: string) => {
    setCategoryAllocations((previous) => {
      if (previous.some((allocation) => allocation.category === name)) return previous;
      const next = [...previous, { category: name, amount: '' }];
      setCategory(next[0].category);
      return next;
    });
    setCategory((previous) => previous || name);
    setIsCreatingCategory(false);
    setShowAdditionalCategoryPicker(false);
  }, []);

  const updateAllocationAmount = useCallback((allocationCategory: string, value: string) => {
    setCategoryAllocations((previous) => previous.map((allocation) => (
      allocation.category === allocationCategory ? { ...allocation, amount: value } : allocation
    )));
  }, []);

  const removeAllocation = useCallback((allocationCategory: string) => {
    setCategoryAllocations((previous) => {
      const next = previous.filter((allocation) => allocation.category !== allocationCategory);
      setCategory(next[0]?.category ?? '');
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async (allowUncategorized = false) => {
    if (isEditMode && (!editingExpense || !canEditExpense)) {
      Alert.alert(
        'You cannot edit this expense',
        'Members can edit only their own personal expenses dated today.',
      );
      return;
    }
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!parsed || parsed <= 0) {
      Alert.alert('Amount required', 'Please enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please add a description.');
      return;
    }
    if (!categoryAllocations.length && !isEditMode && !allowUncategorized) {
      const expenseDraft: ExpenseBudgetDraft = {
        amount, category, categoryAllocations, description, notes, payerIds, payerAmounts,
        payerIncomeSourceIds, isRecurring, recurringMonthlyBudget, paidFromBank,
        selectedBankAccountId, selectedSources, splitAmounts, allowMixedFunding, date,
      };
      Alert.alert(
        'Add a category later?',
        'Categories are optional. You can save this expense without one, or create a monthly budget now.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save without category', onPress: () => void handleSubmit(true) },
          {
            text: 'Create a monthly budget',
            onPress: async () => {
              await AsyncStorage.setItem(RECURRING_BUDGET_HANDOFF_KEY, JSON.stringify({ expenseDraft }));
              router.push({
                pathname: '/(tabs)/budget',
                params: { recurringSetup: '1', category: description.trim() },
              });
            },
          },
        ],
      );
      return;
    }
    const normalizedAllocations = categoryAllocations
      .filter((allocation) => allocation.category.trim())
      .map((allocation) => ({
        category: allocation.category.trim(),
        amount: Number(allocation.amount.replace(/,/g, '')),
      }));
    if (normalizedAllocations.length > 0 && normalizedAllocations.some(
      (allocation) => !Number.isInteger(allocation.amount) || allocation.amount <= 0,
    )) {
      Alert.alert('Allocation amounts required', 'Enter a positive whole-KES amount for every category.');
      return;
    }
    const allocatedTotal = normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (normalizedAllocations.length > 0 && allocatedTotal !== parsed) {
      const difference = parsed - allocatedTotal;
      Alert.alert(
        difference > 0 ? 'Category amounts still needed' : 'Category amounts exceed the expense',
        difference > 0
          ? `Allocate the remaining KES ${difference.toLocaleString()} before saving.`
          : `Reduce category allocations by KES ${Math.abs(difference).toLocaleString()}.`,
      );
      return;
    }
    const effectivePayerIds = canManageShared ? payerIds : user?.id ? [user.id] : [];
    const effectivePaidFromBank = canManageShared ? paidFromBank : false;
    const effectiveIsRecurring = canManageShared ? isRecurring : false;
    if (effectiveIsRecurring && normalizedAllocations.length > 1) {
      Alert.alert(
        'Recurring expenses need one category',
        'A recurring expense cannot be split across categories yet because each recurring expense updates one category budget. Save this as a one-time expense or use one category.',
      );
      return;
    }
    const recurringBudget = Number(recurringMonthlyBudget);
    if (effectiveIsRecurring && (!Number.isInteger(recurringBudget) || recurringBudget <= 0)) {
      Alert.alert('Monthly budget required', 'Enter a whole KES amount greater than zero for this recurring expense.');
      return;
    }
    if (effectivePayerIds.length === 0 && !effectivePaidFromBank) {
      Alert.alert('Paid by required', 'Please choose who paid.');
      return;
    }
    if (effectivePaidFromBank && !selectedBankAccountId) {
      Alert.alert('Bank account required', 'Choose the bank account that funded this expense.');
      return;
    }
    if (date > todayIso()) {
      Alert.alert('Future date not allowed', 'This records actual spending — please use today or an earlier date.');
      return;
    }

    if (isEditMode && editingExpense && !fundingDirty) {
      const preservedSplits = preserveExpenseSplitsForAmount(
        editingExpense.incomeSplits ?? [],
        parsed,
      );
      if (preservedSplits === null) {
        Alert.alert(
          'Amount is too small',
          'The new amount cannot keep every existing funding portion. Update the funding selections or enter a larger amount.',
        );
        return;
      }
      setIsPending(true);
      try {
        const data = {
          amount: parsed,
          category: normalizedAllocations[0]?.category ?? '',
          categoryAllocations: normalizedAllocations,
          description: description.trim(),
          notes: notes.trim() || undefined,
          paidById: editingExpense.paidById,
          isRecurring: canManageShared ? isRecurring : editingExpense.isRecurring,
          date,
          paidFromBank: editingExpense.paidFromBank,
          ...(editingExpense.paidFromBank ? { accountId: selectedBankAccountId! } : {}),
          ...(preservedSplits.length > 0 ? { incomeSplits: preservedSplits } : {}),
        } as Parameters<typeof updateExpense.mutateAsync>[0]['data'];
        await updateExpense.mutateAsync({ id: editingExpense.id, data });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateExpenses();
        router.dismiss();
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not save expense', getExpenseSaveError(error));
      } finally {
        setIsPending(false);
      }
      return;
    }

    const sourceCount = effectivePayerIds.length + (effectivePaidFromBank ? 1 : 0);
    const isSplitPayment = sourceCount > 1;

    if (isSplitPayment) {
      if (
        effectivePayerIds.some((id) => (parseFloat(payerAmounts[id] || '0') || 0) <= 0) ||
        (effectivePaidFromBank && (parseFloat(payerAmounts.__joint_bank__ || '0') || 0) <= 0)
      ) {
        Alert.alert('Enter every funding portion', 'Each direct-payment and bank-deposit portion must be greater than zero.');
        return;
      }
      const missingSourcePayer = effectivePayerIds.find((id) => !payerIncomeSourceIds[id]);
      if (missingSourcePayer) {
        Alert.alert('Income source required', 'Choose the saved income stream that funded every direct-payment portion.');
        return;
      }
      const splitTotal = effectivePayerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0)
        + (effectivePaidFromBank ? parseFloat(payerAmounts.__joint_bank__ || '0') || 0 : 0);
      if (!Number.isInteger(parsed) || splitTotal !== parsed) {
        Alert.alert("Amounts don't add up", `Payer portions total KES ${splitTotal.toLocaleString()} but the expense is KES ${parsed.toLocaleString()}.`);
        return;
      }
    } else {
      if (effectivePaidFromBank) {
        const bankAmount = parseFloat(payerAmounts.__joint_bank__ || '0') || 0;
        if (!Number.isInteger(bankAmount) || bankAmount <= 0) {
          Alert.alert('Enter the funding amount', 'Enter how much came from the selected bank account.');
          return;
        }
        if (bankAmount !== parsed) {
          const remaining = parsed - bankAmount;
          Alert.alert(
            remaining > 0 ? 'Add another funding source' : 'Funding exceeds the expense',
            remaining > 0
              ? `KES ${remaining.toLocaleString()} is still unfunded. Add a direct-payment portion.`
              : `Reduce the bank funding by KES ${Math.abs(remaining).toLocaleString()}.`,
          );
          return;
        }
      }
      if (!effectivePaidFromBank && selectedSources.length === 0 && (!isEditMode || fundingDirty)) {
        Alert.alert('Source required', 'Please choose where this money came from.');
        return;
      }
      if (!effectivePaidFromBank && selectedSources.length > 0) {
        if (selectedSources.some((key) => (parseFloat(splitAmounts[key] || '0') || 0) <= 0)) {
          Alert.alert('Enter the funding amount', 'Enter how much came from every selected income source.');
          return;
        }
        const splitsTotal = selectedSources.reduce((s, k) => s + (parseFloat(splitAmounts[k] || '0') || 0), 0);
        if (Math.abs(splitsTotal - parsed) >= 1) {
          const remaining = parsed - splitsTotal;
          Alert.alert(
            remaining > 0 ? 'Add another funding source' : 'Funding exceeds the expense',
            remaining > 0
              ? `KES ${remaining.toLocaleString()} is still unfunded. Select another income source.`
              : `Reduce the funding amounts by KES ${Math.abs(remaining).toLocaleString()}.`,
          );
          return;
        }
      }
    }

    setIsPending(true);
    try {
      const expenseCategory = normalizedAllocations[0]?.category ?? '';
      const expenseAllocations = normalizedAllocations;
      if (effectiveIsRecurring) {
        const recurringCategory = categories.find(
          (item) => item.name.trim().toLocaleLowerCase() === expenseCategory.trim().toLocaleLowerCase(),
        );
        if (recurringCategory) {
          await updateCategory.mutateAsync({
            id: recurringCategory.id,
            data: { budgetAmount: recurringBudget, isRecurring: true, activeMonth: null, activeYear: null },
          });
          await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
        }
      }
      if (isSplitPayment) {
        const data = {
            amount: parsed, category: expenseCategory, categoryAllocations: expenseAllocations, description: description.trim(), notes: notes.trim() || undefined,
            paidById: effectivePayerIds[0] ?? null, isRecurring: effectiveIsRecurring, date, paidFromBank: false,
            ...(effectivePaidFromBank ? { accountId: selectedBankAccountId! } : {}),
            incomeSplits: [
               ...(effectivePaidFromBank ? [{
                 userId: null,
                 label: bankAccounts.find((account) => account.id === selectedBankAccountId)?.name ?? 'Bank account',
                 amount: parseFloat(payerAmounts.__joint_bank__ || '0') || 0,
                 fromBank: true,
                 accountId: selectedBankAccountId!,
               }] : []),
              ...effectivePayerIds.map((userId) => ({
                userId, label: members.find((member) => member.userId === userId)?.userName ?? 'Member',
                amount: parseFloat(payerAmounts[userId] || '0') || 0, fromBank: false,
                incomeSourceId: payerIncomeSourceIds[userId]!,
              })),
            ],
          } as Parameters<typeof createExpenseAsync>[0]['data'];
        if (isEditMode && editId !== null) {
          await updateExpense.mutateAsync({
            id: editId,
            data: data as Parameters<typeof updateExpense.mutateAsync>[0]['data'],
          });
        } else {
          await createExpenseAsync({ data });
        }
      } else {
        const isSplit = selectedSources.length > 1;
        const selectedIncomeSources = selectedSources.flatMap(key => {
          const sourceId = incomeSourceIdFromKey(key);
          const source = sourceId ? incomeSources.find((item) => item.id === sourceId) : undefined;
          if (!source) return [];
          return [{
            incomeSourceId: source.id,
            label: source.name,
            amount: isSplit ? (parseFloat(splitAmounts[key] || '0') || 0) : parsed,
          }];
        }).filter(source => source.amount > 0);
        const incomeSplits = buildSinglePayerFundingReplacement({
          amount: parsed,
          paidFromBank: effectivePaidFromBank,
          userId: effectivePayerIds[0],
          sources: selectedIncomeSources,
        }).map((split) => split.fromBank ? { ...split, accountId: selectedBankAccountId! } : split);

        const data = {
            amount: parsed,
            category: expenseCategory,
            categoryAllocations: expenseAllocations,
            description: description.trim(),
            notes: notes.trim() || undefined,
            paidById: effectivePaidFromBank ? undefined : effectivePayerIds[0],
            isRecurring: effectiveIsRecurring,
            date,
            paidFromBank: effectivePaidFromBank,
            ...(effectivePaidFromBank ? { accountId: selectedBankAccountId! } : {}),
            ...((incomeSplits.length > 0 || (isEditMode && fundingDirty)) ? { incomeSplits } : {}),
          } as Parameters<typeof createExpenseAsync>[0]['data'];
        if (isEditMode && editId !== null) {
          await updateExpense.mutateAsync({
            id: editId,
            data: data as Parameters<typeof updateExpense.mutateAsync>[0]['data'],
          });
        } else {
          await createExpenseAsync({ data });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateExpenses();
      router.dismiss();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save expense', getExpenseSaveError(error));
    } finally {
      setIsPending(false);
    }
  }, [allowMixedFunding, amount, category, categoryAllocations, description, notes, payerIds, payerAmounts, payerIncomeSourceIds, paidById, selectedSources, splitAmounts, isRecurring, date, paidFromBank, selectedBankAccountId, members, canManageShared, user?.id, createExpenseAsync, createCategory, categories, queryClient, updateExpense, invalidateExpenses, isEditMode, editId, editingExpense, canEditExpense, incomeSources, fundingDirty, recurringMonthlyBudget, updateCategory, bankAccounts]);

  const handleRemove = useCallback(() => {
    if (!editingExpense || !canRemoveExpense) return;
    Alert.alert(
      'Remove expense?',
      `"${editingExpense.description}" and its effect on balances, reports, and activity will be removed. This cannot be undone.`,
      [
        { text: 'Keep expense', style: 'cancel' },
        {
          text: 'Remove expense',
          style: 'destructive',
          onPress: async () => {
            setIsPending(true);
            try {
              await deleteExpense.mutateAsync({ id: editingExpense.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              invalidateExpenses();
              router.dismiss();
            } catch (error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not remove expense', getExpenseSaveError(error));
            } finally {
              setIsPending(false);
            }
          },
        },
      ],
    );
  }, [canRemoveExpense, deleteExpense, editingExpense, invalidateExpenses]);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const categoryList = categories
    .map((item) => item.name)
    .filter((name) => name.trim().toLocaleLowerCase() !== 'other');

  if (isEditMode && editExpensesQuery.isLoading) {
    return (
      <View style={[styles.container, styles.stateContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Loading expense…</Text>
      </View>
    );
  }

  if (isEditMode && (!editingExpense || !canEditExpense)) {
    return (
      <View style={[styles.container, styles.stateContainer, { backgroundColor: colors.background }]}>
        <Feather
          name={editingExpense ? 'lock' : 'alert-circle'}
          size={30}
          color={editingExpense ? colors.mutedForeground : colors.destructive}
        />
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>
          {editingExpense ? 'This expense cannot be edited' : 'Expense not found'}
        </Text>
        <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
          {editingExpense
            ? 'Members can edit only their own personal expenses dated today. Owners and admins can manage shared records.'
            : `The expense was not found in ${editMonth}/${editYear}. Return to the list and open it again.`}
        </Text>
        <Pressable onPress={() => router.dismiss()} style={[styles.stateButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.saveBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Handle bar */}
      <View style={[styles.handle, { backgroundColor: colors.border }]} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.dismiss()} style={styles.cancelBtn}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{isEditMode ? 'Edit Expense' : 'Log Expense'}</Text>
        <Pressable
          onPress={() => void handleSubmit()}
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
        <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY (OPTIONAL)</Text>
        <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
          Add a category to track this spending against a budget. You can also save without one and categorize it later.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categoriesQuery.isLoading ? (
            <View style={styles.categoryStatus}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.categoryStatusText, { color: colors.mutedForeground }]}>Loading categories…</Text>
            </View>
          ) : categoriesQuery.isError ? (
            <Pressable onPress={() => void categoriesQuery.refetch()} style={styles.categoryStatus}>
              <Text style={[styles.categoryStatusText, { color: colors.primary }]}>Couldn’t load categories. Tap to retry.</Text>
            </Pressable>
          ) : (
            <>
              {categoryList.length === 0 && (
                <Text style={[styles.categoryStatusText, { color: colors.mutedForeground }]}>
                  {canManageCategories ? 'No categories yet. You can create one below or save without a category.' : 'No categories are available. You can save without one or ask a budget manager to add one.'}
                </Text>
              )}
              {categoryList.map((cat) => {
                const icon = getCategoryIcon(cat);
                const selected = categoryAllocations.some((allocation) => allocation.category === cat);
                return (
                  <Pressable
                    key={cat}
                    onPress={() => chooseCategory(cat)}
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
            </>
          )}
        </ScrollView>
        {categoryAllocations.length > 0 && (
          <View
            testID="category-allocation-card"
            style={[styles.allocationCard, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <View style={styles.allocationHeader}>
              <View>
                <Text style={[styles.allocationTitle, { color: colors.foreground }]}>CATEGORY ALLOCATION</Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>Choose category tabs above to add another row.</Text>
              </View>
              <Text style={[styles.allocationTotal, { color: colors.foreground }]}>
                KES {categoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0).toLocaleString()}
              </Text>
            </View>
            {categoryAllocations.map((allocation) => (
              <View key={allocation.category} style={styles.allocationRow}>
                <Text style={[styles.allocationCategory, { color: colors.foreground }]} numberOfLines={1}>{allocation.category}</Text>
                <TextInput
                  style={[styles.allocationInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius }]}
                  value={allocation.amount}
                  onChangeText={(value) => updateAllocationAmount(allocation.category, value)}
                  keyboardType="numeric"
                  placeholder="KES"
                  placeholderTextColor={colors.mutedForeground}
                  testID={`category-allocation-${allocation.category}`}
                />
                <Pressable
                  onPress={() => removeAllocation(allocation.category)}
                  accessibilityLabel={`Remove ${allocation.category} allocation`}
                  testID={`remove-category-allocation-${allocation.category}`}
                  style={styles.allocationRemove}
                >
                  <Feather name="x" size={18} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => setShowAdditionalCategoryPicker((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel="Add another expense category"
              testID="add-category-allocation-mobile"
              style={styles.addSourceLink}
            >
              <Feather name="plus-circle" size={15} color={colors.primary} />
              <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>Add another category</Text>
            </Pressable>
            {showAdditionalCategoryPicker && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                  Choose the next category for this same expense.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {categories
                    .filter((item) => !categoryAllocations.some((allocation) => allocation.category === item.name))
                    .map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => chooseCategory(item.name)}
                        style={[styles.sourceChip, {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                          borderRadius: colors.radius,
                        }]}
                        testID={`add-category-option-${item.id}`}
                      >
                        <Feather name={getCategoryIcon(item.name)} size={13} color={colors.primary} />
                        <Text style={[styles.sourceChipText, { color: colors.foreground }]}>{item.name}</Text>
                      </Pressable>
                    ))}
                </ScrollView>
              </View>
            )}
            {(() => {
              const total = categoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
              const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
              const difference = expenseTotal - total;
              return (
                <Text style={[styles.allocationStatus, { color: difference === 0 && expenseTotal > 0 ? colors.primary : difference < 0 ? colors.destructive : colors.mutedForeground }]}>
                  {difference === 0 && expenseTotal > 0
                    ? 'Allocated exactly.'
                    : difference > 0
                      ? `KES ${difference.toLocaleString()} remaining to allocate`
                      : `KES ${Math.abs(difference).toLocaleString()} over allocated`}
                </Text>
              );
            })()}
          </View>
        )}
        {isCreatingCategory ? (
          <View
            testID="create-category-form"
            style={[styles.categoryCreateCard, { backgroundColor: colors.muted, borderColor: colors.primary + '45' }]}
          >
            <View>
              <Text style={[styles.categoryCreateTitle, { color: colors.foreground }]}>Name this expense category</Text>
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>Emergencies and one-off spending can stay unbudgeted. You can also add the category to the monthly budget.</Text>
            </View>
            <TextInput
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Emergency repair"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
              editable={!createCategory.isPending}
              style={[styles.categoryCreateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {canManageCategories ? (
              <View style={[styles.categoryRecurringRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.categoryCreateTitle, { color: colors.foreground, fontSize: 13 }]}>Add this category to the budget?</Text>
                  <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>
                    {newCategoryAddToBudget ? 'Set its budget details below' : 'No — record it as unbudgeted spending'}
                  </Text>
                </View>
                <Switch
                  value={newCategoryAddToBudget}
                  onValueChange={setNewCategoryAddToBudget}
                  disabled={createCategory.isPending}
                  accessibilityLabel="Add category to budget"
                />
              </View>
            ) : (
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>This will not change the Shared budget. An owner or admin can add it later.</Text>
            )}
            {newCategoryAddToBudget && canManageCategories ? (
              <>
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>Priority: 1 is must-pay; 5 is flexible.</Text>
              <View style={styles.categoryPriorityRow}>
              {[1, 2, 3, 4, 5].map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => setNewCategoryPriority(String(priority))}
                  disabled={createCategory.isPending}
                  accessibilityRole="radio"
                  accessibilityLabel={`Priority ${priority}`}
                  accessibilityState={{ checked: newCategoryPriority === String(priority), disabled: createCategory.isPending }}
                  style={[
                    styles.categoryPriorityChip,
                    {
                      borderColor: newCategoryPriority === String(priority) ? colors.primary : colors.border,
                      backgroundColor: newCategoryPriority === String(priority) ? colors.primary + '18' : colors.background,
                    },
                  ]}
                >
                  <Text style={{ color: newCategoryPriority === String(priority) ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{priority}</Text>
                </Pressable>
              ))}
              </View>
              <View style={[styles.categoryRecurringRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.categoryCreateTitle, { color: colors.foreground, fontSize: 13 }]}>Recurring category</Text>
                <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>
                  {newCategoryRecurring ? 'Available every month' : 'Only available this month'}
                </Text>
              </View>
              <Switch
                value={newCategoryRecurring}
                onValueChange={setNewCategoryRecurring}
                disabled={createCategory.isPending}
                accessibilityLabel="Recurring category"
                accessibilityHint="When on, this category is available every month"
              />
              </View>
              <TextInput
                value={newCategoryBudget}
                onChangeText={setNewCategoryBudget}
                placeholder="Monthly KES"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                editable={!createCategory.isPending}
                style={[styles.categoryCreateBudgetInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              </>
            ) : null}
            <View style={styles.categoryCreateActions}>
              <Pressable
                onPress={() => void handleCreateCategory()}
                disabled={createCategory.isPending}
                style={[styles.categoryCreateSave, { backgroundColor: colors.primary, opacity: createCategory.isPending ? 0.55 : 1 }]}
              >
                {createCategory.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.categoryCreateSaveText}>{newCategoryAddToBudget && canManageCategories ? 'Add to budget' : 'Use without budget'}</Text>}
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsCreatingCategory(false);
                  setNewCategoryName('');
                  setNewCategoryBudget('');
                  setNewCategoryRecurring(true);
                  setNewCategoryPriority('3');
                  setNewCategoryAddToBudget(false);
                  setCategory('');
                }}
                disabled={createCategory.isPending}
                style={styles.categoryCreateCancel}
              >
                <Text style={[styles.categoryCreateCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
           <>
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
           </>

         {/* Notes */}
           <>
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
               accessibilityLabel="Notes"
               multiline
               numberOfLines={3}
               textAlignVertical="top"
             />
           </>

        {/* Who paid */}
        {members.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              PAID BY <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <View style={styles.paidByRow}>
              {/* Joint-bank spending is restricted to group managers. */}
              {canManageShared && <Pressable
                onPress={() => {
                  if (isEditMode) setFundingDirty(true);
                  if (paidFromBank) {
                    setPaidFromBank(false);
                    setAllowMixedFunding(false);
                  } else {
                    setPaidFromBank(true);
                    setAllowMixedFunding(false);
                    setPayerIds([]);
                    setSelectedSources([]);
                    setSplitAmounts({});
                    setPayerIncomeSourceIds({});
                    setPayerAmounts({ __joint_bank__: amount.replace(/,/g, '') });
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
              </Pressable>}
              {selectablePayers.map((m) => {
                const selected = payerIds.includes(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    disabled={getExpenseFundingControlState({
                      paidFromBank,
                      hasPersonalFunding: payerIds.length > 0,
                      allowMixedFunding,
                    }).personalPayersDisabled}
                    onPress={() => {
                      if (!canManageShared) return;
                      if (isEditMode) setFundingDirty(true);
                      setPayerIds(prev => {
                        if (!prev.includes(m.userId)) {
                          setPayerAmounts((previous) => addFundingSourceWithRemainder({
                            total: parseFloat(amount.replace(/,/g, '')),
                            selectedSourceIds: prev,
                            newSourceId: m.userId,
                            amounts: previous,
                          }));
                        }
                        const next = prev.includes(m.userId)
                          ? prev.filter(id => id !== m.userId)
                          : [...prev, m.userId];
                        if (!next.includes(m.userId)) {
                          setPayerIncomeSourceIds(sourceIds => {
                            const copy = { ...sourceIds };
                            delete copy[m.userId];
                            return copy;
                          });
                        }
                         if (paidFromBank) {
                           setAllowMixedFunding(next.length > 0);
                           if (next.length === 1) {
                             const bankAmount = parseFloat(payerAmounts.__joint_bank__ || '0') || 0;
                             const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), bankAmount);
                             setPayerAmounts((previous) => ({
                               ...previous,
                               [next[0]]: remainder > 0 ? String(remainder) : previous[next[0]] ?? '',
                             }));
                           }
                         }
                        return next;
                      });
                    }}
                    style={[
                      styles.paidByPill,
                      {
                        backgroundColor: selected ? colors.primary : colors.muted,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius,
                        opacity: paidFromBank && payerIds.length === 0 && !allowMixedFunding ? 0.4 : 1,
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
            {paidFromBank && (
              <View style={{ marginTop: 10, gap: 7 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>BANK ACCOUNT <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <View style={styles.paidByRow}>
                  {bankAccounts.map((account) => {
                    const selected = selectedBankAccountId === account.id;
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => { setSelectedBankAccountId(account.id); if (isEditMode) setFundingDirty(true); }}
                        style={[styles.paidByPill, { backgroundColor: selected ? 'rgba(56,189,248,0.15)' : colors.muted, borderColor: selected ? '#38bdf8' : colors.border, borderRadius: colors.radius }]}
                        testID={`expense-bank-account-${account.id}`}
                      >
                        <Feather name="credit-card" size={14} color={selected ? '#38bdf8' : colors.mutedForeground} />
                        <Text style={[styles.paidByText, { color: selected ? '#38bdf8' : colors.foreground }]}>{account.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {bankAccounts.length === 0 && <Text style={[styles.hintText, { color: '#ef4444' }]}>Add a bank account from the Bank tab before using bank funds.</Text>}
                {canManageShared && (isAddingBankAccount ? (
                  <View style={styles.inlineAccountRow}>
                    <TextInput
                      autoFocus
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="e.g. M-Pesa wallet or KCB account"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountName}
                      onChangeText={setNewBankAccountName}
                      editable={!createBankAccount.isPending}
                      onSubmitEditing={() => void handleCreateBankAccount()}
                    />
                    <TextInput
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Account number (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountNumber}
                      onChangeText={setNewBankAccountNumber}
                    />
                    <TextInput
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Opening balance"
                      keyboardType="number-pad"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankOpeningBalance}
                      onChangeText={setNewBankOpeningBalance}
                    />
                    <Pressable
                      onPress={() => void handleCreateBankAccount()}
                      disabled={createBankAccount.isPending}
                      style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: createBankAccount.isPending ? 0.6 : 1 }]}
                    >
                      {createBankAccount.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Add</Text>}
                    </Pressable>
                    <Pressable onPress={() => { setIsAddingBankAccount(false); setNewBankAccountName(''); setNewBankAccountNumber(''); setNewBankOpeningBalance(''); }}>
                      <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setIsAddingBankAccount(true)} style={styles.addSourceLink}>
                    <Feather name="plus-circle" size={14} color={colors.primary} />
                    <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>New bank account</Text>
                  </Pressable>
                ))}
                {payerIds.length === 0 && (
                  <View style={styles.singleFundingAmount}>
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM</Text>
                    <TextInput
                      style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      placeholder="KES 0"
                      placeholderTextColor={colors.mutedForeground}
                      value={payerAmounts.__joint_bank__ || ''}
                      onChangeText={(value) => setPayerAmounts((previous) => ({ ...previous, __joint_bank__: value }))}
                    />
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Enter this manually to confirm how much should reduce the selected account.
                    </Text>
                  </View>
                )}
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  This uses money already recorded in the selected account as an opening balance or deposit.
                </Text>
                {projectedExpenseBankBalance !== null && projectedExpenseBankBalance < 0 && (
                  <View style={styles.negativeBankWarning} accessibilityRole="alert" testID="expense-negative-bank-warning">
                    <View style={styles.negativeBankWarningHeader}>
                      <Feather name="flag" size={15} color="#ef4444" />
                      <Text style={styles.negativeBankWarningTitle}>This will take the account below zero.</Text>
                    </View>
                    <Text style={styles.negativeBankWarningText}>
                      Projected closing balance: KES {projectedExpenseBankBalance.toLocaleString()}. Jamvi will still save the expense.
                    </Text>
                  </View>
                )}
                {getExpenseFundingControlState({
                  paidFromBank,
                  hasPersonalFunding: payerIds.length > 0,
                  allowMixedFunding,
                }).showBankOnlyExplanation && (
                  <View>
                    <Text style={[styles.hintText, { color: '#38bdf8' }]}>
                      This expense reduces the selected bank-account balance. Direct payer and income-source fields are not needed.
                    </Text>
                    {!allowMixedFunding && canManageShared ? (
                      <Pressable onPress={() => setAllowMixedFunding(true)} style={{ marginTop: 6 }}>
                        <Text style={{ color: '#38bdf8', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
                          Add another funding source
                        </Text>
                      </Pressable>
                    ) : allowMixedFunding ? (
                      <Text style={[styles.hintText, { color: '#38bdf8', marginTop: 6 }]}>
                        Choose one or more people above. Only the bank portion reduces the selected account.
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}
              {!canManageShared && (
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  This expense is recorded in your name.
                </Text>
              )}
              {canManageShared && payerIds.length === 0 && !paidFromBank && (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Tap to select · select multiple to split the cost
              </Text>
            )}

            {/* Per-source split rows — Joint bank can be mixed with people. */}
            {payerIds.length + (paidFromBank ? 1 : 0) > 1 && (() => {
              const total = parseFloat(amount.replace(/,/g, '')) || 0;
              const splitTotal = payerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0)
                + (paidFromBank ? parseFloat(payerAmounts.__joint_bank__ || '0') || 0 : 0);
              const diff = total - splitTotal;
              return (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                    Type the primary amount{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ''}. Jamvi fills the remaining amount into the other selected source.
                  </Text>
                  {paidFromBank && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', width: 76 }}>Joint bank</Text>
                      <TextInput
                        style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 12, fontSize: 16, color: colors.foreground, fontFamily: 'Inter_400Regular' }}
                        keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                        value={payerAmounts.__joint_bank__ || ''}
                        onChangeText={val => {
                          if (isEditMode) setFundingDirty(true);
                          setPayerAmounts((previous) => {
                            const next: Record<string, string> = { ...previous, __joint_bank__: val };
                            if (payerIds.length === 1) {
                              const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), parseFloat(val || '0'));
                              next[payerIds[0]] = remainder > 0 ? String(remainder) : '';
                            }
                            return next;
                          });
                        }}
                      />
                    </View>
                  )}
                  {payerIds.map((pid) => {
                    const member = members.find(m => m.userId === pid);
                    const name = member?.userName?.split(' ')[0] ?? 'Member';
                    const sources = payerIncomeSources[pid] ?? [];
                    return (
                      <View key={pid} style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                            placeholder="KES 0"
                            placeholderTextColor={colors.mutedForeground}
                            value={payerAmounts[pid] || ''}
                            onChangeText={val => {
                              if (isEditMode) setFundingDirty(true);
                              setPayerAmounts((previous) => {
                                const next = { ...previous, [pid]: val };
                                if (paidFromBank && payerIds.length === 1) {
                                  const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), parseFloat(val || '0'));
                                  next.__joint_bank__ = remainder > 0 ? String(remainder) : '';
                                }
                                return next;
                              });
                            }}
                          />
                        </View>
                        {payerSourcesLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                        ) : sources.length === 0 ? (
                          <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                            {name} needs an income source in Budget before this portion can be saved.
                          </Text>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {sources.map((source) => {
                              const selected = payerIncomeSourceIds[pid] === source.id;
                              return (
                                <Pressable
                                  key={source.id}
                                  onPress={() => {
                                    if (isEditMode) setFundingDirty(true);
                                    setPayerIncomeSourceIds(prev => ({
                                      ...prev,
                                      [pid]: selected ? null : source.id,
                                    }));
                                  }}
                                  style={[styles.sourceChip, {
                                    backgroundColor: selected ? colors.primary + '20' : colors.background,
                                    borderColor: selected ? colors.primary : colors.border,
                                    borderRadius: colors.radius,
                                  }]}
                                >
                                  <Feather name="briefcase" size={12} color={selected ? colors.primary : colors.mutedForeground} />
                                  <Text style={[styles.sourceChipText, { color: selected ? colors.primary : colors.foreground }]}>
                                    {source.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        )}
                         <View style={styles.addSourceRow}>
                           {newSourcePayerId === pid ? (
                             <>
                               <TextInput
                                 autoFocus
                                 style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                                 placeholder="e.g. Freelance work"
                                 placeholderTextColor={colors.mutedForeground}
                                 value={newSourceName}
                                 onChangeText={setNewSourceName}
                                 editable={!isCreatingSource}
                                 onSubmitEditing={() => void handleCreateIncomeSource(pid)}
                                 returnKeyType="done"
                               />
                               <Pressable
                                 onPress={() => void handleCreateIncomeSource(pid)}
                                 disabled={isCreatingSource}
                                 style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: isCreatingSource ? 0.6 : 1 }]}
                               >
                                 {isCreatingSource ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Save</Text>}
                               </Pressable>
                               <Pressable onPress={() => { setNewSourcePayerId(null); setNewSourceName(''); }} disabled={isCreatingSource}>
                                 <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                               </Pressable>
                             </>
                           ) : (
                             <Pressable onPress={() => { setNewSourcePayerId(pid); setNewSourceName(''); }} style={styles.addSourceLink}>
                               <Feather name="plus-circle" size={13} color={colors.primary} />
                               <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>Add source for {name}</Text>
                             </Pressable>
                           )}
                         </View>
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

         {/* Financed by is only shown inside the paid-directly path. */}
        {getExpenseFundingControlState({
          paidFromBank,
          hasPersonalFunding: payerIds.length === 1,
          allowMixedFunding,
        }).showPersonalIncomeSources && (
           <View style={[styles.fundingCard, { backgroundColor: colors.muted, borderColor: colors.primary + '50' }]}>
             <Text style={[styles.fundingCardTitle, { color: colors.foreground }]}>PAID DIRECTLY</Text>
            <View style={styles.fundingCardHeader}>
              <Feather name="layers" size={14} color={colors.primary} />
               <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>FINANCED BY</Text>
              <Text style={styles.fundingRequired}>* Required</Text>
            </View>
            {sourcesLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
            ) : incomeSources.length === 0 ? (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>No income sources set up — add them from Budget</Text>
            ) : (
              <View style={styles.sourceChipsGrid}>
                {incomeSources.map((src, idx) => {
                  const color = PALETTE[idx % PALETTE.length];
                  const key = incomeSourceKey(src.id);
                  const selected = selectedSources.includes(key);
                  return (
                    <Pressable key={src.id} onPress={() => {
                      if (isEditMode) setFundingDirty(true);
                      setSelectedSources((previous) => {
                        if (previous.includes(key)) {
                          setSplitAmounts((amounts) => {
                            const next = { ...amounts };
                            delete next[key];
                            return next;
                          });
                          return previous.filter((item) => item !== key);
                        }
                        setSplitAmounts((amounts) => addFundingSourceWithRemainder({
                          total: parseFloat(amount.replace(/,/g, '')),
                          selectedSourceIds: previous,
                          newSourceId: key,
                          amounts,
                        }));
                        return [...previous, key];
                      });
                    }}
                      style={[styles.sourceChip, { backgroundColor: selected ? color + '22' : colors.background, borderColor: selected ? color : colors.border, borderRadius: colors.radius }]}>
                      <Feather name="briefcase" size={13} color={selected ? color : colors.mutedForeground} />
                      <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>{src.name}</Text>
                      {selected && <Feather name="check" size={11} color={color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={styles.addSourceRow}>
              {newSourcePayerId === paidById ? (
                <>
                  <TextInput
                    autoFocus
                    style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. Freelance work"
                    placeholderTextColor={colors.mutedForeground}
                    value={newSourceName}
                    onChangeText={setNewSourceName}
                    editable={!isCreatingSource}
                    onSubmitEditing={() => void handleCreateIncomeSource(paidById)}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={() => void handleCreateIncomeSource(paidById)}
                    disabled={isCreatingSource}
                    style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: isCreatingSource ? 0.6 : 1 }]}
                  >
                    {isCreatingSource ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Save</Text>}
                  </Pressable>
                  <Pressable onPress={() => { setNewSourcePayerId(null); setNewSourceName(''); }} disabled={isCreatingSource}>
                    <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => { setNewSourcePayerId(paidById); setNewSourceName(''); }} style={styles.addSourceLink}>
                  <Feather name="plus-circle" size={14} color={colors.primary} />
                  <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>Add another source</Text>
                </Pressable>
              )}
            </View>
            {!paidFromBank && selectedSources.length > 0 && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                    Type each amount. Jamvi fills the current remainder when you add another source.
                </Text>
                {selectedSources.map((key, index) => {
                  const sourceId = incomeSourceIdFromKey(key);
                  const sourceName = sourceId
                    ? incomeSources.find((source) => source.id === sourceId)?.name
                    : key.split(':').slice(2).join(':');
                  return (
                  <View key={key} style={[styles.splitAmountRow, { backgroundColor: colors.background, borderColor: PALETTE[index % PALETTE.length] + '44', borderRadius: colors.radius }]}>
                    <Text style={[styles.splitAmountLabel, { color: colors.foreground }]}>{sourceName || 'Personal funds'}</Text>
                    <TextInput style={[styles.splitAmountInput, { color: colors.foreground }]} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                      value={splitAmounts[key] || ''} onChangeText={value => {
                        if (isEditMode) setFundingDirty(true);
                        setSplitAmounts((previous) => {
                          return { ...previous, [key]: value };
                        });
                      }} />
                  </View>
                )})}
                {(() => {
                  const total = parseFloat(amount.replace(/,/g, '')) || 0;
                  const assigned = selectedSources.reduce(
                    (sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0),
                    0,
                  );
                  const difference = total - assigned;
                  if (total <= 0 || difference === 0) {
                    return total > 0 ? (
                      <Text style={{ fontSize: 13, color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                        Fully funded
                      </Text>
                    ) : null;
                  }
                  return (
                    <Text
                      accessibilityRole="alert"
                      testID="expense-funding-remainder"
                      style={{ fontSize: 13, color: difference > 0 ? '#f59e0b' : '#f87171', fontFamily: 'Inter_600SemiBold' }}
                    >
                      {difference > 0
                        ? `KES ${difference.toLocaleString()} remaining — choose another source to continue`
                        : `Overfunded by KES ${Math.abs(difference).toLocaleString()}`}
                    </Text>
                  );
                })()}
              </View>
            )}
          </View>
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
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
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

        {/* Recurring expenses affect shared planning and are manager-only. */}
        {canManageShared && <View
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
            onValueChange={(next) => {
              if (!next) {
                setIsRecurring(false);
                setRecurringMonthlyBudget('');
                return;
              }
              Alert.alert(
                'Make this recurring?',
                'Jamvi will remind you to apply it next month. You will also need to confirm its monthly category budget.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes, make recurring',
                    onPress: async () => {
                      if (!category.trim()) {
                        Alert.alert('Choose a category first', 'A recurring expense needs a category before Jamvi can set its average monthly budget.');
                        return;
                      }
                      setIsRecurring(true);
                      await AsyncStorage.removeItem(RECURRING_BUDGET_HANDOFF_KEY);
                      router.push({
                        pathname: '/(tabs)/budget',
                        params: {
                          recurringSetup: '1',
                          category: category.trim(),
                          expenseAmount: amount,
                        },
                      });
                    },
                  },
                ],
              );
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>}
        {canManageShared && isRecurring && (
          <View style={[styles.recurringBudgetCard, { backgroundColor: colors.muted, borderColor: colors.primary + '45', borderRadius: colors.radius }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              MONTHLY BUDGET (KES) <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={recurringMonthlyBudget}
              onChangeText={setRecurringMonthlyBudget}
              placeholder="e.g. 15000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              accessibilityLabel="Recurring monthly budget"
              testID="recurring-monthly-budget"
            />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>This becomes the recurring monthly budget for the selected category.</Text>
          </View>
        )}
        {isEditMode && canRemoveExpense ? (
          <Pressable
            onPress={handleRemove}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${editingExpense?.description ?? 'expense'}`}
            style={[styles.removeButton, { borderColor: colors.destructive, opacity: isPending ? 0.55 : 1 }]}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.removeButtonText, { color: colors.destructive }]}>Remove expense</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stateContainer: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  stateTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  stateText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  stateButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  removeButton: {
    minHeight: 48,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  recurringBudgetCard: { borderWidth: 1, padding: 12, gap: 6, marginTop: 8 },
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
  categoryStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  categoryStatusText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  categoryCreateCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  categoryCreateTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryCreateHint: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  categoryCreateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryCreateInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  categoryCreateBudgetInput: {
    width: 110,
    height: 42,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  categoryPriorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPriorityChip: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRecurringRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  categoryCreateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryCreateSave: {
    minHeight: 38,
    borderRadius: 9,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCreateSaveText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryCreateCancel: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  categoryCreateCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  allocationCard: {
    marginTop: 10,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  allocationTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  allocationTotal: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  allocationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocationCategory: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  allocationInput: {
    width: 92,
    height: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  allocationRemove: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  allocationStatus: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
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
  negativeBankWarning: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    gap: 4,
  },
  negativeBankWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negativeBankWarningTitle: {
    color: '#ef4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  negativeBankWarningText: {
    color: '#d6b36a',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  otherCategoryPrompt: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  otherCategoryPromptCopy: {
    flex: 1,
    gap: 2,
  },
  otherCategoryPromptTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  inlineAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  singleFundingAmount: {
    gap: 6,
  },
  // Funding card
  fundingCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  fundingCardTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
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
  addSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  addSourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  addSourceLinkText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  newSourceInput: {
    minWidth: 150,
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  addSourceButton: {
    minWidth: 58,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  addSourceButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelSourceText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 3,
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
