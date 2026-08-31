import { useState, useEffect } from "react";

// Expense priority tiers from the budget document
const EXPENSE_TIERS = [
  {
    tier: 1, label: "Survival Essentials",
    bar: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    categories: ["Rent", "Food", "School fees", "Nanny salary", "Water & electricity"],
  },
  {
    tier: 2, label: "Health & Education",
    bar: "bg-warning", badge: "bg-warning/10 text-warning",
    categories: ["Medical outpatient", "Medical insurance", "Uniform replenishment"],
  },
  {
    tier: 3, label: "Daily Household",
    bar: "bg-brand-gold", badge: "bg-brand-gold/15 text-[#8A6200] dark:text-brand-gold",
    categories: ["Household supplies", "Kids clothes"],
  },
  {
    tier: 4, label: "Connectivity & Care",
    bar: "bg-brand-teal", badge: "bg-brand-teal/10 text-[#087F8C] dark:text-brand-teal",
    categories: ["Wifi/data", "Grooming"],
  },
  {
    tier: 5, label: "Discretionary",
    bar: "bg-muted-foreground/50", badge: "bg-muted text-muted-foreground",
    categories: ["Entertainment", "Pocket money"],
  },
];

import {
  useGetExpenses, useGetBudgetCategories, useGetMembers, useGetGroup,
  useCreateExpense, useCreateBudgetCategory, useUpdateBudgetCategory, useDeleteExpense, useUpdateExpense, useApplyRecurringExpenses,
  useGetDashboardSummary, useGetDashboardCategoryBreakdown,
  getGetExpensesQueryKey, getGetDashboardSummaryQueryKey,
  getGetBudgetCategoriesQueryKey, getGetDashboardCategoryBreakdownQueryKey, getGetDashboardActivityQueryKey,
  type IncomeSource, ApiError, useGetJointAccount, useGetJointAccounts, useCreateJointAccount, getGetJointAccountsQueryKey,
} from "@workspace/api-client-react";
import { Flag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { appPath } from "@/lib/base-path";
import { Trash2, Plus, ArrowLeft, ArrowRight, Loader2, Calendar, RefreshCw, Repeat, Pencil, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCategoryAllocationStatus,
  getExpenseFundingControlState,
  getExpenseFundingStatus,
  getFundingRemainder,
  getNewExpenseCategoryMode,
  hasMissingPersonalFundingSource,
} from "@/lib/expense-funding-utils";

type Expense = {
  id: number;
  amount: number;
  category: string;
  categoryAllocations?: { category: string; amount: number }[];
  description: string;
  notes?: string | null;
  paidById: string | null;
  paidByName: string | null;
  incomeSourceId?: number | null;
  paidFromBank?: boolean;
  accountId?: number | null;
  isRecurring: boolean;
  date: string;
  incomeSplits?: {
    userId?: string | null;
    label?: string;
    amount: number;
    incomeSourceId?: number;
    fromBank: boolean;
    accountId?: number;
  }[];
};

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSelfFundedPersonalExpense(expense: Expense, userId: string | undefined) {
  if (!userId || expense.paidById !== userId || expense.paidFromBank || expense.isRecurring) {
    return false;
  }

  return !expense.incomeSplits?.some(
    (split) => split.fromBank || split.userId !== userId,
  );
}

function useExpenseForm(defaults?: Partial<Expense>, now?: Date) {
  const today = now ?? new Date();
  const [amountValue, setAmountValue] = useState(defaults?.amount?.toString() ?? "");
  const initialAllocations = defaults?.categoryAllocations?.length
    ? defaults.categoryAllocations.map((allocation) => ({ category: allocation.category, amount: String(allocation.amount) }))
    : [{ category: defaults?.category ?? "", amount: defaults?.category ? defaults?.amount?.toString() ?? "" : "" }];
  const [categoryAllocations, setCategoryAllocations] = useState(initialAllocations);
  const amount = amountValue;
  const setAmount = (value: string) => setAmountValue(value);
  const category = categoryAllocations[0]?.category ?? "";
  const setCategory = (value: string) => setCategoryAllocations((current) =>
    current.length ? [{ ...current[0], category: value }, ...current.slice(1)] : [{ category: value, amount: "" }],
  );
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [paidById, setPaidById] = useState(defaults?.paidById ?? "");
  // Multi-payer support (add form only; edit uses single paidById)
  const [payerIds, setPayerIds] = useState<string[]>(defaults?.paidById ? [defaults.paidById] : []);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [payerIncomeSourceIds, setPayerIncomeSourceIds] = useState<Record<string, number | null>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [otherIncomeSourceLabel, setOtherIncomeSourceLabel] = useState<string | null>(null);
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(defaults?.accountId ?? null);
  const [isRecurring, setIsRecurring] = useState(defaults?.isRecurring ?? false);
  const [recurringMonthlyBudget, setRecurringMonthlyBudget] = useState("");
  const [date, setDate] = useState(defaults?.date ?? localDateInputValue(today));
  return { amount, setAmount, category, setCategory, categoryAllocations, setCategoryAllocations, description, setDescription, notes, setNotes,
           paidById, setPaidById, payerIds, setPayerIds, payerAmounts, setPayerAmounts,
           payerIncomeSourceIds, setPayerIncomeSourceIds,
           incomeSourceId, setIncomeSourceId, otherIncomeSourceLabel, setOtherIncomeSourceLabel,
             paidFromBank, setPaidFromBank, accountId, setAccountId, isRecurring, setIsRecurring,
             recurringMonthlyBudget, setRecurringMonthlyBudget, date, setDate };
}

const RECURRING_EXPENSE_DRAFT_KEY = "jamvi-recurring-expense-draft";

function useIncomeSources(userId: string) {
  return useQuery<IncomeSource[]>({
    queryKey: ["income-sources", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/income-sources?userId=${userId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
    // Sources can be added from the mobile Settings screen. Always refresh
    // when this picker is mounted for a person so the web form does not retain
    // an earlier empty result.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

function useIncomeSourcesForUsers(userIds: string[]) {
  const ids = [...new Set(userIds)].sort();
  return useQuery<Record<string, IncomeSource[]>>({
    queryKey: ["income-sources", "payers", ids],
    queryFn: async () => {
      const entries = await Promise.all(ids.map(async (userId) => {
        const res = await fetch(`/api/income-sources?userId=${encodeURIComponent(userId)}`, { credentials: "include" });
        if (!res.ok) return [userId, []] as const;
        return [userId, await res.json() as IncomeSource[]] as const;
      }));
      return Object.fromEntries(entries);
    },
    enabled: ids.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

const EXPENSES_MONTH_KEY = "expenses-month-pref";

function getExpenseDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const month = Number(params.get("month"));
  const year = Number(params.get("year"));
  const editId = Number(params.get("edit"));
  const payerId = params.get("payer");
  const category = params.get("category");
  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null,
    editId: Number.isInteger(editId) && editId > 0 ? editId : null,
    payerId: payerId?.trim() || null,
    category: category?.trim() || null,
  };
}

export default function Expenses() {
  const now = new Date();
  const today = localDateInputValue(now);
  const { user } = useAuth();
  const expenseDeepLink = getExpenseDeepLink();
  const [month, setMonth] = useState(() => {
    if (expenseDeepLink.month != null && expenseDeepLink.year != null) return expenseDeepLink.month;
    try {
      const raw = localStorage.getItem(EXPENSES_MONTH_KEY);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.month === "number") return p.month; }
    } catch {}
    return now.getMonth() + 1;
  });
  const [year, setYear] = useState(() => {
    if (expenseDeepLink.month != null && expenseDeepLink.year != null) return expenseDeepLink.year;
    try {
      const raw = localStorage.getItem(EXPENSES_MONTH_KEY);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.year === "number") return p.year; }
    } catch {}
    return now.getFullYear();
  });

  useEffect(() => {
    try { localStorage.setItem(EXPENSES_MONTH_KEY, JSON.stringify({ month, year })); } catch {}
  }, [month, year]);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<{
    payerId: string | null;
    category: string | null;
  }>({
    payerId: expenseDeepLink.payerId,
    category: expenseDeepLink.category,
  });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [editHasMultipleFundingSplits, setEditHasMultipleFundingSplits] = useState(false);
  const [editHasBankFunding, setEditHasBankFunding] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [newCategoryRecurring, setNewCategoryRecurring] = useState(true);
  const [newCategoryPriority, setNewCategoryPriority] = useState("3");
  const [newCategoryAddToBudget, setNewCategoryAddToBudget] = useState(false);
  const [allowMixedFunding, setAllowMixedFunding] = useState(false);
  const [saveOtherAsCategory, setSaveOtherAsCategory] = useState(false);
  const [isAddingBankAccount, setIsAddingBankAccount] = useState(false);
  const [newBankAccountName, setNewBankAccountName] = useState("");
  const [newBankAccountNumber, setNewBankAccountNumber] = useState("");
  const [newBankOpeningBalance, setNewBankOpeningBalance] = useState("");
  const [uncategorizedSaveOpen, setUncategorizedSaveOpen] = useState(false);

  const addForm = useExpenseForm(undefined, now);
  const editForm = useExpenseForm();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resumeRecurring") !== "1") return;

    try {
      const rawDraft = sessionStorage.getItem(RECURRING_EXPENSE_DRAFT_KEY);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft) as {
        amount?: string;
        categoryAllocations?: { category: string; amount: string }[];
        description?: string;
        notes?: string;
        paidById?: string;
        payerIds?: string[];
        payerAmounts?: Record<string, string>;
        payerIncomeSourceIds?: Record<string, number | null>;
        incomeSourceId?: number | null;
        otherIncomeSourceLabel?: string | null;
        paidFromBank?: boolean;
        accountId?: number | null;
        date?: string;
        saveOtherAsCategory?: boolean;
        recurringMonthlyBudget?: string;
        isRecurring?: boolean;
        confirmedCategory?: string;
      };
      addForm.setAmount(draft.amount ?? "");
      addForm.setCategoryAllocations((draft.categoryAllocations?.length ? draft.categoryAllocations : [{ category: "", amount: "" }]).map((allocation) =>
        (!allocation.category.trim() || allocation.category.trim().toLocaleLowerCase() === "other") && draft.confirmedCategory
          ? { ...allocation, category: draft.confirmedCategory }
          : allocation,
      ));
      addForm.setDescription(draft.description ?? "");
      addForm.setNotes(draft.notes ?? "");
      addForm.setPaidById(draft.paidById ?? "");
      addForm.setPayerIds(draft.payerIds ?? []);
      addForm.setPayerAmounts(draft.payerAmounts ?? {});
      addForm.setPayerIncomeSourceIds(draft.payerIncomeSourceIds ?? {});
      addForm.setIncomeSourceId(draft.incomeSourceId ?? null);
      addForm.setOtherIncomeSourceLabel(draft.otherIncomeSourceLabel ?? null);
      addForm.setPaidFromBank(draft.paidFromBank ?? false);
      addForm.setAccountId(draft.accountId ?? null);
      addForm.setDate(draft.date ?? today);
      addForm.setIsRecurring(draft.isRecurring ?? true);
      addForm.setRecurringMonthlyBudget(
        params.get("recurringMonthlyBudget") ?? draft.recurringMonthlyBudget ?? "",
      );
      setSaveOtherAsCategory(draft.saveOtherAsCategory ?? false);
      setIsAdding(true);
      sessionStorage.removeItem(RECURRING_EXPENSE_DRAFT_KEY);
    } catch {
      sessionStorage.removeItem(RECURRING_EXPENSE_DRAFT_KEY);
    }

    params.delete("resumeRecurring");
    params.delete("recurringMonthlyBudget");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, []);

  const { data: expenses, isLoading } = useGetExpenses({ month, year });
  const { data: categories } = useGetBudgetCategories();
  const { data: members } = useGetMembers();
  const { data: group } = useGetGroup();
  const { data: bankAccounts = [] } = useGetJointAccounts();
  const activeExpenseBankAccountId = isAdding
    ? addForm.accountId
    : editingId !== null
      ? editForm.accountId
      : null;
  const { data: activeExpenseBankAccount } = useGetJointAccount(
    activeExpenseBankAccountId ? { accountId: activeExpenseBankAccountId } : undefined,
  );
  const sharedTransactionsLocked =
    group?.canRecordSharedTransactions === false && (members?.length ?? 0) < 2;
  const { data: summary } = useGetDashboardSummary({ month, year });
  const { data: breakdown } = useGetDashboardCategoryBreakdown({ month, year });
  const createExpense = useCreateExpense();
  const createCategory = useCreateBudgetCategory();
  const updateCategory = useUpdateBudgetCategory();
  const createBankAccount = useCreateJointAccount();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const applyRecurring = useApplyRecurringExpenses();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentMembership = members?.find((member) => member.userId === user?.id);
  const isPersonalBudget = group?.isPrivate === true;
  const canManageExpenses =
    group?.isPrivate === true ||
    group?.role === "owner" ||
    group?.role === "admin" ||
    currentMembership?.role === "owner" ||
    currentMembership?.role === "admin";
  const memberPayerId = isPersonalBudget ? user?.id : (canManageExpenses ? undefined : currentMembership?.userId);
  const canManageCategories = canManageExpenses;
  const canEditExpense = (expense: Expense) =>
    canManageExpenses || (expense.date === today && isSelfFundedPersonalExpense(expense, user?.id));
  // The client remains compatible with older generated API types while the
  // optional allocation field rolls out server-side.
  const visibleExpenses = (expenses as Expense[] | undefined)?.filter((expense) => {
    if (ledgerFilter.payerId === "__joint__" && expense.paidById !== null) return false;
    if (ledgerFilter.payerId && ledgerFilter.payerId !== "__joint__" && expense.paidById !== ledgerFilter.payerId) return false;
    if (ledgerFilter.category && expense.category !== ledgerFilter.category && !expense.categoryAllocations?.some((allocation) => allocation.category === ledgerFilter.category)) return false;
    return true;
  });
  const selectedPayerName = ledgerFilter.payerId === "__joint__"
    ? "Bank account"
    : members?.find((member) => member.userId === ledgerFilter.payerId)?.userName;
  const ledgerFilterLabel = [
    selectedPayerName ? `Paid by ${selectedPayerName}` : null,
    ledgerFilter.category ? `Category: ${ledgerFilter.category}` : null,
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!isAdding || !memberPayerId || addForm.paidFromBank) return;
    if (!isPersonalBudget && canManageExpenses) return;
    if (
      addForm.payerIds.length === 1 &&
      addForm.payerIds[0] === memberPayerId &&
      addForm.paidById === memberPayerId &&
      !addForm.paidFromBank
    ) return;

    addForm.setPayerIds([memberPayerId]);
    addForm.setPaidById(memberPayerId);
  }, [
    isAdding,
    canManageExpenses,
    isPersonalBudget,
    memberPayerId,
    addForm.payerIds,
    addForm.paidById,
    addForm.paidFromBank,
  ]);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const { data: prevExpenses } = useGetExpenses({ month: prevMonth, year: prevYear });
  const recurringFromPrev = (prevExpenses ?? []).filter(e => e.isRecurring);
  const alreadyApplied = (expenses ?? []).some(e => e.isRecurring);
  const showRecurringBanner = recurringFromPrev.length > 0 && !alreadyApplied;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
  };

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const [addNewSource, setAddNewSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [addDirectSourceIds, setAddDirectSourceIds] = useState<number[]>([]);
  const [addDirectSourceAmounts, setAddDirectSourceAmounts] = useState<Record<string, string>>({});
  const { data: addFormSources, refetch: refetchAddSources } = useIncomeSources(addForm.payerIds[0] ?? addForm.paidById);
  const { data: addPayerSources = {} } = useIncomeSourcesForUsers(addForm.payerIds);
  const { data: editFormSources } = useIncomeSources(editForm.paidById);

  const resetAdd = () => {
    addForm.setAmount(""); addForm.setCategory(""); addForm.setDescription(""); addForm.setNotes("");
    addForm.setCategoryAllocations([{ category: "", amount: "" }]);
    addForm.setPaidById(""); addForm.setPayerIds([]); addForm.setPayerAmounts({}); addForm.setPayerIncomeSourceIds({});
    addForm.setIncomeSourceId(null); addForm.setOtherIncomeSourceLabel(null); addForm.setIsRecurring(false);
    setAddDirectSourceIds([]); setAddDirectSourceAmounts({});
    addForm.setRecurringMonthlyBudget("");
    addForm.setAccountId(null);
    addForm.setDate(today);
    setAddNewSource(false); setNewSourceName("");
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
    setNewCategoryRecurring(true); setNewCategoryPriority("3"); setNewCategoryAddToBudget(false);
    setAllowMixedFunding(false);
    setSaveOtherAsCategory(false);
    setIsAddingBankAccount(false); setNewBankAccountName("");
    setIsAdding(false);
  };

  const startEdit = (expense: Expense) => {
    if (!canEditExpense(expense)) {
      toast({
        variant: "destructive",
        title: "You cannot edit this expense",
        description: "Members can edit only their own personal expenses dated today.",
      });
      return;
    }
    const personalSplit = expense.incomeSplits?.find((split) => !split.fromBank);
    const allFundingIsBank = expense.incomeSplits?.length
      ? expense.incomeSplits.every((split) => split.fromBank)
      : false;
    const paidFromBank = expense.paidFromBank === true || allFundingIsBank;
    const bankSplit = expense.incomeSplits?.find((split) => split.fromBank);
    const hasBankFunding = paidFromBank || !!bankSplit;

    editForm.setAmount(expense.amount.toString());
    editForm.setCategoryAllocations(
      expense.categoryAllocations?.length
        ? expense.categoryAllocations.map((allocation) => ({ category: allocation.category, amount: String(allocation.amount) }))
        : [{ category: expense.category, amount: String(expense.amount) }],
    );
    editForm.setDescription(expense.description);
    editForm.setNotes(expense.notes ?? "");
    editForm.setPaidById(paidFromBank ? "" : (expense.paidById ?? personalSplit?.userId ?? ""));
    editForm.setIncomeSourceId(
      paidFromBank ? null : (personalSplit?.incomeSourceId ?? expense.incomeSourceId ?? null),
    );
    editForm.setOtherIncomeSourceLabel(
      !paidFromBank && personalSplit?.label ? personalSplit.label : null,
    );
    editForm.setPaidFromBank(paidFromBank);
    editForm.setAccountId(expense.accountId ?? bankSplit?.accountId ?? null);
    setEditHasMultipleFundingSplits((expense.incomeSplits?.length ?? 0) > 1);
    setEditHasBankFunding(hasBankFunding);
    editForm.setIsRecurring(expense.isRecurring);
    editForm.setRecurringMonthlyBudget(
      expense.isRecurring
        ? String((categories ?? []).find((item) => item.name === expense.category)?.budgetAmount || "")
        : "",
    );
    editForm.setDate(expense.date);
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
    setNewCategoryRecurring(true); setNewCategoryPriority("3"); setNewCategoryAddToBudget(false);
    setAllowMixedFunding(false);
    setSaveOtherAsCategory(false);
    setEditingId(expense.id);
    setIsAdding(false);
  };

  useEffect(() => {
    if (editingId === null || !editForm.otherIncomeSourceLabel || !editFormSources) return;

    const matchingSource = editFormSources.find(
      (source) => source.id === editForm.incomeSourceId,
    ) ?? editFormSources.find(
      (source) => source.name === editForm.otherIncomeSourceLabel,
    );
    if (!matchingSource) {
      editForm.setIncomeSourceId(null);
      return;
    }

    editForm.setIncomeSourceId(matchingSource.id);
    editForm.setOtherIncomeSourceLabel(null);
  }, [editingId, editForm.incomeSourceId, editForm.otherIncomeSourceLabel, editFormSources]);

  useEffect(() => {
    if (!expenseDeepLink.editId || !expenses || editingId === expenseDeepLink.editId) return;
    const target = expenses.find((expense) => expense.id === expenseDeepLink.editId);
    if (!target) return;

    startEdit(target);
  }, [expenses, editingId, expenseDeepLink.editId]);

  const clearEditDeepLink = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  };

  const updateLedgerFilter = (next: { payerId?: string | null; category?: string | null }) => {
    const filter = {
      payerId: next.payerId ?? null,
      category: next.category ?? null,
    };
    setLedgerFilter(filter);
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    if (filter.payerId) params.set("payer", filter.payerId);
    else params.delete("payer");
    if (filter.category) params.set("category", filter.category);
    else params.delete("category");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}#expense-ledger`);
    window.setTimeout(() => {
      document.getElementById("expense-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const cancelEdit = () => {
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
    setNewCategoryRecurring(true); setNewCategoryPriority("3"); setNewCategoryAddToBudget(false);
    setAllowMixedFunding(false);
    setEditingId(null);
    setEditHasBankFunding(false);
    clearEditDeepLink();
  };

  const handleQuickCreateCategory = async (form: ReturnType<typeof useExpenseForm>) => {
    const name = newCategoryName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Category name required",
        description: "Give this spending a clear name, such as Transport or Childcare.",
      });
      return;
    }
    if ((categories ?? []).some((category) => category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast({
        variant: "destructive",
        title: "Category already exists",
        description: "Select the existing category from the list instead.",
      });
      return;
    }
    if (getNewExpenseCategoryMode({
      addToBudget: newCategoryAddToBudget,
      canManageCategories,
    }) === "unbudgeted") {
      form.setCategory(name);
      setIsCreatingCategory(false);
      setNewCategoryName("");
      setNewCategoryBudget("");
      setNewCategoryRecurring(true);
      setNewCategoryPriority("3");
      setNewCategoryAddToBudget(false);
      toast({
        title: "Unbudgeted category selected",
        description: `${name} will be recorded without changing the monthly budget.`,
      });
      return;
    }

    const budgetAmount = Number(newCategoryBudget);
    const priority = Number(newCategoryPriority);
    const [expenseYear, expenseMonth] = form.date.split("-").map(Number);
    if (!Number.isInteger(budgetAmount) || budgetAmount < 0) {
      toast({ variant: "destructive", title: "Enter a valid monthly budget", description: "Use a whole number of KES or zero." });
      return;
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      toast({ variant: "destructive", title: "Choose a valid priority", description: "Select a priority from 1 (must-pay) to 5 (flexible)." });
      return;
    }

    try {
      const category = await createCategory.mutateAsync({
        data: {
          name: newCategoryName.trim(),
          budgetAmount,
          priority,
          isRecurring: newCategoryRecurring,
          activeMonth: newCategoryRecurring ? null : expenseMonth,
          activeYear: newCategoryRecurring ? null : expenseYear,
        },
      });
      form.setCategory(category.name);
      setIsCreatingCategory(false);
      setNewCategoryName("");
      setNewCategoryBudget("");
      setNewCategoryRecurring(true);
      setNewCategoryPriority("3");
      setNewCategoryAddToBudget(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["budget-categories-full"] }),
      ]);
      toast({ title: "Category created", description: `${category.name} is ready to use.` });
    } catch (error) {
      const duplicate = error instanceof ApiError && error.status === 409;
      toast({
        variant: "destructive",
        title: duplicate ? "Category name already used" : "Could not create category",
        description: duplicate
          ? "Choose a different name or select the existing category from the list."
          : "Check the category details and try again.",
      });
    }
  };

  const chooseCategory = (form: ReturnType<typeof useExpenseForm>, value: string) => {
    form.setCategory(value);
    if (value.trim().toLocaleLowerCase() !== "other") setSaveOtherAsCategory(false);
    setIsCreatingCategory(false);
  };

  const addOneOffCategory = (form: ReturnType<typeof useExpenseForm>) => {
    if (form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")) {
      return;
    }
    if (!form.category.trim()) {
      form.setCategory("Other");
    }
    form.setCategoryAllocations((current) => {
      if (current.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")) {
        return current;
      }
      if (!current[0]?.category.trim()) {
        return current.map((allocation, index) => index === 0 ? { ...allocation, category: "Other" } : allocation);
      }
      return [...current, { category: "Other", amount: "" }];
    });
    setIsCreatingCategory(false);
  };

  const openRecurringBudgetSetup = (form: ReturnType<typeof useExpenseForm>, mode: "add" | "edit", makeRecurring = true, proposedCategory?: string) => {
    if (mode !== "add") {
      form.setIsRecurring(true);
      const selected = (categories ?? []).find((item) => item.name === form.category);
      form.setRecurringMonthlyBudget(selected?.budgetAmount ? String(selected.budgetAmount) : form.amount);
      return;
    }

    if (!form.category.trim() && !proposedCategory?.trim()) {
      toast({
        variant: "destructive",
        title: "Choose a category first",
        description: "A recurring expense needs a category before Jamvi can set its average monthly budget.",
      });
      return;
    }
    if (form.category.trim().toLocaleLowerCase() === "other" && !form.description.trim()) {
      toast({
        variant: "destructive",
        title: "Describe this expense first",
        description: "Jamvi will use the description as the recurring budget category name.",
      });
      return;
    }

    try {
      sessionStorage.setItem(RECURRING_EXPENSE_DRAFT_KEY, JSON.stringify({
        amount: form.amount,
        categoryAllocations: form.categoryAllocations,
        description: form.description,
        notes: form.notes,
        paidById: form.paidById,
        payerIds: form.payerIds,
        payerAmounts: form.payerAmounts,
        payerIncomeSourceIds: form.payerIncomeSourceIds,
        incomeSourceId: form.incomeSourceId,
        otherIncomeSourceLabel: form.otherIncomeSourceLabel,
        paidFromBank: form.paidFromBank,
        accountId: form.accountId,
        date: form.date,
        saveOtherAsCategory: form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other"),
        isRecurring: makeRecurring,
        recurringMonthlyBudget: form.recurringMonthlyBudget,
      }));
    } catch {
      toast({
        variant: "destructive",
        title: "Could not open Budget",
        description: "Your expense could not be kept while opening the monthly budget setup.",
      });
      return;
    }

    const category = proposedCategory?.trim() || (form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")
      ? form.description.trim()
      : form.category.trim());
    const url = `${appPath("/budget", import.meta.env.BASE_URL)}?recurringSetup=1&categorySetup=${makeRecurring ? "recurring" : "other"}&category=${encodeURIComponent(category)}&expenseAmount=${encodeURIComponent(form.amount)}`;
    window.location.assign(url);
  };

  const handleAddBankAccount = async (form: ReturnType<typeof useExpenseForm>) => {
    const name = newBankAccountName.trim();
    const accountNumber = newBankAccountNumber.trim();
    const openingBalance = Number(newBankOpeningBalance || 0);
    if (!name) {
      toast({ variant: "destructive", title: "Account name required", description: "Enter a name for this bank account." });
      return;
    }
    try {
      if (!Number.isInteger(openingBalance) || openingBalance < 0) throw new Error("Opening balance must be zero or more whole shillings.");
      const created = await createBankAccount.mutateAsync({ data: { name, accountNumber: accountNumber || undefined, openingBalance } });
      form.setAccountId(created.id);
      setNewBankAccountName("");
      setNewBankAccountNumber("");
      setNewBankOpeningBalance("");
      setIsAddingBankAccount(false);
      await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      toast({ title: "Bank account added", description: `${created.name} is selected for this expense.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not add bank account",
        description: error instanceof Error ? error.message : "Check the account name and try again.",
      });
    }
  };

  const handleAddNewSource = async (paidById: string) => {
    if (!newSourceName.trim()) {
      toast({
        variant: "destructive",
        title: "Source name required",
        description: "Enter a name before adding the income source.",
      });
      return;
    }
    try {
      const res = await fetch("/api/income-sources", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: paidById, name: newSourceName.trim(), isMain: false }),
      });
      if (res.ok) {
        const src: IncomeSource = await res.json();
        addForm.setIncomeSourceId(src.id);
        addForm.setPayerIncomeSourceIds(prev => ({ ...prev, [paidById]: src.id }));
        if (addForm.payerIds.length === 1 && !addDirectSourceIds.includes(src.id)) {
           const key = String(src.id);
           setAddDirectSourceAmounts((previous) => ({ ...previous, [key]: "" }));
          setAddDirectSourceIds((previous) => [...previous, src.id]);
        }
        setNewSourceName("");
        setAddNewSource(false);
        refetchAddSources();
        toast({ title: "Income source added" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not add income source." });
    }
  };

  const handleCreate = async (e: React.FormEvent, saveWithoutCategory = false) => {
    e.preventDefault();
    const payerIds = addForm.payerIds.length > 0
      ? addForm.payerIds
      : (memberPayerId ? [memberPayerId] : []);
    const directSourceIds = payerIds.length === 1 ? addDirectSourceIds : [];
    const sourceCount = (directSourceIds.length || payerIds.length) + (addForm.paidFromBank ? 1 : 0);
    const isSplitPayment = sourceCount > 1;
    const effectivePaidById = payerIds[0] ?? addForm.paidById;
    if (!addForm.amount) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Use an expense amount greater than zero before saving.",
      });
      return;
    }
    const amount = Number(addForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Use an expense amount greater than zero before saving.",
      });
      return;
    }
    if (!Number.isInteger(amount)) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Expenses are recorded in whole shillings.",
      });
      return;
    }
    const categoryAllocations = addForm.categoryAllocations.map((allocation) => ({
      category: allocation.category.trim(), amount: Number(allocation.amount),
    }));
    const hasCategoryAllocation = categoryAllocations.some((allocation) => allocation.category);
    const allocationTotal = categoryAllocations.reduce((total, allocation) => total + allocation.amount, 0);
    if (hasCategoryAllocation && (categoryAllocations.some((allocation) => !allocation.category || !Number.isInteger(allocation.amount) || allocation.amount <= 0) ||
      new Set(categoryAllocations.map((allocation) => allocation.category.toLocaleLowerCase())).size !== categoryAllocations.length ||
      allocationTotal !== amount)) {
      toast({ variant: "destructive", title: "Category allocations don't add up", description: "Choose distinct categories with positive whole-KES amounts that total the expense." });
      return;
    }
    if (
      categoryAllocations.some((allocation) => allocation.category.toLocaleLowerCase() === "other") &&
      addForm.notes.trim().length < 3
    ) {
      toast({
        variant: "destructive",
        title: "Note required",
        description: "Add a note explaining what this Other expense was for.",
      });
      return;
    }
    if (!addForm.description || !addForm.date) {
      toast({
        variant: "destructive",
        title: "Complete the expense details",
        description: "Add an amount, description, and date before saving.",
      });
      return;
    }
    if (!hasCategoryAllocation && !saveWithoutCategory) {
      setUncategorizedSaveOpen(true);
      return;
    }
    if (!effectivePaidById && !addForm.paidFromBank) {
      toast({
        variant: "destructive",
        title: "Choose who paid",
        description: "Select a payer before saving this expense.",
      });
      return;
    }
    if (addForm.paidFromBank && !addForm.accountId) {
      toast({
        variant: "destructive",
        title: "Choose a bank account",
        description: "Select the account whose recorded deposits funded the bank portion.",
      });
      return;
    }
    if (payerIds.length > 0 && directSourceIds.length === 0) {
      const missingSource = hasMissingPersonalFundingSource({
        payerIds,
        isSplitPayment,
        incomeSourceId: addForm.incomeSourceId,
        payerIncomeSourceIds: addForm.payerIncomeSourceIds,
      });
      if (missingSource) {
        toast({
          variant: "destructive",
          title: "Income source required",
          description: "Choose the saved income stream that funded every direct-payment portion.",
        });
        return;
      }
    }
    if (sourceCount === 1) {
      const sourceAmount = Number(
        addForm.paidFromBank
          ? addForm.payerAmounts.__joint_bank__
          : directSourceIds.length === 1
            ? addDirectSourceAmounts[String(directSourceIds[0])]
            : addForm.payerAmounts[payerIds[0]],
      );
      if (!Number.isInteger(sourceAmount) || sourceAmount <= 0) {
        toast({
          variant: "destructive",
          title: "Enter the funding amount",
          description: "Enter how much came from the selected funding source.",
        });
        return;
      }
      if (sourceAmount !== amount) {
        const remaining = amount - sourceAmount;
        toast({
          variant: "destructive",
          title: remaining > 0 ? "Add another funding source" : "Funding exceeds the expense",
          description: remaining > 0
            ? `${formatKes(remaining)} is still unfunded. Select another payer or add a bank-account portion.`
            : `Reduce the funding amount by ${formatKes(Math.abs(remaining))}.`,
        });
        return;
      }
    }
    if (isSplitPayment) {
      const total = amount;
      if (
        (directSourceIds.length > 0
          ? directSourceIds.some((id) => Number(addDirectSourceAmounts[String(id)] || 0) <= 0)
          : payerIds.some((id) => Number(addForm.payerAmounts[id] || 0) <= 0)) ||
        (addForm.paidFromBank && Number(addForm.payerAmounts.__joint_bank__ || 0) <= 0)
      ) {
        toast({
          variant: "destructive",
          title: "Enter every funding portion",
          description: "Each direct-payment and bank-deposit portion must be greater than zero.",
        });
        return;
      }
      const splitTotal = (directSourceIds.length > 0
        ? directSourceIds.reduce((sum, id) => sum + Number(addDirectSourceAmounts[String(id)] || 0), 0)
        : payerIds.reduce((s, id) => s + Number(addForm.payerAmounts[id] || 0), 0))
        + (addForm.paidFromBank ? Number(addForm.payerAmounts.__joint_bank__ || 0) : 0);
      if (!Number.isInteger(total) || splitTotal !== total) {
        toast({ variant: "destructive", title: "Amounts don't add up", description: `Portions total ${splitTotal} but expense is ${total}.` });
        return;
      }
    }
    let expenseCategory = categoryAllocations[0]?.category ?? addForm.category;
    let normalizedOtherCategory: string | null = null;
    const recurringBudget = Number(addForm.recurringMonthlyBudget);
    if (addForm.isRecurring && (!Number.isInteger(recurringBudget) || recurringBudget <= 0)) {
      toast({ variant: "destructive", title: "Monthly budget required", description: "Enter a whole KES amount greater than zero for this recurring expense." });
      return;
    }
    if (addForm.isRecurring && categoryAllocations.length > 1) {
      toast({ variant: "destructive", title: "Recurring split expenses are not supported", description: "A recurring expense needs one category so Jamvi can update the correct monthly budget." });
      return;
    }
    if (addForm.isRecurring && addForm.category.trim().toLocaleLowerCase() === "other" && !saveOtherAsCategory) {
      toast({ variant: "destructive", title: "Save this recurring expense as a category", description: "Use the brief description as a category so its monthly budget can be tracked." });
      return;
    }
    if (categoryAllocations.some((allocation) => allocation.category.toLocaleLowerCase() === "other") && saveOtherAsCategory && !(categories ?? []).some(
      (item) => item.name.trim().toLocaleLowerCase() === addForm.description.trim().toLocaleLowerCase(),
    )) {
      openRecurringBudgetSetup(addForm, "add", false);
      return;
    }
    try {
      if (categoryAllocations.some((allocation) => allocation.category.toLocaleLowerCase() === "other") && saveOtherAsCategory) {
        const existingCategory = (categories ?? []).find(
          (item) => item.name.trim().toLocaleLowerCase() === addForm.description.trim().toLocaleLowerCase(),
        );
        if (existingCategory) {
          normalizedOtherCategory = existingCategory.name;
          expenseCategory = categoryAllocations[0]?.category.toLocaleLowerCase() === "other"
            ? existingCategory.name
            : categoryAllocations[0]?.category ?? addForm.category;
        }
      }
      if (addForm.isRecurring) {
        const recurringCategory = (categories ?? []).find((item) => item.name.toLocaleLowerCase() === expenseCategory.toLocaleLowerCase());
        if (recurringCategory) {
          await updateCategory.mutateAsync({ id: recurringCategory.id, data: { budgetAmount: recurringBudget, isRecurring: true, activeMonth: null, activeYear: null } });
        }
      }
      const incomeSplits = isSplitPayment
        ? [
          ...(addForm.paidFromBank ? [{
            amount: Number(addForm.payerAmounts.__joint_bank__ || 0),
            fromBank: true,
            userId: null,
            label: bankAccounts.find((account) => account.id === addForm.accountId)?.name ?? "Bank account",
            accountId: addForm.accountId!,
          }] : []),
          ...(directSourceIds.length > 0
            ? directSourceIds.map((incomeSourceId) => ({
              userId: effectivePaidById,
              amount: Number(addDirectSourceAmounts[String(incomeSourceId)] || 0),
              fromBank: false,
              label: addFormSources?.find((source) => source.id === incomeSourceId)?.name ?? "Personal funds",
              incomeSourceId,
            }))
            : payerIds.map((userId) => ({
              userId, amount: Number(addForm.payerAmounts[userId] || 0), fromBank: false,
              label: (members ?? []).find((member) => member.userId === userId)?.userName?.split(" ")[0] ?? "Member",
              incomeSourceId: addForm.payerIncomeSourceIds[userId]!,
            }))),
        ]
        : undefined;
      await createExpense.mutateAsync({
        data: {
            amount, category: hasCategoryAllocation ? expenseCategory : "", ...(hasCategoryAllocation ? { categoryAllocations: categoryAllocations.map((allocation) =>
             allocation.category.toLocaleLowerCase() === "other"
               ? { ...allocation, category: normalizedOtherCategory ?? allocation.category }
               : allocation,
            ) } : {}),
          description: addForm.description, notes: addForm.notes || undefined,
          paidById: addForm.paidFromBank && !effectivePaidById ? null : (effectivePaidById || undefined),
          isRecurring: addForm.isRecurring, date: addForm.date, paidFromBank: addForm.paidFromBank && !isSplitPayment,
          ...(addForm.paidFromBank ? { accountId: addForm.accountId! } : {}),
          ...((directSourceIds[0] ?? addForm.incomeSourceId) && !isSplitPayment
            ? { incomeSourceId: directSourceIds[0] ?? addForm.incomeSourceId! }
            : {}),
          ...(incomeSplits ? { incomeSplits } : {}),
        } as Parameters<typeof createExpense.mutateAsync>[0]["data"],
      });
      toast({ title: "Expense recorded" });
      resetAdd();
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to record expense." });
    }
  };

  const handleUpdate = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    if (!editForm.amount) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Use an expense amount greater than zero before saving.",
      });
      return;
    }
    const amount = Number(editForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid amount",
        description: "Use an expense amount greater than zero before saving.",
      });
      return;
    }
    const recurringBudget = Number(editForm.recurringMonthlyBudget);
    if (editForm.isRecurring && (!Number.isInteger(recurringBudget) || recurringBudget <= 0)) {
      toast({ variant: "destructive", title: "Monthly budget required", description: "Enter a whole KES amount greater than zero for this recurring expense." });
      return;
    }
    if (!Number.isInteger(amount)) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Expenses are recorded in whole shillings.",
      });
      return;
    }
    const categoryAllocations = editForm.categoryAllocations.map((allocation) => ({
      category: allocation.category.trim(), amount: Number(allocation.amount),
    }));
    const hasCategoryAllocation = categoryAllocations.some((allocation) => allocation.category);
    const allocationTotal = categoryAllocations.reduce((total, allocation) => total + allocation.amount, 0);
    if (hasCategoryAllocation && (categoryAllocations.some((allocation) => !allocation.category || !Number.isInteger(allocation.amount) || allocation.amount <= 0) ||
      new Set(categoryAllocations.map((allocation) => allocation.category.toLocaleLowerCase())).size !== categoryAllocations.length ||
      allocationTotal !== amount)) {
      toast({ variant: "destructive", title: "Category allocations don't add up", description: "Choose distinct categories with positive whole-KES amounts that total the expense." });
      return;
    }
    if (
      categoryAllocations.some((allocation) => allocation.category.toLocaleLowerCase() === "other") &&
      editForm.notes.trim().length < 3
    ) {
      toast({
        variant: "destructive",
        title: "Note required",
        description: "Add a note explaining what this Other expense was for.",
      });
      return;
    }
    if (!editForm.description || !editForm.date) {
      toast({
        variant: "destructive",
        title: "Complete the expense details",
        description: "Add an amount, description, and date before saving.",
      });
      return;
    }
    if (editForm.isRecurring && categoryAllocations.length > 1) {
      toast({ variant: "destructive", title: "Recurring split expenses are not supported", description: "A recurring expense needs one category so Jamvi can update the correct monthly budget." });
      return;
    }
    if (!editForm.paidById && !editForm.paidFromBank) {
      toast({
        variant: "destructive",
        title: "Choose who paid",
        description: isPersonalBudget
          ? "Choose how this Personal expense was funded."
          : "Select a payer or Shared bank before saving this expense.",
      });
      return;
    }
    if ((editForm.paidFromBank || editHasBankFunding) && !editForm.accountId) {
      toast({
        variant: "destructive",
        title: "Choose a bank account",
        description: "Select the account that funded this Joint-bank expense.",
      });
      return;
    }
    if (!editForm.paidFromBank && !editHasMultipleFundingSplits && !editForm.incomeSourceId) {
      toast({
        variant: "destructive",
        title: "Income source required",
        description: "Choose a saved income source before saving this personal expense.",
      });
      return;
    }
    const selectedSource = editFormSources?.find((source) => source.id === editForm.incomeSourceId);
    const fundingSplits = editForm.paidFromBank
      ? [{
        userId: null,
        label: bankAccounts.find((account) => account.id === editForm.accountId)?.name ?? "Bank account",
        amount,
        fromBank: true,
        accountId: editForm.accountId!,
      }]
      : !editHasMultipleFundingSplits && editForm.incomeSourceId
        ? [{
          userId: editForm.paidById,
          label: selectedSource?.name || "Household member",
          amount,
          fromBank: false,
          incomeSourceId: editForm.incomeSourceId,
        }]
        : undefined;
    try {
      if (editForm.isRecurring) {
        const recurringCategory = (categories ?? []).find((item) => item.name.toLocaleLowerCase() === editForm.category.toLocaleLowerCase());
        if (!recurringCategory) {
          toast({ variant: "destructive", title: "Budget category required", description: "Choose a saved category before making this expense recurring." });
          return;
        }
        await updateCategory.mutateAsync({ id: recurringCategory.id, data: { budgetAmount: recurringBudget, isRecurring: true, activeMonth: null, activeYear: null } });
      }
      await updateExpense.mutateAsync({
        id,
        data: {
          amount,
          category: hasCategoryAllocation ? editForm.category : "",
           ...(hasCategoryAllocation ? { categoryAllocations } : {}),
          description: editForm.description,
          notes: editForm.notes || undefined,
          paidById: editForm.paidById || undefined,
          isRecurring: editForm.isRecurring,
          date: editForm.date,
          paidFromBank: editForm.paidFromBank,
          ...(editForm.paidFromBank || editHasBankFunding ? { accountId: editForm.accountId! } : {}),
          ...(!editHasMultipleFundingSplits && editForm.incomeSourceId
            ? { incomeSourceId: editForm.incomeSourceId }
            : {}),
          ...(fundingSplits ? { incomeSplits: fundingSplits } : {}),
        } as Parameters<typeof updateExpense.mutateAsync>[0]["data"]
      });
      toast({ title: "Expense updated" });
      setEditingId(null);
      setEditHasBankFunding(false);
      clearEditDeepLink();
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update expense." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!canManageExpenses) {
      toast({
        variant: "destructive",
        title: "Only admins can delete expenses",
        description: "Ask an admin or owner to remove this expense.",
      });
      return;
    }
    try {
      await deleteExpense.mutateAsync({ id });
      toast({ title: "Expense deleted" });
      setDeleteTarget(null);
      if (editingId === id) {
        setEditingId(null);
        clearEditDeepLink();
      }
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete expense." });
    }
  };

  const handleApplyRecurring = async () => {
    try {
      const result = await applyRecurring.mutateAsync({ data: { month, year } });
      toast({ title: `${result.copied} recurring expense${result.copied === 1 ? "" : "s"} applied` });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not apply recurring expenses." });
    }
  };

  const expenseFormFields = (
    form: ReturnType<typeof useExpenseForm>,
    isPending: boolean,
    onSubmit: (e: React.FormEvent) => void,
    onCancel: () => void,
    title: string,
    submitLabel: string,
    mode: "add" | "edit",
  ) => {
    const expenseTotal = Number(form.amount) || 0;
    const allocatedTotal = form.categoryAllocations.reduce((total, allocation) => total + (Number(allocation.amount) || 0), 0);
    const allocationDifference = expenseTotal - allocatedTotal;
    const directFundingTotal = mode === "edit"
      ? (!editHasMultipleFundingSplits && form.paidById && form.incomeSourceId ? expenseTotal : 0)
       : form.payerIds.length === 1 && addDirectSourceIds.length > 0
         ? addDirectSourceIds.reduce((total, sourceId) => total + (Number(addDirectSourceAmounts[String(sourceId)]) || 0), 0)
         : form.payerIds.reduce((total, payerId) => total + (Number(form.payerAmounts[payerId]) || 0), 0);
    const bankFundingTotal = form.paidFromBank
      ? (Number(form.payerAmounts.__joint_bank__) || (mode === "edit" && !form.payerIds.length ? expenseTotal : 0))
      : 0;
    const fundingTotal = directFundingTotal + bankFundingTotal;
    const categoryStatus = getCategoryAllocationStatus({
      total: expenseTotal,
      allocations: form.categoryAllocations.map((allocation) => ({
        category: allocation.category,
        amount: Number(allocation.amount),
      })),
      formatAmount: formatKes,
    });
    const hasDirectFunding = mode === "add"
      ? !form.paidFromBank || allowMixedFunding
      : !form.paidFromBank;
    const hasDirectPayer = mode === "add"
      ? (isPersonalBudget ? Boolean(memberPayerId) : form.payerIds.length > 0)
      : Boolean(form.paidById);
    const hasDirectIncomeSource = mode === "add"
       ? form.payerIds.length === 1 && addDirectSourceIds.length > 0
         ? true
         : form.payerIds.length > 1
          ? form.payerIds.every((payerId) => Boolean(form.payerIncomeSourceIds[payerId]))
          : Boolean(form.incomeSourceId)
      : Boolean(form.incomeSourceId);
    const fundingStatus = getExpenseFundingStatus({
      total: expenseTotal,
      fundingTotal,
      hasBankFunding: form.paidFromBank,
      hasBankAccount: Boolean(form.accountId),
      hasDirectFunding,
      hasDirectPayer,
      hasDirectIncomeSource,
      formatAmount: formatKes,
    });

    return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-4">
        <h3 className="text-lg sm:text-xl font-bold font-display text-foreground">{title}</h3>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">1. Record the expense</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Enter the total once, then show what it covered and where the money came from.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
          <Input type="number" placeholder="e.g. 5000" value={form.amount} onChange={e => form.setAmount(e.target.value)}
            required min="1" className="h-12 text-lg bg-card" />
        </div>

        <div className="space-y-2 md:col-span-2 rounded-xl border border-border/60 bg-card p-4">
          <div>
            <label className="text-sm font-semibold text-foreground">2. What did this expense cover? <span className="font-normal text-muted-foreground">(optional)</span></label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
               Categories are optional. Leave this blank to save the expense as Uncategorized, outside any budget category.
            </p>
          </div>
           <div className="space-y-2">
            <select
              className="flex h-12 min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors hover:border-primary/45 hover:bg-muted/35 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Expense category"
               value={form.category}
              onChange={e => chooseCategory(form, e.target.value)}
            >
              <option value="">No category</option>
                {categories
                  ?.filter(c => c.name.trim().toLocaleLowerCase() !== "other")
                  .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                 <option value="Other">One-off spending</option>
            </select>
             <Button
               type="button"
               variant={form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") ? "default" : "outline"}
               className="h-12 w-full justify-start border-input text-foreground hover:bg-accent hover:text-accent-foreground sm:w-auto sm:bg-transparent"
               onClick={() => addOneOffCategory(form)}
               aria-label="Select one-off spending category"
               aria-pressed={form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")}
               data-testid={`one-off-spending-category-${mode}`}
             >
               One-off spending
             </Button>
             <p className="text-xs leading-relaxed text-muted-foreground">
               Use One-off spending for a one-time expense that does not fit any listed category. Add a note below so you remember what it was.
             </p>
             {form.category.trim() && (
               <div className="flex flex-col gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
                 <label className="text-sm font-semibold text-foreground">
                   {form.category.trim().toLocaleLowerCase() === "other" ? "One-off spending amount (KES)" : `${form.category} amount (KES)`}
                 </label>
                 <Input
                   type="number"
                   min="1"
                   step="1"
                   value={form.categoryAllocations[0]?.amount ?? ""}
                   onChange={(event) => form.setCategoryAllocations((current) => current.map((item, index) => index === 0 ? { ...item, amount: event.target.value } : item))}
                   aria-label={form.category.trim().toLocaleLowerCase() === "other" ? "KES amount for one-off spending" : "KES amount covered by the primary category"}
                   aria-required="true"
                   required
                   placeholder="Enter KES amount"
                   className="h-12 w-full border-primary/45 bg-card font-semibold sm:w-44"
                 />
               </div>
             )}
          </div>
           {form.categoryAllocations.length === 1 && (
             <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
               <p className="text-xs text-muted-foreground">
                 {form.category.trim() ? "Need to split this expense? Add another category and enter its share." : "Choose a category first, then add another category if this expense covers more than one."}
               </p>
               <Button type="button" size="sm" variant="outline" disabled={!form.category.trim()} onClick={() => form.setCategoryAllocations((current) => [...current, { category: "", amount: "" }])} data-testid={`add-category-allocation-${mode}`}>
                 <Plus className="mr-1 h-3.5 w-3.5" /> Add another category
               </Button>
             </div>
           )}
           {form.category.trim() && form.categoryAllocations.length === 1 && (
             <div
               role="status"
               aria-live="polite"
               data-testid={`category-allocation-total-${mode}`}
               className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                 categoryStatus.tone === "ready"
                   ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                   : categoryStatus.tone === "error"
                     ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                     : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
               }`}
             >
               {categoryStatus.message}
             </div>
           )}
          {form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && (
             <div id={`other-expense-panel-${mode}`} role="tabpanel" className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <label className="text-sm font-semibold text-foreground">Brief description</label>
              <Input
                value={form.description}
                onChange={e => form.setDescription(e.target.value)}
                placeholder="Briefly describe this expense"
                maxLength={120}
                required
                className="h-12 bg-card"
                data-testid="other-brief-description"
              />
              <p className="text-xs text-muted-foreground">
                 Explain what this one-off expense covered. If it repeats, save it as a category so it is easy to budget and find next time.
              </p>
              <div className="space-y-2 pt-1">
                <label className="text-sm font-semibold text-foreground">
                  Notes <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Explain what this one-off expense was for"
                  value={form.notes ?? ""}
                  onChange={e => form.setNotes(e.target.value)}
                  required
                  className="h-12 bg-card"
                  data-testid="other-expense-notes"
                />
              </div>
              {mode === "add" && canManageCategories && (
                <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={saveOtherAsCategory}
                    onChange={(event) => setSaveOtherAsCategory(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="font-semibold">Save as a category if this repeats</span>
                    <span className="mt-0.5 block text-muted-foreground">Your brief description will be used as the category name.</span>
                  </span>
                </label>
              )}
            </div>
          )}
          {!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && isCreatingCategory && (
            <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-foreground">
              <div>
                <p className="text-sm font-semibold text-foreground">Name this expense category</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Emergencies and one-off spending can stay unbudgeted. You can also add the category to the monthly budget.</p>
              </div>
              <Input
                placeholder="e.g. Emergency repair"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                aria-label="New category name"
                className="h-10 border-input bg-card text-foreground placeholder:text-muted-foreground"
              />
              {canManageCategories ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Add this category to the budget?</p>
                    <p className="text-xs text-muted-foreground">
                      {newCategoryAddToBudget ? "Set its budget details below." : "No — record it as unbudgeted spending."}
                    </p>
                  </div>
                  <Switch checked={newCategoryAddToBudget} onCheckedChange={setNewCategoryAddToBudget} aria-label="Add category to budget" />
                </div>
              ) : (
                <p className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
                  This will be recorded without changing the Shared budget. An owner or admin can add it to the budget later.
                </p>
              )}
              {newCategoryAddToBudget && canManageCategories && (
                <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Monthly KES"
                  value={newCategoryBudget}
                  onChange={(event) => setNewCategoryBudget(event.target.value)}
                  aria-label="New category monthly budget in KES"
                  className="h-10 border-input bg-card text-foreground placeholder:text-muted-foreground"
                />
                <label className="space-y-1 text-xs font-semibold text-foreground">
                  Priority
                  <select
                    value={newCategoryPriority}
                    onChange={(event) => setNewCategoryPriority(event.target.value)}
                    aria-label="New category priority"
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                  >
                    <option value="1">1 · Must-pay</option>
                    <option value="2">2 · Important</option>
                    <option value="3">3 · Everyday</option>
                    <option value="4">4 · Lower priority</option>
                    <option value="5">5 · Flexible</option>
                  </select>
                </label>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Recurring</p>
                    <p className="text-xs text-muted-foreground">
                      {newCategoryRecurring
                        ? "Available every month"
                        : `Only for ${formatMonthYear(Number(form.date.slice(5, 7)), Number(form.date.slice(0, 4)))}`}
                    </p>
                  </div>
                  <Switch checked={newCategoryRecurring} onCheckedChange={setNewCategoryRecurring} aria-label="New category recurring" />
             </div>
          </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  className="h-10 w-full sm:w-auto"
                  onClick={() => handleQuickCreateCategory(form)}
                  disabled={createCategory.isPending}
                >
                  {createCategory.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {newCategoryAddToBudget && canManageCategories ? "Add to budget" : "Use without budget"}
                </Button>
                <button
                type="button"
                onClick={() => {
                  form.setCategory("");
                  setIsCreatingCategory(false);
                  setNewCategoryName("");
                  setNewCategoryBudget("");
                  setNewCategoryRecurring(true);
                  setNewCategoryPriority("3");
                  setNewCategoryAddToBudget(false);
                }}
                className="h-10 rounded-md px-3 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
         </div>
          )}
          {form.category && (() => {
            const cat = breakdown?.find(b => b.category === form.category);
            return cat ? (
              <p className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1 sm:block">
                Spent this month: <span className="font-semibold text-foreground">{formatKes(cat.spentAmount)}</span>
                <span className="hidden mx-1 sm:inline">·</span>
                <span className={cat.spentAmount >= cat.budgetAmount ? "text-destructive font-semibold" : ""}>
                  {formatKes(Math.max(0, cat.budgetAmount - cat.spentAmount))} remaining of {formatKes(cat.budgetAmount)}
                </span>
              </p>
            ) : null;
          })()}
            {form.categoryAllocations.length > 1 && (
             <div className="mt-3 space-y-3 rounded-lg border border-primary/35 bg-primary/[0.04] p-3">
               <div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Additional category breakdown</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">Enter the amount for each additional category.</p>
                </div>
             </div>
              {form.categoryAllocations.slice(1).map((allocation, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                     <select
                       value={allocation.category}
                       onChange={(event) => form.setCategoryAllocations((current) => current.map((item, itemIndex) => itemIndex === index + 1 ? { ...item, category: event.target.value } : item))}
                       aria-label={`Additional allocation category ${index + 2}`}
                      className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm"
                    >
                      <option value="" disabled>Select category...</option>
                      {(categories ?? []).filter((item) => item.name.trim().toLocaleLowerCase() !== "other").map((item) =>
                         <option key={item.id} value={item.name} disabled={form.categoryAllocations.some((selected, selectedIndex) => selectedIndex !== index + 1 && selected.category === item.name)}>{item.name}</option>,
                      )}
                    </select>
                     {form.categoryAllocations.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => form.setCategoryAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index + 1))} aria-label={`Remove allocation ${index + 2}`}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      {allocation.category.trim().toLocaleLowerCase() === "other" ? "One-off spending amount (KES)" : `${allocation.category || "Category"} amount (KES)`}
                    </label>
                    <Input type="number" min="1" step="1" value={allocation.amount}
                      onChange={(event) => form.setCategoryAllocations((current) => current.map((item, itemIndex) => itemIndex === index + 1 ? { ...item, amount: event.target.value } : item))}
                       aria-label={allocation.category.trim().toLocaleLowerCase() === "other" ? "KES amount for one-off spending" : `KES amount covered by allocation ${index + 2}`} aria-required="true" required placeholder="Enter KES amount" className="h-10 w-full border-primary/45 bg-card font-semibold sm:w-44" />
                  </div>
               </div>
             ))}
              <p className="text-xs leading-relaxed text-muted-foreground">
                One-off spending is for a one-time expense that does not fit any listed category. Add a note when you use it.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => form.setCategoryAllocations((current) => [...current, { category: "", amount: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add another category
              </Button>
             {(() => {
                return (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid={`category-allocation-total-${mode}`}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      categoryStatus.tone === "ready"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : categoryStatus.tone === "error"
                          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                  >
                    {categoryStatus.message}
                  </div>
                );
              })()}
            </div>
            )}
         </div>

          {!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && (
           <div className="space-y-2 md:col-span-2">
             <label className="text-sm font-semibold text-foreground">Description</label>
             <Input value={form.description}
               onChange={e => form.setDescription(e.target.value)}
               placeholder="e.g. Nathan's Term 2 school fees"
               required className="h-12 bg-card" />
           </div>
         )}

          {!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && (
           <div className="space-y-2 md:col-span-2">
             <label className="text-sm font-semibold text-foreground">
               Notes <span className="font-normal text-muted-foreground">(optional)</span>
             </label>
             <Input
               placeholder="Any extra details..."
               value={form.notes ?? ""}
               onChange={e => form.setNotes(e.target.value)}
               className="h-12 bg-card"
             />
           </div>
         )}

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Date</label>
          <Input
            type="date"
            value={form.date}
            onChange={e => form.setDate(e.target.value)}
            required
            disabled={!canManageExpenses}
            min={canManageExpenses ? undefined : today}
            max={canManageExpenses ? undefined : today}
            aria-describedby={!canManageExpenses ? "member-expense-date-help" : undefined}
            className="h-12 bg-card"
          />
          {!canManageExpenses && (
            <p id="member-expense-date-help" className="text-xs text-muted-foreground">
              Members can record and correct expenses for today only. Ask an admin to backdate.
            </p>
          )}
        </div>

         <div className="md:col-span-2 space-y-4 rounded-xl border border-border/60 bg-card p-4">
           <div>
             <p className="text-sm font-semibold text-foreground">3. How was this expense funded?</p>
             <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
               Choose every source used for this one expense. Enter each portion so the funding total reaches the expense total.
             </p>
           </div>
           {mode === "edit" && editHasMultipleFundingSplits ? (
             <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-foreground" data-testid="expense-funding-summary-edit">
               <span className="font-semibold">Multiple saved funding portions</span>
               <span className="mt-1 block text-xs text-muted-foreground">The existing bank and direct portions will stay unchanged while you edit the expense details.</span>
             </div>
           ) : expenseTotal > 0 && (
             <div
               role="status"
               aria-live="polite"
               data-testid={`expense-funding-summary-${mode}`}
               className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                 fundingStatus.tone === "ready"
                   ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                   : fundingStatus.tone === "error"
                     ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                     : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
               }`}
             >
               {fundingStatus.message}
             </div>
           )}
          <label className="text-sm font-semibold text-foreground">
             {isPersonalBudget ? "Funding sources" : "Who paid?"} <span className="text-destructive">*</span>
            {mode === "add" && canManageExpenses && !isPersonalBudget && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {/* A workspace bank account is unattributed to an individual payer. */}
            {canManageExpenses && (
            <button type="button"
              onClick={() => {
                const nextPaidFromBank = !form.paidFromBank;
                 const directTotal = mode === "add"
                   ? form.payerIds.length === 1 && addDirectSourceIds.length > 0
                     ? addDirectSourceIds.reduce((sum, sourceId) => sum + (Number(addDirectSourceAmounts[String(sourceId)]) || 0), 0)
                     : form.payerIds.reduce((sum, payerId) => sum + (Number(form.payerAmounts[payerId]) || 0), 0)
                   : 0;
                  const hasDirectSelection = mode === "add" && (
                   addDirectSourceIds.length > 0
                   || directTotal > 0
                   || Boolean(form.incomeSourceId)
                 );
                form.setPaidFromBank(nextPaidFromBank);
                form.setIncomeSourceId(null);
                form.setOtherIncomeSourceLabel(null);
                   setAllowMixedFunding(nextPaidFromBank && hasDirectSelection);
                  if (nextPaidFromBank && mode === "add") {
                   const remaining = getFundingRemainder(Number(form.amount), directTotal);
                   if (hasDirectSelection) {
                     form.setPayerAmounts((previous) => ({
                       ...previous,
                       __joint_bank__: directTotal > 0 ? String(remaining) : form.amount,
                     }));
                   } else {
                     form.setPaidById("");
                     form.setPayerIds([]);
                     form.setPayerIncomeSourceIds({});
                     form.setPayerAmounts({ __joint_bank__: form.amount });
                   }
                  } else if (!nextPaidFromBank && mode === "add") {
                    form.setPayerAmounts((previous) => {
                      const next = { ...previous };
                      delete next.__joint_bank__;
                      return next;
                    });
                 } else if (nextPaidFromBank && mode === "edit" && form.payerIds.length === 0) {
                   form.setPaidById("");
                }
              }}
              className={`col-span-2 h-12 rounded-xl border text-base font-semibold transition-colors ${form.paidFromBank ? "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-700" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
            >
              🏦 Bank account
            </button>
            )}
            {!isPersonalBudget && (canManageExpenses ? (members ?? []) : (members ?? []).filter((member) => member.userId === user?.id)).map((m) => {
              const name = m.userName?.split(" ")[0] ?? "Member";
              const isMultiEnabled = mode === "add";
              const selected = isMultiEnabled ? form.payerIds.includes(m.userId) : form.paidById === m.userId;
              return (
                <button
                  key={m.userId} type="button"
                  disabled={getExpenseFundingControlState({
                    paidFromBank: form.paidFromBank,
                    hasPersonalFunding: form.payerIds.length > 0,
                    allowMixedFunding,
                  }).personalPayersDisabled}
                  onClick={() => {
                    form.setIncomeSourceId(null);
                    form.setOtherIncomeSourceLabel(null);
                    if (isMultiEnabled) {
                      if (!selected) {
                         form.setPayerAmounts((previous) => ({
                           ...previous,
                           [m.userId]: "",
                         }));
                      }
                      const next = form.payerIds.includes(m.userId)
                        ? form.payerIds.filter(id => id !== m.userId)
                        : [...form.payerIds, m.userId];
                      form.setPayerIds(next);
                      if (!next.includes(m.userId)) {
                        form.setPayerIncomeSourceIds(prev => {
                          const copy = { ...prev };
                          delete copy[m.userId];
                          return copy;
                        });
                      }
                      // Keep single paidById in sync for income sources
                      form.setPaidById(next.length === 1 ? next[0] : "");
                        if (form.paidFromBank) setAllowMixedFunding(next.length > 0);
                    } else {
                      form.setPaidById(m.userId);
                     if (!form.paidFromBank) form.setPaidFromBank(false);
                    }
                  }}
                  className={`h-12 rounded-xl border text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
                >
                  {name}
                </button>
              );
            })}
         </div>
          {(form.paidFromBank || (mode === "edit" && editHasBankFunding)) && (
            <div className="mt-3 space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Bank account <span className="text-destructive">*</span>
              </label>
              <select
                data-testid={`select-expense-bank-account-${mode}`}
                value={form.accountId?.toString() ?? ""}
                onChange={(event) => form.setAccountId(event.target.value ? Number(event.target.value) : null)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="" disabled>{bankAccounts.length ? "Choose the account used..." : "No bank accounts available"}</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {bankAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">Create a bank account here to continue without leaving this expense.</p>
              )}
              {canManageExpenses && (isAddingBankAccount ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    autoFocus
                    value={newBankAccountName}
                    onChange={(event) => setNewBankAccountName(event.target.value)}
                    placeholder="e.g. M-Pesa wallet or KCB account"
                    className="h-10 bg-card"
                  />
                  <Input value={newBankAccountNumber} onChange={(event) => setNewBankAccountNumber(event.target.value)} placeholder="Account number (optional)" className="h-10 bg-card" />
                  <Input type="number" min="0" step="1" value={newBankOpeningBalance} onChange={(event) => setNewBankOpeningBalance(event.target.value)} placeholder="Opening balance (KES)" className="h-10 bg-card" />
                  <Button type="button" size="sm" className="h-10" onClick={() => void handleAddBankAccount(form)} disabled={createBankAccount.isPending}>
                    {createBankAccount.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add account
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => { setIsAddingBankAccount(false); setNewBankAccountName(""); setNewBankAccountNumber(""); setNewBankOpeningBalance(""); }}>Cancel</Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-10 border-dashed" onClick={() => setIsAddingBankAccount(true)}>
                  + New bank account
                </Button>
              ))}
              {mode === "add" && form.paidFromBank && form.payerIds.length === 0 && (
                <label className="block space-y-1.5 text-sm font-semibold text-foreground">
                  Type the amount from this account to confirm
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.payerAmounts.__joint_bank__ ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      form.setPayerAmounts((previous) => {
                        const next: Record<string, string> = { ...previous, __joint_bank__: value };
                        return next;
                      });
                    }}
                    placeholder="KES 0"
                    className="h-10 bg-card"
                    required
                  />
                  <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                    Enter this manually to confirm how much should reduce the selected account.
                  </span>
                </label>
              )}
              {(() => {
                const bankAmount = Number(form.payerAmounts.__joint_bank__ || 0);
                const originalExpense = mode === "edit"
                  ? expenses?.find((expense) => expense.id === editingId)
                  : undefined;
                const originalBankAmount = originalExpense?.incomeSplits?.find((split) => split.fromBank)?.amount
                  ?? (originalExpense?.paidFromBank ? originalExpense.amount : 0);
                const projected = activeExpenseBankAccount && bankAmount > 0
                  ? activeExpenseBankAccount.balance + originalBankAmount - bankAmount
                  : null;
                return projected !== null && projected < 0 ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid={`expense-negative-bank-warning-${mode}`}>
                    <span className="flex items-center gap-1.5 font-semibold"><Flag className="h-3.5 w-3.5 fill-current" /> This will take the account below zero.</span>{" "}
                    Projected closing balance: {formatKes(projected)}. Jamvi will still save the expense.
                  </div>
                ) : null;
              })()}
              <p className="text-xs leading-relaxed text-muted-foreground">
                This uses money already recorded in the selected account as an opening balance or deposit.
              </p>
             </div>
           )}
          {form.paidFromBank && (
            <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <p>
                {allowMixedFunding
                  ? "Only the bank portion reduces the selected bank-account balance."
                  : "This expense reduces the selected bank-account balance. Direct payer and income-source fields are not needed."}
              </p>
              {!allowMixedFunding && canManageExpenses && (
                <button
                  type="button"
                  className="mt-2 font-semibold underline underline-offset-2"
                  onClick={() => {
                    setAllowMixedFunding(true);
                    if (isPersonalBudget && user?.id) {
                      form.setPayerIds([user.id]);
                      form.setPaidById(user.id);
                    }
                  }}
                >
                  Add another funding source
                </button>
              )}
              {allowMixedFunding && (
                <p className="mt-2">
                  {isPersonalBudget ? "Choose your income source below." : "Choose one or more people above."}
                </p>
              )}
            </div>
          )}
          {mode === "add" && form.payerIds.length === 0 && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">
              {isPersonalBudget ? "Choose an income source below." : canManageExpenses ? "Choose who paid, or select a bank account." : "Choose yourself to record this expense."}
            </p>
          )}
          {mode === "edit" && !form.paidById && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">Choose who paid before saving.</p>
          )}

           {/* Per-source split rows. A workspace bank account can be combined with direct funding. */}
           {mode === "add" && form.payerIds.length + (form.paidFromBank ? 1 : 0) > 1 && (() => {
            const total = Number(form.amount) || 0;
             const splitTotal = form.payerIds.reduce((s, id) => s + Number(form.payerAmounts[id] || 0), 0)
               + (form.paidFromBank ? Number(form.payerAmounts.__joint_bank__ || 0) : 0);
            const diff = total - splitTotal;
            return (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Enter the amount from each selected source manually{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ""}:
                </p>
                 {form.paidFromBank && (
                   <div className="flex items-center gap-3">
                     <span className="text-sm font-semibold w-20 shrink-0">
                       {bankAccounts.find((account) => account.id === form.accountId)?.name ?? "Bank account"}
                     </span>
                     <input type="number" placeholder="0" min="0" step="1"
                       value={form.payerAmounts.__joint_bank__ ?? ""}
                         onChange={e => form.setPayerAmounts((previous) => ({
                           ...previous,
                           __joint_bank__: e.target.value,
                         }))}
                        required
                       className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                   </div>
                 )}
                 {form.payerIds.map(pid => {
                  const member = (members ?? []).find(m => m.userId === pid);
                  const name = member?.userName?.split(" ")[0] ?? "Member";
                   const sources = addPayerSources[pid] ?? [];
                  return (
                     <div key={pid} className="space-y-2 rounded-lg border border-border/60 p-2.5">
                       <div className="flex items-center gap-3">
                         <span className="text-sm font-semibold w-20 shrink-0">{name}</span>
                         <input
                           type="number"
                           placeholder="KES 0"
                           min="0"
                           step="1"
                           value={form.payerAmounts[pid] ?? ""}
                           onChange={e => {
                             const value = e.target.value;
                             form.setPayerAmounts((previous) => {
                               const next = { ...previous, [pid]: value };
                               return next;
                             });
                           }}
                            required
                           className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                         />
                       </div>
                       <select
                         value={form.payerIncomeSourceIds[pid]?.toString() ?? ""}
                         onChange={(event) => form.setPayerIncomeSourceIds(prev => ({
                           ...prev,
                           [pid]: event.target.value ? Number(event.target.value) : null,
                         }))}
                         className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                         aria-label={`Income source for ${name}`}
                       >
                         <option value="" disabled>Select {name}'s income source...</option>
                         {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                       </select>
                       {sources.length === 0 && (
                         <p className="text-xs text-amber-600 dark:text-amber-400">
                           {name} needs a saved income source before this portion can be recorded.
                         </p>
                       )}
                    </div>
                  );
                })}
                {Math.abs(diff) >= 1 && (
                  <p className={`text-xs font-medium ${diff > 0 ? "text-amber-500" : "text-destructive"}`}>
                    {diff > 0 ? `KES ${diff.toLocaleString()} still unassigned` : `Over by KES ${Math.abs(diff).toLocaleString()}`}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

          {/* Financed by — only shown inside the paid-directly path */}
         {getExpenseFundingControlState({
           paidFromBank: form.paidFromBank,
           hasPersonalFunding: mode === "add" ? form.payerIds.length === 1 : !!form.paidById,
           allowMixedFunding,
         }).showPersonalIncomeSources && (
           <div className="md:col-span-2 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
             <div>
               <p className="text-sm font-semibold text-foreground">Paid directly</p>
               <p className="mt-1 text-xs text-muted-foreground">This expense does not reduce a bank-account balance.</p>
             </div>
             <label className="text-sm font-semibold text-foreground">
               Financed by <span className="text-destructive">*</span>
             </label>
            <select
              disabled={mode === "edit" && editHasMultipleFundingSplits}
              className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
               value={mode === "add" && isPersonalBudget ? "" : (form.otherIncomeSourceLabel !== null ? "legacy" : (form.incomeSourceId?.toString() ?? ""))}
              onChange={e => {
                const value = e.target.value;
                 const sourceId = value ? Number(value) : null;
                 form.setIncomeSourceId(sourceId);
                form.setOtherIncomeSourceLabel(null);
                  if (mode === "add" && form.payerIds.length === 1 && sourceId && !addDirectSourceIds.includes(sourceId)) {
                   const key = String(sourceId);
                     setAddDirectSourceAmounts((previous) => ({ ...previous, [key]: "" }));
                   setAddDirectSourceIds((previous) => [...previous, sourceId]);
                 }
                if (mode === "add" && form.payerIds[0]) {
                  form.setPayerIncomeSourceIds(prev => ({
                    ...prev,
                    [form.payerIds[0]]: value ? Number(value) : null,
                  }));
                }
              }}
              required
            >
               <option value="" disabled>{mode === "add" && form.payerIds.length === 1 && addDirectSourceIds.length > 0 ? "Add another income source..." : "Select an income source..."}</option>
              {mode === "edit" && form.otherIncomeSourceLabel !== null && (
                <option value="legacy" disabled>
                  Historical source: {form.otherIncomeSourceLabel || "choose a saved source"}
                </option>
              )}
               {(mode === "add" ? addFormSources : editFormSources)?.map(src => (
                 <option key={src.id} value={src.id} disabled={mode === "add" && form.payerIds.length === 1 && addDirectSourceIds.includes(src.id)}>
                    {src.name}{mode === "add" && form.payerIds.length === 1 && addDirectSourceIds.includes(src.id) ? " — added" : ""}
                 </option>
              ))}
            </select>
              {mode === "add" && form.payerIds.length === 1 && addDirectSourceIds.length > 0 && (
                <div className="space-y-2" data-testid="expense-direct-funding-portions">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Enter each portion. Add another income source as many times as needed until the expense is fully funded.
                  </p>
                  {addDirectSourceIds.map((sourceId) => {
                    const source = addFormSources?.find((item) => item.id === sourceId);
                    return (
                      <div key={sourceId} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{source?.name ?? "Income source"}</span>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={addDirectSourceAmounts[String(sourceId)] ?? ""}
                          onChange={(event) => setAddDirectSourceAmounts((previous) => ({
                            ...previous,
                            [String(sourceId)]: event.target.value,
                          }))}
                          placeholder="KES 0"
                          className="h-10 w-36 bg-card"
                          required
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAddDirectSourceIds((previous) => previous.filter((id) => id !== sourceId));
                            setAddDirectSourceAmounts((previous) => {
                              const next = { ...previous };
                              delete next[String(sourceId)];
                              return next;
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                  {(() => {
                    const total = Number(form.amount) || 0;
                    const assigned = addDirectSourceIds.reduce(
                      (sum, sourceId) => sum + (Number(addDirectSourceAmounts[String(sourceId)]) || 0),
                      0,
                    ) + (form.paidFromBank ? Number(form.payerAmounts.__joint_bank__ || 0) : 0);
                    const difference = total - assigned;
                    return total > 0 ? (
                      <div
                        role="status"
                        data-testid="expense-funding-remainder"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          difference > 0
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            : difference < 0
                              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        }`}
                      >
                        {difference > 0
                          ? `${formatKes(difference)} remaining — choose another income source to continue.`
                          : difference < 0
                            ? `Overfunded by ${formatKes(Math.abs(difference))}.`
                            : "Fully funded."}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              {mode === "add" && !isPersonalBudget && form.payerIds.length === 1 && !form.paidFromBank && form.incomeSourceId && (
               <label className="block space-y-1.5 text-sm font-semibold text-foreground">
                  Type the amount from this source to confirm
                 <Input
                   type="number"
                   min="1"
                   step="1"
                   value={form.payerAmounts[form.payerIds[0]] ?? ""}
                   onChange={(event) => form.setPayerAmounts((previous) => ({ ...previous, [form.payerIds[0]]: event.target.value }))}
                   placeholder="KES 0"
                   className="h-10 bg-card"
                    required
                 />
                  <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                   Type the amount from this source to confirm. If it is less, keep adding funding sources until the expense is fully funded.
                  </span>
               </label>
             )}
            {mode === "edit" && editHasMultipleFundingSplits && (
              <p className="text-xs text-muted-foreground">
                This expense has multiple funding portions. They’ll be preserved while you edit the expense details here.
              </p>
            )}
            {mode === "edit" && form.otherIncomeSourceLabel !== null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This historical label is not a saved income source. Choose a saved source before saving.
              </p>
            )}
             {mode === "add" && (
               <div className="flex flex-wrap gap-2 pt-1">
                 {addNewSource ? (
                   <div className="flex items-center gap-1">
                     <Input autoFocus placeholder="Source name" value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
                       className="h-9 text-sm w-36 bg-card" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddNewSource(form.payerIds[0] ?? form.paidById); } }} />
                     <Button type="button" size="sm" className="h-9" onClick={() => handleAddNewSource(form.payerIds[0] ?? form.paidById)}>Add</Button>
                     <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => { setAddNewSource(false); setNewSourceName(""); }}>✕</Button>
                   </div>
                 ) : (
                   <button type="button" onClick={() => setAddNewSource(true)}
                     className="px-3 h-9 rounded-lg text-sm border border-dashed border-input text-muted-foreground hover:bg-muted/50 transition-colors">
                     + New source
                   </button>
                 )}
               </div>
             )}
          </div>
        )}

        {canManageExpenses && (
        <div className="md:col-span-2 flex items-center gap-3 bg-card rounded-xl p-4 border border-border/50">
          <input type="checkbox" id={`isRecurring-${title}`} checked={form.isRecurring} onChange={e => {
            if (!e.target.checked) {
              form.setIsRecurring(false);
              form.setRecurringMonthlyBudget("");
              return;
            }
            if (window.confirm("Make this a recurring expense? Jamvi will take you to Budget to ask for the average monthly amount.")) {
              openRecurringBudgetSetup(form, mode);
              if (form.category.trim().toLocaleLowerCase() === "other") setSaveOtherAsCategory(true);
            }
          }}
            className="w-5 h-5 accent-primary rounded" />
          <div>
            <label htmlFor={`isRecurring-${title}`} className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" /> Recurring expense
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">Mark to get a reminder to apply it next month (rent, fees, salaries…)</p>
          </div>
        </div>
        )}
        {canManageExpenses && form.isRecurring && (
          <label className="md:col-span-2 block space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-foreground">
            Monthly budget (KES) <span className="text-destructive">*</span>
            <Input type="number" min="1" step="1" value={form.recurringMonthlyBudget} onChange={(event) => form.setRecurringMonthlyBudget(event.target.value)} placeholder="e.g. 15000" required className="h-12 bg-card" data-testid="recurring-monthly-budget" />
            <span className="block text-xs font-normal text-muted-foreground">This becomes the recurring monthly budget for the selected category.</span>
          </label>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="h-12 w-full px-6 sm:w-auto">Cancel</Button>
        <Button type="submit" disabled={isPending} className="h-12 w-full px-8 sm:w-auto">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
    );
  };

  return (
    <div className="space-y-5 pb-8 sm:space-y-8 sm:pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track where the money is going.</p>
        </div>
        <div className="flex w-full items-center justify-between gap-1 rounded-xl border border-input bg-card p-1 text-foreground shadow-sm sm:w-auto sm:justify-start">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg text-foreground/70 hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="w-4 h-4 shrink-0 text-primary" />
            <select
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="cursor-pointer border-none bg-transparent font-display text-sm font-semibold text-foreground outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m = d.getMonth() + 1;
                const y = d.getFullYear();
                return (
                  <option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2, '0')}`}>
                    {formatMonthYear(m, y)}
                  </option>
                );
              })}
            </select>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg text-foreground/70 hover:bg-muted hover:text-foreground"
            disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Budget Status */}
      {summary && (
        <Card className="border-none shadow-md overflow-hidden">
          <CardContent className="p-4 space-y-3 sm:p-5 sm:space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget Status — {formatMonthYear(month, year)}</p>

            {/* Expenses vs Budget */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <TrendingDown className="w-4 h-4 text-destructive" /> Expenses
                </span>
                <span className="text-sm font-mono">
                  <span className={summary.totalSpent > summary.totalBudget ? "text-destructive font-bold" : "text-foreground"}>
                    {formatKes(summary.totalSpent)}
                  </span>
                  <span className="text-muted-foreground"> / {formatKes(summary.totalBudget)}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${summary.totalSpent > summary.totalBudget ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (summary.totalSpent / summary.totalBudget) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {summary.totalSpent > summary.totalBudget
                  ? `Over budget by ${formatKes(summary.totalSpent - summary.totalBudget)}`
                  : `${formatKes(summary.remaining)} remaining`}
              </p>
            </div>

            {/* Income vs Target */}
            <div className="space-y-2 pt-1 border-t border-border/40">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingUp className="w-4 h-4 text-success" /> Income
              </span>
              {((summary as any).memberContributions ?? [] as Array<{name: string; contributed: number; target: number | null}>).map(({ name, contributed, target }: {name: string; contributed: number; target: number | null}) => (
                <div key={name} className="space-y-1">
                  <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:justify-between sm:gap-2">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="font-mono">
                      <span className={target != null && contributed >= target ? "font-bold text-success" : "text-foreground"}>{formatKes(contributed)}</span>
                      {target != null && <span className="text-muted-foreground"> / {formatKes(target)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${target != null && contributed >= target ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${Math.min(100, target && target > 0 ? (contributed / target) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Individual ledgers */}
            {members && members.length > 0 && expenses && (
              <div className="space-y-3 pt-1 border-t border-border/40">
                <span className="text-sm font-semibold text-foreground">Individual Ledgers</span>
                {((summary as any).memberContributions ?? [] as Array<{userId: string; name: string; contributed: number; target: number | null}>).map(({ userId, name, contributed, target }: {userId: string; name: string; contributed: number; target: number | null}) => {
                  const myExpenses = expenses.filter(e => e.paidById === userId);
                  const spent = myExpenses.reduce((s, e) => s + e.amount, 0);
                  const net = contributed - spent;
                  const overSpent = spent > contributed;
                  return (
                    <button
                      key={userId}
                      type="button"
                      onClick={() => updateLedgerFilter({ payerId: userId })}
                      className="w-full rounded-xl border border-border/50 bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                      data-testid={`expense-ledger-summary-member-${userId}`}
                    >
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Income</p>
                          <p className={`font-mono text-sm font-bold ${target != null && contributed >= target ? "text-success" : "text-warning"}`}>
                            {formatKes(contributed)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {target == null ? "No target" : `of ${formatKes(target)}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
                          <p className="text-sm font-bold font-mono text-foreground">{formatKes(spent)}</p>
                          <p className="text-xs text-muted-foreground">{myExpenses.length} items</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Net</p>
                          <p className={`font-mono text-sm font-bold ${overSpent ? "text-destructive" : "text-success"}`}>
                            {overSpent ? "-" : "+"}{formatKes(Math.abs(net))}
                          </p>
                          <p className="text-xs text-muted-foreground">{overSpent ? "deficit" : "surplus"}</p>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overSpent ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, contributed > 0 ? (spent / contributed) * 100 : 0)}%` }}
                        />
                      </div>
                      <p className="text-right text-xs font-semibold text-primary">Open this ledger →</p>
                    </button>
                  );
                })}
                {/* Joint / unattributed expenses */}
                {(() => {
                  const jointExpenses = expenses.filter(e => !e.paidByName);
                  if (jointExpenses.length === 0) return null;
                  const jointTotal = jointExpenses.reduce((s, e) => s + e.amount, 0);
                  return (
                    <button
                      type="button"
                      onClick={() => updateLedgerFilter({ payerId: "__joint__" })}
                      className="w-full rounded-xl border border-border/50 bg-muted/20 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="expense-ledger-summary-joint"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Joint / Unattributed</p>
                        <p className="text-sm font-bold font-mono text-foreground">{formatKes(jointTotal)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{jointExpenses.length} item{jointExpenses.length !== 1 ? "s" : ""} recorded without a payer</p>
                      <p className="mt-2 text-right text-xs font-semibold text-primary">Open this ledger →</p>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Category budget vs actual */}
            {breakdown && breakdown.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <span className="text-sm font-semibold text-foreground">By Category</span>
                <div className="space-y-2">
                  {breakdown.map((cat) => {
                    const over = cat.remaining < 0;
                    const pct = Math.min(100, cat.percentUsed);
                    return (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => updateLedgerFilter({ category: cat.category })}
                        className="w-full space-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`expense-ledger-summary-category-${cat.category}`}
                      >
                      <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <span className={`font-medium ${over ? "text-destructive" : "text-foreground"}`}>{cat.category}</span>
                          <span className="font-mono text-muted-foreground">
                            <span className={over ? "text-destructive font-bold" : "text-foreground"}>{formatKes(cat.spentAmount)}</span>
                            {" / "}{formatKes(cat.budgetAmount)}
                            <span className={`ml-1.5 ${over ? "text-destructive" : "text-muted-foreground"}`}>
                              ({over ? `+${cat.percentUsed - 100}%` : `${cat.percentUsed}%`})
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${over ? "bg-destructive" : pct >= 80 ? "bg-amber-400" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-right text-[11px] font-semibold text-primary">Open ledger →</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category hint when form is open */}
            {(isAdding || editingId !== null) && addForm.category && breakdown && (() => {
              const cat = breakdown.find(b => b.category === addForm.category);
              if (!cat) return null;
              const over = cat.remaining < 0;
              return (
                <div className={`rounded-xl px-4 py-3 text-sm border ${over ? "bg-destructive/10 border-destructive/20" : "bg-primary/10 border-primary/20"}`}>
                  <span className="font-semibold">{cat.category}:</span>{" "}
                  {over
                    ? <span className="text-destructive">over budget by {formatKes(Math.abs(cat.remaining))}</span>
                    : <span>{formatKes(cat.remaining)} remaining of {formatKes(cat.budgetAmount)}</span>}
                  {" "}({cat.percentUsed}% used)
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Priority Tier Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">Priority Tiers</h2>
            <p className="text-sm text-muted-foreground mt-0.5">How spending stacks up against priority — essentials first.</p>
          </div>
          {EXPENSE_TIERS.map(({ tier, label, bar, badge, categories }) => {
            const tierCats = breakdown.filter(b => categories.some(c => b.category.toLowerCase() === c.toLowerCase()));
            const budget = tierCats.reduce((s, c) => s + c.budgetAmount, 0);
            const spent = tierCats.reduce((s, c) => s + c.spentAmount, 0);
            const remaining = budget - spent;
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const over = remaining < 0;
            return (
              <Card key={tier} className="border-none shadow-sm overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>T{tier}</span>
                      <span className="font-semibold text-foreground text-sm">{label}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-mono font-bold ${over ? "text-destructive" : "text-foreground"}`}>
                        {formatKes(spent)}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono"> / {formatKes(budget)}</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span className="min-w-0 break-words">{Math.round(pct)}% used · {categories.join(", ")}</span>
                    <span className={over ? "text-destructive font-semibold" : ""}>
                      {over ? `Over by ${formatKes(Math.abs(remaining))}` : `${formatKes(remaining)} left`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {sharedTransactionsLocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Invite one more member before recording shared expenses. You can still manage categories, invitations, and bank activity.
        </div>
      )}
      {/* Recurring banner */}
      {showRecurringBanner && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Repeat className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm font-medium text-foreground">
              {recurringFromPrev.length} recurring expense{recurringFromPrev.length > 1 ? "s" : ""} from last month not yet added this month.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleApplyRecurring} disabled={applyRecurring.isPending || sharedTransactionsLocked} className="shrink-0">
            {applyRecurring.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Apply
          </Button>
        </div>
      )}

      {/* Add expense form */}
      {isAdding ? (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-4 sm:p-6">
            {expenseFormFields(addForm, createExpense.isPending || sharedTransactionsLocked, handleCreate, resetAdd, "Record New Expense", "Save Expense", "add")}
          </CardContent>
        </Card>
      ) : (
        <Button disabled={sharedTransactionsLocked} onClick={() => { setIsAdding(true); setEditingId(null); }} className="h-12 px-6 rounded-xl shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> Record Expense
        </Button>
      )}

      {/* Expense list */}
      {(ledgerFilter.payerId || ledgerFilter.category) && (
        <div id="expense-ledger" className="scroll-mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Filtered expense ledger</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{ledgerFilterLabel}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 text-primary sm:mt-0"
            onClick={() => updateLedgerFilter({})}
          >
            Show all expenses
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !visibleExpenses || visibleExpenses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {ledgerFilter.payerId || ledgerFilter.category
              ? "No expenses match this ledger"
              : `No expenses for ${formatMonthYear(month, year)}`}
          </p>
          <p className="text-sm mt-1">
            {ledgerFilter.payerId || ledgerFilter.category
              ? "Show all expenses or choose another summary."
              : 'Click "Record Expense" to add the first one.'}
          </p>
        </div>
      ) : (
        <Card id={ledgerFilter.payerId || ledgerFilter.category ? undefined : "expense-ledger"} className="scroll-mt-6 border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {visibleExpenses.map((expense) => (
              <div key={expense.id}>
                <div className="p-4 hover:bg-muted/20 transition-colors sm:flex sm:items-start sm:justify-between sm:gap-4 sm:p-5">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">{(expense.category || "Uncategorized").slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{expense.description}</p>
                          {expense.isRecurring && (
                            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                              <Repeat className="w-3 h-3" /> Recurring
                            </span>
                          )}
                        </div>
                        {expense.notes && (
                          <p className="text-sm text-muted-foreground mt-0.5 italic">"{expense.notes}"</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                           <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium" data-testid={`expense-category-${expense.id}`}>{expense.category || "Uncategorized"}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{expense.paidByName ?? `🏦 ${bankAccounts.find((account) => account.id === expense.accountId)?.name ?? "Bank account"}`}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{formatDate(expense.date)}</span>
                        </p>
                         {expense.categoryAllocations && expense.categoryAllocations.length > 1 && (
                           <p className="mt-1 text-xs text-muted-foreground" data-testid={`expense-category-breakdown-${expense.id}`}>
                             Categories: {expense.categoryAllocations.map((allocation) => `${allocation.category}: ${formatKes(allocation.amount)}`).join(" · ")}
                           </p>
                         )}
                        {expense.incomeSplits && expense.incomeSplits.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Funded by {expense.incomeSplits.map((split) =>
                              `${split.fromBank ? (bankAccounts.find((account) => account.id === split.accountId)?.name ?? "Bank account") : split.label}: ${formatKes(split.amount)}`
                            ).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3 sm:mt-0 sm:justify-end sm:border-t-0 sm:pt-0">
                      <p className="font-display font-bold text-lg text-foreground">{formatKes(expense.amount)}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditExpense(expense as Expense) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => startEdit(expense as Expense)}
                          aria-label={`Edit ${expense.description}`}
                        >
                          <Pencil className="mr-1.5 w-4 h-4" /> Edit
                        </Button>
                        )}
                        {canManageExpenses && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 px-3"
                          onClick={() => setDeleteTarget(expense as Expense)}
                          aria-label={`Remove ${expense.description}`}
                        >
                          <Trash2 className="mr-1.5 w-4 h-4" /> Remove
                        </Button>
                        )}
                      </div>
                    </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
            <span className="text-sm text-muted-foreground">{visibleExpenses.length} expense{visibleExpenses.length !== 1 ? "s" : ""}</span>
            <span className="font-display font-bold text-primary">{formatKes(visibleExpenses.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </Card>
      )}
      <Dialog open={editingId !== null} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Edit Expense</DialogTitle>
          {editingId !== null && (() => {
            const expense = expenses?.find((item) => item.id === editingId);
            if (!expense) return null;
            return expenseFormFields(
              editForm,
              updateExpense.isPending,
              (e) => handleUpdate(e, expense.id),
              cancelEdit,
              "Edit Expense",
              "Save Changes",
              "edit",
            );
          })()}
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.description}" and its effect on balances, reports, and activity will be removed. This cannot be undone.`
                : "This expense will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep expense</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteExpense.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void handleDelete(deleteTarget.id);
              }}
            >
              {deleteExpense.isPending ? "Removing…" : "Remove expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={uncategorizedSaveOpen} onOpenChange={setUncategorizedSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save without a category?</AlertDialogTitle>
            <AlertDialogDescription>
              This expense will be recorded but will not count toward a monthly budget category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setUncategorizedSaveOpen(false);
                void handleCreate({ preventDefault() {} } as React.FormEvent, true);
              }}
            >
              Save without category
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setUncategorizedSaveOpen(false);
                openRecurringBudgetSetup(addForm, "add", false, addForm.description);
              }}
            >
              Create a monthly budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
