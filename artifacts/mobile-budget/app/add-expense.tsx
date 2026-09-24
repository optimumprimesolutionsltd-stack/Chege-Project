import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
// From gesture-handler, not react-native: this screen is presented as a
// native formSheet, whose own drag-to-resize gesture and a plain RN
// ScrollView's pan responder fight over the same touch, which is what made
// scrolling up drag the whole sheet instead of just the content. The
// gesture-handler ScrollView participates in the same recognizer system the
// sheet's own gesture uses, so the two can be told apart.
import { ScrollView } from 'react-native-gesture-handler';
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
  collectExpenseProblems,
  describeProblems,
  normalizeAllocations,
  parseExpenseAmount,
} from '@/lib/expenseValidation';
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
import { buildCategoryTree, filterCategoryTree, parentOf, type CategoryRow } from '@workspace/category-tree';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { workspaceBudgetName } from '@/lib/workspaceIdentity';
import { handleLapsedError } from '@/lib/lapsedError';
import { evaluateAmountExpression, isAmountExpression } from '@/lib/amountExpression';
import { AmountCalcRow } from '@/components/AmountCalcRow';
import {
  addIncomeSourceToSelection,
  buildSinglePayerFundingReplacement,
  getExpenseFundingControlState,
  getFundingRemainder,
  isFundingFulfilled,
  getNewExpenseCategoryMode,
  getProjectedCategoryBalance,
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

const isOneOffAllocation = (allocation: CategoryAllocation) =>
  allocation.category.trim().toLocaleLowerCase() === 'other';

function addStandardCategory(
  allocations: CategoryAllocation[],
  categoryName: string,
): CategoryAllocation[] {
  const oneOff = allocations.find(isOneOffAllocation);
  const standard = allocations.filter((allocation) => !isOneOffAllocation(allocation));
  const emptyIndex = standard.findIndex((allocation) => !allocation.category.trim());
  if (emptyIndex >= 0) {
    standard[emptyIndex] = { ...standard[emptyIndex], category: categoryName };
  } else if (!standard.some((allocation) => allocation.category === categoryName)) {
    standard.push({ category: categoryName, amount: '' });
  }
  return [...standard, ...(oneOff ? [oneOff] : [])];
}

function toggleOneOffCategory(allocations: CategoryAllocation[]): CategoryAllocation[] {
  if (allocations.some(isOneOffAllocation)) {
    return allocations.filter((allocation) => !isOneOffAllocation(allocation));
  }
  return [...allocations, { category: 'Other', amount: '' }];
}
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

/**
 * One category chip.
 *
 * Split out and memoised because the list is rebuilt on every keystroke
 * anywhere on this form, and a chip only changes when its own selected state
 * does. `onSelect` takes the name rather than a closure per chip, so the prop
 * stays referentially stable and the memo actually holds.
 */
const CategoryChip = React.memo(function CategoryChip({
  name,
  label,
  selected,
  onSelect,
  colors,
  subcategoryCount = 0,
}: {
  name: string;
  /** What the chip displays. Defaults to `name`; a subcategory passes
   *  "Parent: Child" here while still selecting the plain `name`. */
  label?: string;
  selected: boolean;
  onSelect: (name: string) => void;
  colors: ReturnType<typeof useColors>;
  /** How many subcategories tapping this chip would reveal. Zero hides the
   *  cue entirely, which is every chip in Quick mode and every parent with
   *  no children of its own. */
  subcategoryCount?: number;
}) {
  const icon = getCategoryIcon(name);
  return (
    <Pressable
      onPress={() => onSelect(name)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subcategoryCount > 0
        ? `${label ?? name}, ${subcategoryCount} ${subcategoryCount === 1 ? 'subcategory' : 'subcategories'}`
        : (label ?? name)}
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
      <Text style={[styles.categoryChipText, { color: selected ? '#fff' : colors.foreground }]}>
        {label ?? name}
      </Text>
      {subcategoryCount > 0 && (
        <View style={[styles.subcategoryBadge, { backgroundColor: selected ? '#ffffff33' : colors.primary + '1F' }]}>
          <Text style={[styles.subcategoryBadgeText, { color: selected ? '#fff' : colors.primary }]}>
            {subcategoryCount}
          </Text>
          <Feather name="chevron-down" size={11} color={selected ? '#fff' : colors.primary} />
        </View>
      )}
    </Pressable>
  );
});

/**
 * One "who paid" pill.
 *
 * Split out and memoised for the same reason as the chips: a chama can have
 * forty of these, and every keystroke anywhere on the form rebuilt all of
 * them. A pill only changes when its own selected or disabled state does.
 *
 * `onToggle` takes the id rather than a closure per pill, so the prop stays
 * referentially stable and the memo actually holds - a closure built in the
 * map would be a new function every render and defeat it silently.
 */
const PayerPill = React.memo(function PayerPill({
  userId,
  name,
  selected,
  disabled,
  dimmed,
  hint,
  onToggle,
  colors,
}: {
  userId: string;
  name: string;
  selected: boolean;
  disabled: boolean;
  dimmed: boolean;
  hint?: string;
  onToggle: (userId: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityHint={hint}
      onPress={() => onToggle(userId)}
      style={[
        styles.paidByPill,
        {
          backgroundColor: selected ? colors.primary : colors.muted,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: colors.radius,
          opacity: dimmed ? 0.4 : 1,
        },
      ]}
    >
      <Feather name="user" size={14} color={selected ? '#fff' : colors.mutedForeground} />
      <Text style={[styles.paidByText, { color: selected ? '#fff' : colors.foreground }]}>{name}</Text>
    </Pressable>
  );
});

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
  // Existing expenses must retain access to every control that may have been used
  // to create them. New expenses start with the short, everyday flow instead.
  const [isAdvanced, setIsAdvanced] = useState(isEditMode);

  const categoriesQuery = useGetBudgetCategories();
  // A form with no categories cannot be completed at all — the required field
  // has nothing in it — so a failed load is worth chasing rather than leaving
  // behind a link somebody has to notice. Coming back to the screen retries.
  useFocusEffect(
    useCallback(() => {
      if (categoriesQuery.isError) void categoriesQuery.refetch();
    }, [categoriesQuery.isError, categoriesQuery.refetch]),
  );
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
  // Memoised because it is an effect dependency below. For an ordinary member
  // the filter returned a new array every render, so that effect re-ran on
  // every render for them while managers, who get `members` straight through,
  // were unaffected.
  const selectablePayers = useMemo(
    () => (canManageShared ? members : members.filter((member) => member.userId === user?.id)),
    [canManageShared, members, user?.id],
  );
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
  // Making a subcategory meant leaving the expense and going to Settings on
  // the web, which is a poor thing to discover mid-expense. When a parent is
  // already chosen, a new category can be nested under it here.
  // Which group the new category joins, or null for a new top-level group.
  // This used to be inferred from whatever was selected, which meant the one
  // case people actually want — adding a ledger to an existing group — was
  // impossible: a group with children is a heading, headings are drawn as
  // labels rather than chips because money cannot land on them, so a heading
  // could never be the selection and could never be offered as a parent.
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null);
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
  const [expenseYear, expenseMonth] = date.split('-').map(Number);
  const { data: breakdown } = useGetDashboardCategoryBreakdown({
    month: expenseMonth,
    year: expenseYear,
  });
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
  const originalCategoryAllocations = editingExpense?.categoryAllocations?.length
    ? editingExpense.categoryAllocations
    : editingExpense?.category
      ? [{ category: editingExpense.category, amount: editingExpense.amount }]
      : [];
  // Two scans of `breakdown` and `categories` per allocation, plus a
  // filter-reduce, and none of it depends on the text being typed. It ran on
  // every render all the same.
  const categoryBalancePreviews = useMemo(() => categoryAllocations.flatMap((allocation) => {
    const categoryName = allocation.category.trim();
    const allocationAmount = Number(allocation.amount.replace(/,/g, ''));
    if (
      !categoryName
      || categoryName.toLocaleLowerCase() === 'other'
      || !Number.isInteger(allocationAmount)
      || allocationAmount <= 0
    ) {
      return [];
    }
    const categoryBreakdown = breakdown?.find(
      (item) => item.category.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
    );
    const categoryDefinition = categories.find(
      (item) => item.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
    );
    const budgetAmount = categoryBreakdown?.budgetAmount ?? categoryDefinition?.budgetAmount ?? 0;
    const spentAmount = categoryBreakdown?.spentAmount ?? 0;
    if (budgetAmount <= 0) return [];
    const previousAllocationAmount = originalCategoryAllocations
      .filter((item) => item.category.toLocaleLowerCase() === categoryName.toLocaleLowerCase())
      .reduce((sum, item) => sum + item.amount, 0);
    return [{
      category: categoryBreakdown?.category ?? categoryDefinition?.name ?? categoryName,
      budgetAmount,
      spentBeforeExpense: spentAmount - previousAllocationAmount,
      ...getProjectedCategoryBalance({
        budgetAmount,
        spentAmount,
        allocationAmount,
        previousAllocationAmount,
      }),
    }];
  }), [categoryAllocations, breakdown, categories, originalCategoryAllocations]);

  // The same two scans again, for a yes/no answer.
  const hasBudgetedCategorySelection = useMemo(() => categoryAllocations.some((allocation) => {
    const categoryName = allocation.category.trim();
    if (!categoryName || categoryName.toLocaleLowerCase() === 'other') return false;
    const categoryBreakdown = breakdown?.find(
      (item) => item.category.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
    );
    const categoryDefinition = categories.find(
      (item) => item.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
    );
    return (categoryBreakdown?.budgetAmount ?? categoryDefinition?.budgetAmount ?? 0) > 0;
  }), [categoryAllocations, breakdown, categories]);

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
              : [{ category: result.categoryName!, amount: '' }]);
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
  const payerSourceIds = useMemo<string[]>(() => [...new Set(payerIds)].sort(), [payerIds]);
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

  // Stable across renders so the memoised pills below are not handed a new
  // function every keystroke, which would defeat the memo without any sign.
  const togglePayer = useCallback((userId: string) => {
    if (!canManageShared) return;
    if (isEditMode) setFundingDirty(true);
    setPayerIds((prev) => {
      if (!prev.includes(userId)) {
        setPayerAmounts((previous) => ({ ...previous, [userId]: '' }));
      }
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];
      if (!next.includes(userId)) {
        setPayerIncomeSourceIds((sourceIds) => {
          const copy = { ...sourceIds };
          delete copy[userId];
          return copy;
        });
      }
      if (paidFromBank) setAllowMixedFunding(next.length > 0);
      return next;
    });
  }, [canManageShared, isEditMode, paidFromBank]);

  // The one case where tapping a payer pill can do nothing at all.
  //
  // A budget with a single possible payer auto-selects them (the effect
  // above). Deselecting changes payerIds.length, which that effect depends
  // on, so it runs again and puts them straight back. The tap worked; it was
  // undone before it could be seen, and the pill read as broken. There is
  // genuinely no other direct payer to choose - the alternative is the bank -
  // so the pill stops pretending to be a toggle and the reason is stated.
  const soleDirectPayer = canManageShared && !paidFromBank && selectablePayers.length === 1;
  // Was recomputed inside the map, so a group of forty worked it out forty
  // times per keystroke for an answer that cannot differ between pills.
  const payersDisabled = getExpenseFundingControlState({
    paidFromBank,
    hasPersonalFunding: payerIds.length > 0,
    allowMixedFunding,
  }).personalPayersDisabled;

  const normalIncomeSource = incomeSources.find((source) => source.isMain) ?? incomeSources[0];

  // Keep the values hidden by Quick mode deterministic rather than relying on
  // stale selections left by a previous Advanced-mode visit.
  useEffect(() => {
    if (isAdvanced || isEditMode || !user?.id) return;
    const sourceKey = normalIncomeSource ? incomeSourceKey(normalIncomeSource.id) : null;
    if (!canManageShared && date !== todayIso()) {
      setDate(todayIso());
    }
    setIsRecurring(false);
    setRecurringMonthlyBudget('');
    setPaidFromBank(false);
    setSelectedBankAccountId(null);
    setAllowMixedFunding(false);
    setPayerIds([user.id]);
    setPayerAmounts({ [user.id]: amount });
    setPayerIncomeSourceIds(sourceKey ? { [user.id]: normalIncomeSource!.id } : {});
    setSelectedSources(sourceKey ? [sourceKey] : []);
    setSplitAmounts(sourceKey ? { [sourceKey]: amount } : {});
    setCategoryAllocations(category.trim() ? [{ category: category.trim(), amount }] : []);
  }, [amount, canManageShared, category, date, isAdvanced, isEditMode, normalIncomeSource?.id, user?.id]);

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
        const selection = addIncomeSourceToSelection({
          selectedSourceIds: selectedSources,
          amounts: splitAmounts,
          existingSourceId: payerIncomeSourceIds[userId],
          existingAmount: payerAmounts[userId],
          newSourceId: sourceKey,
        });
        setSelectedSources(selection.selectedSourceIds);
        setSplitAmounts(selection.amounts);
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
      if (userId !== paidById) {
        setPayerIncomeSourceIds((previous) => ({ ...previous, [userId]: source.id }));
      }
      setNewSourceName('');
      setNewSourcePayerId(null);
      Alert.alert(
        'Income source added',
        userId === paidById
          ? `${source.name} was added. Enter the amount it funded.`
          : `${source.name} is ready to use for this expense.`,
      );
    } catch (error) {
      Alert.alert('Could not add income source', getExpenseSaveError(error));
    } finally {
      setIsCreatingSource(false);
    }
  }, [
    isEditMode,
    newSourceName,
    paidById,
    payerAmounts,
    payerIncomeSourceIds,
    payerSourceIds,
    queryClient,
    selectedSources,
    splitAmounts,
  ]);

  // The API returns every category flat, with no indication of which ones are
  // children of another, so the picker rebuilds the parent/child split itself.
  // Both modes offer the parents; only Detailed goes on to offer the
  // subcategories underneath the parent that was chosen.
  const [categorySearch, setCategorySearch] = useState('');
  const categoryTree = useMemo(
    () =>
      // The generated BudgetCategory type doesn't declare parentId (the
      // OpenAPI spec is incomplete here), but GET /budget-categories returns
      // the full row and always has — routes/budget-categories.ts's GET does
      // a plain db.select().
      buildCategoryTree(categories as unknown as CategoryRow[]),
    [categories],
  );
  // Selecting a subcategory keeps its parent's chip lit, so the sub-row it
  // came from stays on screen instead of collapsing under the selection.
  // The top-level category currently in play: the selection itself, or its
  // parent when a subcategory is what is selected. Subcategories only go one
  // level deep, so a new child always hangs off this.
  const nestingParentName = parentOf(categoryTree, category) ?? category;
  const nestingParent = categories.find(
    (row) => row.name.trim().toLocaleLowerCase() === nestingParentName.trim().toLocaleLowerCase(),
  ) as { id: number } | undefined;

  // A category holding subcategories is a heading: its budget is theirs added
  // up and its spending is theirs too, so money cannot land on it directly.
  // Everything else can receive an expense — a top-level category with no
  // subcategories, and every subcategory.
  const headings = useMemo(
    () => new Set(categoryTree.filter((group) => group.children.length > 0).map((group) => group.name)),
    [categoryTree],
  );


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
      setCategoryAllocations((current) => {
        const next = addStandardCategory(current, name);
        setCategory(next[0]?.category ?? name);
        return next;
      });
      setNewCategoryName('');
      setNewCategoryBudget('');
      setNewCategoryRecurring(true);
      setNewCategoryPriority('3');
      setNewCategoryAddToBudget(false);
      setIsCreatingCategory(false);
      Alert.alert('Unbudgeted category selected', `${name} will be recorded without changing the monthly budget.`);
      return;
    }

    // Captured before the awaits: this can move while the request is in
    // flight, and a child must not land under whatever happens to be chosen by
    // the time it returns.
    const nestUnder = newCategoryParentId === null
      ? null
      : categories.find((row) => row.id === newCategoryParentId) ?? null;
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
          // Only ever nested under a top-level category; the server refuses a
          // second level anyway.
          ...(nestUnder ? { parentId: nestUnder.id } : {}),
        },
      });
      setCategoryAllocations((current) => {
        const next = addStandardCategory(current, created.name);
        setCategory(next[0]?.category ?? created.name);
        return next;
      });
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
       setNewCategoryParentId(null);
       Alert.alert(
         'Category added',
         nestUnder
           ? `${created.name} was added under ${nestUnder.name} and selected for this expense.`
           : `${created.name} was added to this expense.`,
       );
    } catch (error) {
      const duplicate = error instanceof ApiError && error.status === 409;
      Alert.alert(
        duplicate ? 'Category name already used' : 'Could not add category',
        duplicate
          ? 'Choose a different name or select the existing category from the list.'
          : error instanceof Error ? error.message : 'Check the category details and try again.',
      );
    }
  }, [canManageCategories, categories, createCategory, date, newCategoryAddToBudget, newCategoryBudget, newCategoryName, newCategoryParentId, newCategoryPriority, newCategoryRecurring, nestingParent, nestingParentName, queryClient]);

  const handleCreateBankAccount = useCallback(async () => {
    const name = newBankAccountName.trim();
    const accountNumber = newBankAccountNumber.trim();
    const openingBalance = Number(newBankOpeningBalance || 0);
    if (!name) {
      Alert.alert('Account name required', 'Enter a name for this bank account.');
      return;
    }
    try {
      if (!Number.isInteger(openingBalance) || openingBalance < 0) throw new Error('The starting balance must be zero or more whole shillings.');
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
    // A heading is not a destination, and is no longer drawn as something
    // tappable — this only guards against a stale caller.
    if (headings.has(name)) return;
    if (!isAdvanced && !isEditMode) {
      setCategory(name);
      setCategoryAllocations([{ category: name, amount }]);
      return;
    }
    const isOneOff = name.trim().toLocaleLowerCase() === 'other';
    setCategoryAllocations((previous) => {
      if (isOneOff) {
        const next = toggleOneOffCategory(previous);
        setCategory(next.find((allocation) => !isOneOffAllocation(allocation))?.category ?? next[0]?.category ?? '');
        return next;
      }
      const next = addStandardCategory(previous, name);
      setCategory(next[0]?.category ?? name);
      return next;
    });
    setCategory((previous) => previous || name);
    if (!isOneOff) {
      setIsCreatingCategory(false);
      setShowAdditionalCategoryPicker(false);
    }
  }, [amount, isAdvanced, isEditMode]);

  // A subcategory refines the allocation its parent already made rather than
  // adding a second one: the expense went to Groceries *instead of* the rest
  // of Food, so the row — and the amount typed into it — moves over. Tapping
  // the selected child again gives the allocation back to the parent.
  const chooseSubcategory = useCallback((child: string) => {
    const parent = parentOf(categoryTree, child);
    // A top-level category with no subcategories is chosen outright, not used
    // to refine anything. Detailed sends every chip through here, so without
    // this the tap was simply swallowed.
    if (!parent) {
      chooseCategory(child);
      return;
    }
    const siblings = categoryTree.find((group) => group.name === parent)?.children ?? [];
    const owns = (name: string) => name === parent || siblings.includes(name);
    // Tapping the chosen subcategory used to toggle back to the parent. The
    // parent can no longer hold an expense, so that toggle only ever produced
    // a rejection on save. The choice now stands until another one replaces it.
    const replacement = child;
    setCategoryAllocations((previous) => {
      // Refining means moving the allocation this family already has, so the
      // expense went to Groceries *instead of* the rest of Food. But when the
      // family has no allocation yet there is nothing to move, and mapping
      // over the list left it exactly as it was — which on an empty Detailed
      // form meant the first tap did nothing, no category was ever selected,
      // and so the create button could never offer to nest under one.
      const refining = previous.some((allocation) => owns(allocation.category));
      const next = refining
        ? previous.map((allocation) => (
            owns(allocation.category) ? { ...allocation, category: replacement } : allocation
          ))
        : addStandardCategory(previous, replacement);
      setCategory((current) => (!current || owns(current) ? replacement : current));
      return next;
    });
    setIsCreatingCategory(false);
    setShowAdditionalCategoryPicker(false);
  }, [categoryTree, chooseCategory]);

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

  const handleRemove = useCallback(() => {
    if (!editingExpense || !canRemoveExpense) return;
    Alert.alert(
      'Remove expense?',
      `Remove "${editingExpense.description}" from "${workspaceBudgetName(group)}"? Its effect on balances, reports, and activity will be removed. This cannot be undone.`,
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
  }, [canRemoveExpense, deleteExpense, editingExpense, group, invalidateExpenses]);

  const handleSubmit = useCallback(async () => {
    if (isEditMode && (!editingExpense || !canEditExpense)) {
      Alert.alert(
        'You cannot edit this expense',
        'Members can edit only their own personal expenses dated today.',
      );
      return;
    }
    // Clearing the amount on an existing expense used to delete it outright.
    // That made "I got the figure wrong and want it at zero for now" and "this
    // expense never happened" the same gesture, and only one of them is
    // recoverable. An empty amount now saves as zero; Remove still deletes.
    if (isEditMode && !amount.trim()) setAmount('0');
    // Everything wrong with the form, worked out in one pass. This used to be
    // two dozen sequential early returns, each raising its own alert, so a
    // half-filled form was a queue: fix one thing, tap Save, be told the next.
    const parsed = parseExpenseAmount(amount);
    const normalizedAllocations = normalizeAllocations(categoryAllocations);
    const effectivePayerIds = canManageShared ? payerIds : user?.id ? [user.id] : [];
    const effectivePaidFromBank = canManageShared ? paidFromBank : false;
    const effectiveIsRecurring = canManageShared ? isRecurring : false;
    const recurringBudget = Number(recurringMonthlyBudget);
    // An edit that never touched funding keeps the splits it already had, so
    // none of the funding rules apply to it.
    const preservesExistingFunding = Boolean(isEditMode && editingExpense && !fundingDirty);

    const problems = collectExpenseProblems({
      amount,
      description,
      notes,
      date,
      todayIso: todayIso(),
      isAdvanced,
      isEditMode,
      category,
      hasNormalIncomeSource: Boolean(normalIncomeSource),
      categoryAllocations,
      isRecurring: effectiveIsRecurring,
      recurringMonthlyBudget,
      payerIds: effectivePayerIds,
      payerAmounts,
      payerIncomeSourceIds,
      paidFromBank: effectivePaidFromBank,
      selectedBankAccountId,
      selectedSources,
      splitAmounts,
      fundingDirty,
      skipFundingChecks: preservesExistingFunding,
    });
    if (problems.length > 0) {
      const { title, message } = describeProblems(problems);
      // A missing category is now a fault rather than a choice, but the
      // expense still deserves the offer it used to get here: turn it into a
      // monthly budget rather than sending someone off to build the category
      // by hand and retype the whole form. Only when nothing else is wrong —
      // this offer has no business interrupting somebody who still has real
      // errors to clear.
      if (problems.length === 1 && problems[0].field === 'category' && !isEditMode) {
        const expenseDraft: ExpenseBudgetDraft = {
          amount, category, categoryAllocations, description, notes, payerIds, payerAmounts,
          payerIncomeSourceIds, isRecurring, recurringMonthlyBudget, paidFromBank,
          selectedBankAccountId, selectedSources, splitAmounts, allowMixedFunding, date,
        };
        Alert.alert(
          title,
          message,
          [
            { text: 'Cancel', style: 'cancel' },
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
      Alert.alert(title, message);
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
        if (!handleLapsedError(error)) {
          Alert.alert('Could not save expense', getExpenseSaveError(error));
        }
      } finally {
        setIsPending(false);
      }
      return;
    }

    const sourceCount = effectivePayerIds.length + (effectivePaidFromBank ? 1 : 0);
    const isSplitPayment = sourceCount > 1;


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
      if (!handleLapsedError(error)) {
        Alert.alert('Could not save expense', getExpenseSaveError(error));
      }
    } finally {
      setIsPending(false);
    }
  }, [allowMixedFunding, amount, category, categoryAllocations, description, notes, payerIds, payerAmounts, payerIncomeSourceIds, paidById, selectedSources, splitAmounts, isRecurring, date, paidFromBank, selectedBankAccountId, members, canManageShared, user?.id, createExpenseAsync, createCategory, categories, queryClient, updateExpense, invalidateExpenses, isEditMode, isAdvanced, editId, editingExpense, canEditExpense, incomeSources, normalIncomeSource, fundingDirty, recurringMonthlyBudget, updateCategory, bankAccounts, handleRemove]);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const hasOneOffAllocation = categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === 'other');
  const displayedCategoryAllocations = categoryAllocations;
  const fundingExpenseTotal = Number(amount.replace(/,/g, '')) || 0;
  const fundingBankAmount = paidFromBank ? (parseFloat(payerAmounts.__joint_bank__ || '0') || 0) : 0;
  const fundingDirectAmount = selectedSources.length > 0
    ? selectedSources.reduce((sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0), 0)
    : payerIds.reduce((sum, payerId) => sum + (parseFloat(payerAmounts[payerId] || '0') || 0), 0);
  const fundingFulfilled = isFundingFulfilled(fundingExpenseTotal, fundingBankAmount + fundingDirectAmount);

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

      {!isEditMode && (
        <View style={[styles.modeBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setIsAdvanced(false)}
              style={[styles.modeButton, { backgroundColor: !isAdvanced ? colors.primary : colors.muted, borderColor: !isAdvanced ? colors.primary : colors.border }]}
              testID="expense-mode-normal"
            >
              <Text style={[styles.modeButtonText, { color: !isAdvanced ? '#fff' : colors.foreground }]}>Quick</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsAdvanced(true)}
              style={[styles.modeButton, { backgroundColor: isAdvanced ? colors.primary : colors.muted, borderColor: isAdvanced ? colors.primary : colors.border }]}
              testID="expense-mode-advanced"
            >
              <Text style={[styles.modeButtonText, { color: isAdvanced ? '#fff' : colors.foreground }]}>Detailed</Text>
            </Pressable>
          </View>
          <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>
            {isAdvanced
              ? 'Detailed: split one payment across categories or people, backdate it, or make it recurring.'
              : 'Quick: one category, paid by you, today. Enough for most expenses.'}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
      >
        {/* Date comes first because it determines the month used by budgets and reports. */}
        {(isAdvanced || !isEditMode) && <View testID="expense-date-section" style={{ marginBottom: 4 }}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.primary, marginBottom: 0 }]}>
              WHEN DID THIS HAPPEN? <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0, fontSize: 11 }]}>
              {isAdvanced ? 'Backdate allowed · no future dates' : canManageShared ? 'Choose today or an earlier date' : 'Today only for members'}
            </Text>
          </View>
          <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
            This date decides which month includes the expense in budgets, totals, and reports.
          </Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[
              styles.dateRow,
              { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
            ]}
            testID={isAdvanced ? "expense-date-picker" : "normal-expense-date-picker"}
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
              minimumDate={!canManageShared ? new Date() : undefined}
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
        </View>}

        {/* Amount */}
        <Text style={[styles.label, { color: colors.primary, marginTop: 0 }]}>EXPENSE TOTAL</Text>
        <View style={[styles.amountSection, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '60', borderRadius: colors.radius }]}>
          <Text style={[styles.currencyLabel, { color: colors.primary }]}>KES</Text>
          <TextInput
            style={[styles.amountInput, { color: colors.primary }]}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            // A dozen places downstream read this field with Number(), so an
            // expression is collapsed into the field itself rather than
            // resolved at each of them: leave the field, and 1200+800+450
            // becomes 2450 before anything else looks at it.
            onBlur={() => {
              const resolved = evaluateAmountExpression(amount);
              if (isAmountExpression(amount) && resolved !== null) setAmount(String(resolved));
            }}
            testID="expense-amount-input"
            // Deliberately not autoFocus. This screen is a formSheet opening at
            // an 0.85 detent; focusing on mount raised the keyboard and scrolled
            // the content down past the date section immediately.
          />
        </View>
        {/* A numeric keypad has no operators, and a full keyboard would make
            every plain amount harder to type for the sake of the occasional
            sum. These put them one tap away. */}
        <AmountCalcRow amount={amount} onChangeAmount={setAmount} testIDPrefix="expense-amount" />

        {/* Category */}
        <View style={[styles.stageLabel, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55', borderRadius: colors.radius }]}>
          <Text style={[styles.stageLabelText, { color: colors.primary }]}>CATEGORY *</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
          {isAdvanced
            ? 'Every expense needs a category. A category holding subcategories is a heading — pick one of its subcategories instead.'
            : 'Choose where this expense goes. A category with subcategories is shown by them, because spending lands on a subcategory.'}
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
              {categoryTree.length === 0 && (
                isAdvanced || !canManageCategories ? (
                  <Text style={[styles.categoryStatusText, { color: colors.mutedForeground }]}>
                     {isAdvanced
                       ? (canManageCategories ? 'No categories yet. Create one below before you can save this expense.' : 'No categories are available. Ask a budget manager to add one.')
                       : 'No categories are available. Ask a budget manager to add one.'}
                  </Text>
                ) : (
                  // Quick cannot create a category — that is the whole point of
                  // it being the fast path. But a budget with none is a dead
                  // end: nothing to spend on, and no way out. So it offers the
                  // door rather than a second form, keeping the draft.
                  <Pressable
                    onPress={async () => {
                      const expenseDraft: ExpenseBudgetDraft = {
                        amount, category, categoryAllocations, description, notes, payerIds, payerAmounts,
                        payerIncomeSourceIds, isRecurring, recurringMonthlyBudget, paidFromBank,
                        selectedBankAccountId, selectedSources, splitAmounts, allowMixedFunding, date,
                      };
                      await AsyncStorage.setItem(RECURRING_BUDGET_HANDOFF_KEY, JSON.stringify({ expenseDraft }));
                      router.push({ pathname: '/(tabs)/budget', params: { setupCategories: '1' } });
                    }}
                    testID="quick-setup-categories"
                    accessibilityRole="button"
                    accessibilityLabel="Set up your categories"
                    style={styles.categoryStatus}
                  >
                    <Text style={[styles.categoryStatusText, { color: colors.primary }]}>
                      No categories yet. Set up your categories →
                    </Text>
                  </Pressable>
                )
              )}
            </>
          )}
        </ScrollView>
        {/* Both modes list the postable categories under the heading each
            belongs to. Detailed used to hide them behind heading chips, so a
            branch holding part of the expense and the branch you were looking
            inside were filled identically — two chips lit, no way to tell what
            either meant. With every subcategory on screen there is no "inside"
            to be lost in.

            The heading is text, not a chip: it cannot be chosen, so offering it
            as one would only invite the tap the server refuses. */}
        {!categoriesQuery.isLoading && !categoriesQuery.isError && categoryTree.length > 0 ? (
          <View style={styles.quickGroups}>
            <CategorySearchBox value={categorySearch} onChange={setCategorySearch} testID="category-search" />
            {filterCategoryTree(categoryTree, categorySearch).map((group) => (
              <View key={`group-${group.name}`} testID={`category-group-${group.name}`} style={styles.quickGroup}>
                {group.children.length > 0 ? (
                  <>
                    <Text style={[styles.quickGroupHeading, { color: colors.mutedForeground }]}>{group.name}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.categoryScroll}
                      contentContainerStyle={styles.categoryScrollContent}
                    >
                      {group.children.map((child) => (
                        <CategoryChip
                          key={child}
                          name={child}
                          selected={categoryAllocations.some((allocation) => allocation.category === child)}
                          // Quick replaces the whole choice; Detailed moves the
                          // allocation within this branch, which is what lets an
                          // expense be split across several categories.
                          onSelect={isAdvanced ? chooseSubcategory : chooseCategory}
                          colors={colors}
                        />
                      ))}
                    </ScrollView>
                  </>
                ) : (
                  <CategoryChip
                    name={group.name}
                    selected={categoryAllocations.some((allocation) => allocation.category === group.name)}
                    onSelect={chooseCategory}
                    colors={colors}
                  />
                )}
              </View>
            ))}
          </View>
        ) : null}
        {/* Quick still does not create anything itself — that is what keeps it
            one tap. But the door out was only offered when the budget was
            completely empty, so anybody with categories and a missing one had
            no route at all. It keeps the draft and comes back. */}
        {!isAdvanced && canManageCategories && categoryTree.length > 0 ? (
          <Pressable
            onPress={async () => {
              const expenseDraft: ExpenseBudgetDraft = {
                amount, category, categoryAllocations, description, notes, payerIds, payerAmounts,
                payerIncomeSourceIds, isRecurring, recurringMonthlyBudget, paidFromBank,
                selectedBankAccountId, selectedSources, splitAmounts, allowMixedFunding, date,
              };
              await AsyncStorage.setItem(RECURRING_BUDGET_HANDOFF_KEY, JSON.stringify({ expenseDraft }));
              router.push({ pathname: '/(tabs)/budget', params: { setupCategories: '1' } });
            }}
            testID="quick-add-category"
            accessibilityRole="button"
            accessibilityLabel="Add a category or subcategory"
            style={styles.quickAddCategory}
          >
            <Feather name="plus-circle" size={15} color={colors.primary} />
            <Text style={[styles.categoryStatusText, { color: colors.primary }]}>
              Add a category or subcategory
            </Text>
          </Pressable>
        ) : null}
        {/* The way into the create form. It had one once; a sync commit took
            it away, leaving the form reachable by nothing at all — which is
            why no category could be created here, and so why no subcategory
            ever appeared. The label follows the selection, so the commonest
            reason to open it says what it will do. */}
        {isAdvanced && canManageCategories && !isCreatingCategory && (
          <Pressable
            onPress={() => {
              setIsCreatingCategory(true);
              // Opens on the group the current selection belongs to, which is
              // usually the one meant; any other group is one tap away.
              setNewCategoryParentId(nestingParent?.id ?? null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create a new category or subcategory"
            testID="open-create-category"
            style={styles.addSourceLink}
            hitSlop={6}
          >
            <Feather name="plus-circle" size={15} color={colors.primary} />
            <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>
              New category or subcategory
            </Text>
          </Pressable>
        )}

        {isAdvanced && categoryAllocations.length === 0 && (
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Add another expense category"
            accessibilityState={{ disabled: true }}
            testID="add-category-allocation-mobile-disabled"
            style={[styles.addSourceLink, { opacity: 0.5 }]}
          >
            <Feather name="plus-circle" size={15} color={colors.mutedForeground} />
            <Text style={[styles.addSourceLinkText, { color: colors.mutedForeground }]}>Add another category</Text>
          </Pressable>
        )}
        {isAdvanced && categoryAllocations.length > 0 && (
          <View
            testID="category-allocation-card"
            style={[styles.allocationCard, { backgroundColor: colors.primary + '0A', borderColor: colors.primary + '60', borderRadius: colors.radius }]}
          >
            <View style={styles.allocationHeader}>
              <View>
                <Text style={[styles.allocationTitle, { color: colors.foreground }]}>CATEGORY AMOUNTS REQUIRED</Text>
                <Text style={[styles.hintText, { color: colors.foreground }]}>Enter how much of the expense each category covered.</Text>
              </View>
              <Text style={[styles.allocationTotal, { color: colors.foreground }]}>
                KES {displayedCategoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0).toLocaleString()}
              </Text>
            </View>
            {displayedCategoryAllocations.map((allocation) => {
              const isOneOff = allocation.category.trim().toLocaleLowerCase() === 'other';
              return (
              <View key={allocation.category} style={[styles.allocationRow, { borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius }]}>
                <View style={styles.allocationCategoryRow}>
                  <Text style={[styles.allocationCategory, { color: colors.foreground }]} numberOfLines={1}>{isOneOff ? 'One-off spending' : allocation.category}</Text>
                  <Pressable
                    onPress={() => removeAllocation(allocation.category)}
                    accessibilityLabel={`Remove ${isOneOff ? 'one-off spending' : allocation.category} allocation`}
                    testID={`remove-category-allocation-${allocation.category}`}
                    style={styles.allocationRemove}
                  >
                    <Feather name="x" size={18} color={colors.destructive} />
                  </Pressable>
                </View>
                <Text style={[styles.allocationAmountLabel, { color: colors.foreground }]}>
                  {isOneOff ? 'One-off spending amount (KES)' : `${allocation.category} amount (KES)`}
                </Text>
                <TextInput
                  style={[styles.allocationInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius }]}
                  value={allocation.amount}
                  onChangeText={(value) => updateAllocationAmount(allocation.category, value)}
                  keyboardType="numeric"
                  placeholder="Enter KES amount"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={isOneOff ? 'KES amount for one-off spending' : `Amount covered by ${allocation.category}`}
                  accessibilityHint="Required before this expense can be saved"
                  testID={`category-allocation-${allocation.category}`}
                />
                 {(() => {
                   const total = displayedCategoryAllocations.reduce((sum, item) => sum + (Number(item.amount.replace(/,/g, '')) || 0), 0);
                   const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
                   const difference = expenseTotal - total;
                   return (
                     <Text
                       accessibilityLiveRegion="polite"
                       testID={`category-allocation-status-mobile-${allocation.category}`}
                       style={[styles.allocationStatus, { color: difference === 0 && expenseTotal > 0 ? colors.primary : difference < 0 ? colors.destructive : colors.mutedForeground }]}
                     >
                       {difference === 0 && expenseTotal > 0
                         ? 'Allocated exactly.'
                         : difference > 0
                           ? `KES ${difference.toLocaleString()} remaining to allocate`
                           : `KES ${Math.abs(difference).toLocaleString()} over allocated`}
                     </Text>
                   );
                 })()}
              </View>
              );
            })}
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6, gap: 14 }}>
                  {categories
                    .filter((item) => item.name.trim().toLocaleLowerCase() !== 'other' && !categoryAllocations.some((allocation) => allocation.category === item.name))
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
          </View>
        )}
        {isAdvanced && isCreatingCategory ? (
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
            {/* Where it goes. Every top-level category is offered, headings
                included: adding a ledger to an existing group is the whole
                point, and a heading could never be the selection. A second
                level is never on the table, so a child is not offered as a
                parent. */}
            <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground, marginTop: 4 }]}>
              Where does it go?
            </Text>
            <View style={styles.parentChoiceRow}>
              <Pressable
                onPress={() => setNewCategoryParentId(null)}
                accessibilityRole="radio"
                accessibilityState={{ selected: newCategoryParentId === null }}
                testID="create-category-parent-top-level"
                style={[
                  styles.parentChoiceChip,
                  {
                    borderColor: newCategoryParentId === null ? colors.primary : colors.border,
                    backgroundColor: newCategoryParentId === null ? colors.primary + '1F' : colors.background,
                  },
                ]}
              >
                <Text style={{ color: newCategoryParentId === null ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  Its own group
                </Text>
              </Pressable>
              {categoryTree.map((group) => {
                const parent = categories.find((row) => row.name === group.name);
                if (!parent) return null;
                const picked = newCategoryParentId === parent.id;
                return (
                  <Pressable
                    key={`parent-${parent.id}`}
                    onPress={() => setNewCategoryParentId(parent.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked }}
                    accessibilityLabel={`Add this category under ${group.name}`}
                    testID={`create-category-parent-${group.name}`}
                    style={[
                      styles.parentChoiceChip,
                      {
                        borderColor: picked ? colors.primary : colors.border,
                        backgroundColor: picked ? colors.primary + '1F' : colors.background,
                      },
                    ]}
                  >
                    <Text style={{ color: picked ? colors.primary : colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                      Under {group.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>This will not change the Shared group. An owner or admin can add it later.</Text>
            )}
            {newCategoryAddToBudget && canManageCategories ? (
              <>
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>How important: 1 = must pay, 5 = can wait.</Text>
              <View style={styles.categoryPriorityRow}>
              {[1, 2, 3, 4, 5].map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => setNewCategoryPriority(String(priority))}
                  disabled={createCategory.isPending}
                  accessibilityRole="radio"
                  accessibilityLabel={`Importance ${priority}`}
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
        {isAdvanced && <Pressable
          onPress={() => chooseCategory('Other')}
          accessibilityRole="button"
          accessibilityLabel={hasOneOffAllocation ? "Remove one-off spending category" : "Add one-off spending category"}
          accessibilityState={{ selected: hasOneOffAllocation }}
          testID="one-off-spending-category"
          style={[
            styles.oneOffCategoryOption,
            {
              backgroundColor: hasOneOffAllocation ? colors.primary + '18' : colors.muted,
              borderColor: hasOneOffAllocation ? colors.primary : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="help-circle" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.oneOffCategoryTitle, { color: colors.foreground }]}>
              {hasOneOffAllocation ? 'Remove One-off spending' : 'One-off spending'}
            </Text>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Use this as the last category when part of the expense does not fit any listed category.
            </Text>
          </View>
        </Pressable>}
        {isAdvanced && categoryAllocations.some((allocation) => allocation.category.trim()) && (
          <Text
            accessibilityLiveRegion="polite"
            testID="category-allocation-status-mobile-end"
             style={[styles.allocationStatus, { color: (() => {
               const total = displayedCategoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
               const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
               const difference = expenseTotal - total;
               return difference === 0 && expenseTotal > 0
                 ? colors.primary
                 : difference < 0
                   ? colors.destructive
                   : colors.mutedForeground;
             })() }]}
          >
            {(() => {
              const total = displayedCategoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
              const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
              const difference = expenseTotal - total;
              return difference === 0 && expenseTotal > 0
                ? 'Allocated exactly.'
                : difference > 0
                  ? `KES ${difference.toLocaleString()} remaining to allocate`
                  : `KES ${Math.abs(difference).toLocaleString()} over allocated`;
            })()}
          </Text>
        )}
        {/* Running balance for selected category */}
        {isAdvanced && category ? (() => {
          const preview = categoryBalancePreviews.find(
            (item) => item.category.toLocaleLowerCase() === category.toLocaleLowerCase(),
          );
          if (!preview) return null;
          return (
            <View style={[styles.balancePill, {
              backgroundColor: preview.isOverBudget ? colors.destructive + '18' : colors.primary + '18',
              borderColor: preview.isOverBudget ? colors.destructive + '55' : colors.primary + '55',
            }]}>
              <Feather name="bar-chart-2" size={12} color={preview.isOverBudget ? colors.destructive : colors.primary} />
              <Text style={[styles.balancePillText, { color: preview.isOverBudget ? colors.destructive : colors.primary }]}>
                Spent before this expense: KES {preview.spentBeforeExpense.toLocaleString()}
                {preview.isOverBudget
                  ? `  ·  KES ${preview.overBy.toLocaleString()} over budget after this expense`
                  : `  ·  KES ${preview.remaining.toLocaleString()} left after this expense`}
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
            {isAdvanced && <>
             <Text style={[styles.label, { color: colors.mutedForeground }]}>{hasOneOffAllocation ? 'NOTES (required for one-off spending)' : 'NOTES (optional)'}</Text>
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
               placeholder={hasOneOffAllocation ? 'Explain what this one-off expense was for' : 'Any extra details…'}
               placeholderTextColor={colors.mutedForeground}
               value={notes}
               onChangeText={setNotes}
               accessibilityLabel="Notes"
               multiline
               numberOfLines={3}
               textAlignVertical="top"
             />
            </>}

          {!isAdvanced && (
            <View testID="normal-expense-summary" style={[styles.normalSummary, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '45', borderRadius: colors.radius }]}>
              <Feather name="check-circle" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                {/* Mirrors the web form's "Jamvi will record this as:" block.
                    Quick mode decides several things on your behalf - who
                    paid, that no bank account was involved, that it does not
                    repeat - and the web states each of them. Mobile stated
                    only the date, category and source, so the same mode
                    quietly promised less on the smaller screen. */}
                <Text style={[styles.normalSummaryTitle, { color: colors.foreground }]}>Jamvi will record this as:</Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 2 }]}>
                  {`• ${date === todayIso() ? 'today’s expense' : `an expense dated ${formatDateDisplay(date)}`}, paid by you, not from a bank account, and not recurring;`}
                </Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  {`• the full whole-KES amount in ${category.trim() ? `"${category.trim()}"` : 'the category you select'};`}
                </Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  {normalIncomeSource
                    ? `• funded in full from ${normalIncomeSource.name}${normalIncomeSource.isMain ? ' (your main income source)' : ''}.`
                    : '• funded from your saved income source once you select Detailed.'}
                </Text>
                {/* Quick decides the funding for you, and until now nothing
                    said the decision was reversible. Somebody who wanted a
                    different source had no way of knowing they could simply
                    save and reopen. */}
                {normalIncomeSource ? (
                  <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                    {`• you can change the payer or source later by opening this expense.`}
                  </Text>
                ) : null}
                {!sourcesLoading && !normalIncomeSource && (
                  <>
                    <Text style={[styles.normalBlockerText, { color: colors.destructive }]}>Add an income source before recording this expense.</Text>
                    <Pressable onPress={() => setIsAdvanced(true)} testID="normal-income-source-blocker">
                      <Text style={[styles.normalAdvancedLink, { color: colors.primary }]}>Use Detailed to add an income source</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          )}

        {/* Who paid */}
        {isAdvanced && (canManageShared || selectablePayers.length > 0) && (
          <>
             <View style={[styles.stageLabel, { backgroundColor: '#f59e0b1A', borderColor: '#f59e0b80', borderRadius: colors.radius }]}>
               <Text style={[styles.stageLabelText, { color: '#f59e0b' }]}>
                 FUNDING OPTIONS <Text style={{ color: '#ef4444' }}>*</Text>
               </Text>
             </View>
              {(categoryBalancePreviews.length > 0 || hasBudgetedCategorySelection) && (
               <View
                 style={[styles.categoryBalancePreview, {
                   backgroundColor: colors.primary + '0A',
                   borderColor: colors.primary + '45',
                   borderRadius: colors.radius,
                 }]}
                 accessibilityLiveRegion="polite"
                 testID="expense-category-balance-preview-mobile"
               >
                 <Text style={[styles.categoryBalancePreviewTitle, { color: colors.primary }]}>
                   CATEGORY BALANCES AFTER THIS EXPENSE
                 </Text>
                  {categoryBalancePreviews.length > 0 ? (
                    <>
                      {categoryBalancePreviews.map((preview) => (
                        <View key={preview.category} style={styles.categoryBalancePreviewRow}>
                          <Text style={[styles.categoryBalancePreviewCategory, { color: colors.foreground }]}>
                            {preview.category}
                          </Text>
                          <Text style={[styles.categoryBalancePreviewAmount, {
                            color: preview.isOverBudget ? colors.destructive : colors.primary,
                          }]}>
                            {preview.isOverBudget
                              ? `KES ${preview.overBy.toLocaleString()} over budget`
                              : `KES ${preview.remaining.toLocaleString()} left of KES ${preview.budgetAmount.toLocaleString()}`}
                          </Text>
                        </View>
                      ))}
                      <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                        These running balances use each category amount entered above.
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                      Enter the amount covered by each category above to see its running balance here.
                    </Text>
                  )}
               </View>
             )}
            <View style={styles.paidByRow}>
              {/* Joint-bank spending is restricted to group managers. */}
              {canManageShared && <Pressable
                onPress={() => {
                  if (isEditMode) setFundingDirty(true);
                  if (paidFromBank) {
                    setPaidFromBank(false);
                    setAllowMixedFunding(false);
                  } else {
                    const directTotal = selectedSources.length > 0
                      ? selectedSources.reduce((sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0), 0)
                      : payerIds.reduce((sum, payerId) => sum + (parseFloat(payerAmounts[payerId] || '0') || 0), 0);
                    const hasDirectSelection = selectedSources.length > 0 || directTotal > 0;
                    setPaidFromBank(true);
                    setAllowMixedFunding(hasDirectSelection);
                    if (hasDirectSelection) {
                      setPayerAmounts((previous) => ({
                        ...previous,
                        __joint_bank__: '',
                      }));
                    } else {
                      setPayerIds([]);
                      setSelectedSources([]);
                      setSplitAmounts({});
                      setPayerIncomeSourceIds({});
                      setPayerAmounts({ __joint_bank__: '' });
                    }
                  }
                }}
                style={[styles.paidByPill, {
                  backgroundColor: paidFromBank ? 'rgba(56,189,248,0.15)' : colors.muted,
                  borderColor: paidFromBank ? '#38bdf8' : colors.border,
                  borderRadius: colors.radius,
                }]}
                accessibilityRole="button"
                accessibilityLabel="Use a bank account to fund this expense"
                testID="expense-bank-funding-option"
              >
                <Feather name="credit-card" size={14} color={paidFromBank ? '#38bdf8' : colors.mutedForeground} />
                <Text style={[styles.paidByText, { color: paidFromBank ? '#38bdf8' : colors.foreground }]}>
                  Bank account
                </Text>
              </Pressable>}
              {selectablePayers.map((m) => (
                <PayerPill
                  key={m.userId}
                  userId={m.userId}
                  name={m.userName?.split(' ')[0] ?? 'Member'}
                  selected={payerIds.includes(m.userId)}
                  disabled={soleDirectPayer || payersDisabled}
                  dimmed={paidFromBank && payerIds.length === 0 && !allowMixedFunding}
                  hint={
                    soleDirectPayer
                      ? 'You are the only person in this budget, so this expense is recorded as paid by you.'
                      : undefined
                  }
                  onToggle={togglePayer}
                  colors={colors}
                />
              ))}
            </View>
            {soleDirectPayer && (
              <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 6 }]}>
                You are the only person in this budget, so this is paid by you. Choose Bank account if the money came from one.
              </Text>
            )}
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
                {payerIds.length === 0 && selectedBankAccountId && (
                  <View style={styles.singleFundingAmount}>
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM</Text>
                    <TextInput
                      style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      placeholder="KES 0"
                      placeholderTextColor={colors.mutedForeground}
                      value={payerAmounts.__joint_bank__ || ''}
                      onChangeText={(value) => setPayerAmounts((previous) => ({ ...previous, __joint_bank__: value }))}
                      testID="expense-bank-amount"
                    />
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Enter this manually to confirm how much should reduce the selected account.
                    </Text>
                  </View>
                )}
                 {bankAccounts.length === 0 && (
                   <Text style={[styles.hintText, { color: colors.foreground }]}>
                     No bank account yet. Create one below and Jamvi will select it for this expense automatically.
                   </Text>
                 )}
                {canManageShared && (isAddingBankAccount ? (
                  <View style={styles.inlineAccountRow}>
                    <TextInput
                      autoFocus
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="e.g. M-Pesa wallet or KCB account"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountName}
                      onChangeText={setNewBankAccountName}
                      editable={!createBankAccount.isPending}
                       returnKeyType="next"
                       testID="new-bank-account-name-mobile"
                    />
                    <TextInput
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Account number (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountNumber}
                      onChangeText={setNewBankAccountNumber}
                       returnKeyType="next"
                       testID="new-bank-account-number-mobile"
                    />
                    <TextInput
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                       placeholder="Starting balance (KES)"
                      keyboardType="number-pad"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankOpeningBalance}
                      onChangeText={setNewBankOpeningBalance}
                       testID="new-bank-opening-balance-mobile"
                    />
                     <View style={styles.inlineAccountActions}>
                       <Pressable
                         accessibilityRole="button"
                         accessibilityLabel="Add bank account"
                         onPress={() => void handleCreateBankAccount()}
                         disabled={createBankAccount.isPending}
                         style={[styles.addSourceButton, styles.inlineAccountSubmit, { backgroundColor: colors.primary, opacity: createBankAccount.isPending ? 0.6 : 1 }]}
                         testID="add-bank-account-mobile"
                       >
                         {createBankAccount.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Add bank account</Text>}
                       </Pressable>
                       <Pressable
                         accessibilityRole="button"
                         onPress={() => { setIsAddingBankAccount(false); setNewBankAccountName(''); setNewBankAccountNumber(''); setNewBankOpeningBalance(''); }}
                         style={styles.inlineAccountCancel}
                       >
                         <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                       </Pressable>
                     </View>
                  </View>
                ) : (
                   <Pressable onPress={() => setIsAddingBankAccount(true)} style={styles.addSourceLink} testID="create-bank-account-inline-mobile">
                    <Feather name="plus-circle" size={14} color={colors.primary} />
                     <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>
                       {bankAccounts.length === 0 ? 'Create bank account' : 'New bank account'}
                     </Text>
                  </Pressable>
                ))}
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

            {/* Per-source split rows — The group can be mixed with people. */}
            {payerIds.length + (paidFromBank ? 1 : 0) > 1 && (() => {
              const total = parseFloat(amount.replace(/,/g, '')) || 0;
              const splitTotal = payerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0)
                + (paidFromBank ? parseFloat(payerAmounts.__joint_bank__ || '0') || 0 : 0);
              const diff = total - splitTotal;
              return (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                    Enter the amount from each selected source manually{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ''}.
                  </Text>
                  {paidFromBank && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', width: 76 }}>Bank account</Text>
                      <TextInput
                        style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 12, fontSize: 16, color: colors.foreground, fontFamily: 'Inter_400Regular' }}
                        keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                        value={payerAmounts.__joint_bank__ || ''}
                        onChangeText={val => {
                          if (isEditMode) setFundingDirty(true);
                          setPayerAmounts((previous) => {
                            return { ...previous, __joint_bank__: val };
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

         {/* Financed by is only shown inside the paid-directly path, and only
             in Detailed mode. Quick mode's own effect above silently fills
             payerIds/selectedSources with the same defaults this card would
             let someone set by hand (current user, main income source, full
             amount) - without this isAdvanced check, that auto-fill also
             satisfies showPersonalIncomeSources, so Quick mode ended up
             showing this manual chip-and-amount picker right underneath its
             own "Jamvi will record this as: funded in full from ..." summary,
             which already says the same thing is happening automatically. */}
        {isAdvanced && getExpenseFundingControlState({
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
                  const sourceDisabled = !selected && fundingFulfilled;
                  return (
                    <Pressable key={src.id} disabled={sourceDisabled} accessibilityState={{ selected, disabled: sourceDisabled }} testID={`income-source-chip-${src.id}`} onPress={() => {
                       if (sourceDisabled) return;
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
                        const selection = addIncomeSourceToSelection({
                          selectedSourceIds: previous,
                          amounts: splitAmounts,
                          existingSourceId: previous.length === 0 ? payerIncomeSourceIds[paidById] : null,
                          existingAmount: previous.length === 0 ? payerAmounts[paidById] : undefined,
                          newSourceId: key,
                        });
                        setSplitAmounts(selection.amounts);
                        return selection.selectedSourceIds;
                      });
                    }}
                      style={[styles.sourceChip, { backgroundColor: selected ? color + '22' : colors.background, borderColor: selected ? color : colors.border, borderRadius: colors.radius, opacity: sourceDisabled ? 0.42 : 1 }]}>
                      <Feather name="briefcase" size={13} color={selected ? color : colors.mutedForeground} />
                      <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>{src.name}</Text>
                      {selected && <Feather name="check" size={11} color={color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {fundingFulfilled && (
              <Text style={[styles.hintText, { color: colors.primary, marginTop: 8 }]} accessibilityLiveRegion="polite">
                Fully funded. Other income sources are unavailable until you lower an existing portion.
              </Text>
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
            {(!paidFromBank || allowMixedFunding) && selectedSources.length > 0 && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                    Enter each amount manually. This prevents a mistaken automatic allocation.
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
              </View>
            )}
          </View>
        )}

        {isAdvanced && (() => {
          const total = parseFloat(amount.replace(/,/g, '')) || 0;
          if (total <= 0) return null;
          const bankAmount = paidFromBank ? (parseFloat(payerAmounts.__joint_bank__ || '0') || 0) : 0;
          const directAmount = selectedSources.length > 0
            ? selectedSources.reduce((sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0), 0)
            : payerIds.reduce((sum, payerId) => sum + (parseFloat(payerAmounts[payerId] || '0') || 0), 0);
          const funded = bankAmount + directAmount;
          const difference = total - funded;
          const needsDirectFunding = !paidFromBank || allowMixedFunding;
          const hasDirectSource = selectedSources.length > 0 || Boolean(payerIncomeSourceIds[paidById]);
          const message = paidFromBank && !selectedBankAccountId
            ? 'Choose the bank account used for this expense'
            : needsDirectFunding && payerIds.length === 0
              ? 'Choose who paid the direct portion'
              : needsDirectFunding && !hasDirectSource
                ? 'Choose an income source for every direct portion'
                : funded <= 0
                  ? 'Enter the amount from each funding source'
                  : difference > 0
                    ? `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · KES ${difference.toLocaleString()} remaining`
                    : difference < 0
                      ? `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · KES ${Math.abs(difference).toLocaleString()} over`
                      : `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · Fully funded`;
          const isReady = difference === 0 && funded > 0 && (!paidFromBank || Boolean(selectedBankAccountId)) && (!needsDirectFunding || (payerIds.length > 0 && hasDirectSource));
          const isOver = difference < 0;
          const statusColor = isReady ? '#15803d' : isOver ? '#b91c1c' : '#b45309';
          const statusBorder = isReady ? '#86efac' : isOver ? '#fca5a5' : '#fcd34d';
          const statusBackground = isReady ? '#f0fdf4' : isOver ? '#fef2f2' : '#fffbeb';
          return (
            <View
              accessibilityLiveRegion="polite"
              testID="expense-funding-summary"
              style={{
                borderWidth: 1,
                borderColor: statusBorder,
                backgroundColor: statusBackground,
                borderRadius: colors.radius,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: statusColor, fontFamily: 'Inter_600SemiBold' }}>
                {message}
              </Text>
            </View>
          );
        })()}

        {/* Recurring expenses affect shared planning and are manager-only. */}
        {isAdvanced && canManageShared && <View
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
        {isAdvanced && canManageShared && isRecurring && (
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
  subcategoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 },
  parentChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  parentChoiceChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  nestLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flexShrink: 1 },
  subcategoryBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  modeBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  modeHint: { fontSize: 11, lineHeight: 15, marginTop: 7 },
  normalSummary: { marginTop: 14, padding: 12, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  normalSummaryTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  normalBlockerText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  normalAdvancedLink: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 7, textDecorationLine: 'underline' },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
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
  stageLabel: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stageLabelText: {
    fontSize: 11,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.9,
  },
  categoryScroll: { marginHorizontal: -20 },
  quickGroups: { gap: 10, marginTop: 4 },
  quickAddCategory: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  quickGroup: { gap: 4 },
  quickGroupHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  categoryScrollContent: { paddingHorizontal: 20, paddingVertical: 10, gap: 16 },
  oneOffCategoryOption: {
    marginTop: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  oneOffCategoryTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
     minHeight: 72,
    minWidth: 112,
     paddingHorizontal: 20,
     paddingVertical: 20,
     borderWidth: 1.5,
  },
  categoryChipText: {
     fontSize: 15,
     fontWeight: '600' as const,
     fontFamily: 'Inter_600SemiBold',
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
  allocationRow: { borderWidth: 1, padding: 10, gap: 7 },
  allocationCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocationCategory: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  allocationAmountLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  allocationInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  allocationRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  allocationStatus: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8, paddingHorizontal: 4 },
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
  categoryBalancePreview: {
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  categoryBalancePreviewTitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  categoryBalancePreviewRow: {
    gap: 2,
  },
  categoryBalancePreviewCategory: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryBalancePreviewAmount: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
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
    gap: 8,
  },
  inlineAccountInput: {
    flex: 0,
    minWidth: 0,
    width: '100%',
  },
  inlineAccountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  inlineAccountSubmit: {
    flex: 1,
    minHeight: 44,
  },
  inlineAccountCancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
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
