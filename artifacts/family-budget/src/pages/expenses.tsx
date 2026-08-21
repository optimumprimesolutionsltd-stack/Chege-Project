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
    bar: "bg-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
    categories: ["Medical outpatient", "Medical insurance", "Uniform replenishment"],
  },
  {
    tier: 3, label: "Daily Household",
    bar: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    categories: ["Household supplies", "Kids clothes"],
  },
  {
    tier: 4, label: "Connectivity & Care",
    bar: "bg-blue-400", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
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
  useCreateExpense, useCreateBudgetCategory, useDeleteExpense, useUpdateExpense, useApplyRecurringExpenses,
  useGetDashboardSummary, useGetDashboardCategoryBreakdown,
  getGetExpensesQueryKey, getGetDashboardSummaryQueryKey,
  getGetBudgetCategoriesQueryKey, getGetDashboardCategoryBreakdownQueryKey, getGetDashboardActivityQueryKey,
  type IncomeSource,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate, formatMonthYear } from "@/lib/utils";
import { Trash2, Plus, ArrowLeft, ArrowRight, Loader2, Calendar, RefreshCw, Repeat, Pencil, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Expense = {
  id: number;
  amount: number;
  category: string;
  description: string;
  notes?: string | null;
  paidById: string | null;
  paidByName: string | null;
  incomeSourceId?: number | null;
  paidFromBank?: boolean;
  isRecurring: boolean;
  date: string;
  incomeSplits?: {
    userId?: string | null;
    label?: string;
    amount: number;
    incomeSourceId?: number;
    fromBank: boolean;
  }[];
};

function useExpenseForm(defaults?: Partial<Expense>, now?: Date) {
  const today = now ?? new Date();
  const [amount, setAmount] = useState(defaults?.amount?.toString() ?? "");
  const [category, setCategory] = useState(defaults?.category ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [paidById, setPaidById] = useState(defaults?.paidById ?? "");
  // Multi-payer support (add form only; edit uses single paidById)
  const [payerIds, setPayerIds] = useState<string[]>(defaults?.paidById ? [defaults.paidById] : []);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [otherIncomeSourceLabel, setOtherIncomeSourceLabel] = useState<string | null>(null);
  const [paidFromBank, setPaidFromBank] = useState(false);
  const [isRecurring, setIsRecurring] = useState(defaults?.isRecurring ?? false);
  const [date, setDate] = useState(defaults?.date ?? today.toISOString().split("T")[0]);
  return { amount, setAmount, category, setCategory, description, setDescription, notes, setNotes,
           paidById, setPaidById, payerIds, setPayerIds, payerAmounts, setPayerAmounts,
           incomeSourceId, setIncomeSourceId, otherIncomeSourceLabel, setOtherIncomeSourceLabel,
           paidFromBank, setPaidFromBank, isRecurring, setIsRecurring, date, setDate };
}

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

const EXPENSES_MONTH_KEY = "expenses-month-pref";

function getExpenseDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const month = Number(params.get("month"));
  const year = Number(params.get("year"));
  const editId = Number(params.get("edit"));
  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    year: Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null,
    editId: Number.isInteger(editId) && editId > 0 ? editId : null,
  };
}

export default function Expenses() {
  const now = new Date();
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
  const [editHasMultipleFundingSplits, setEditHasMultipleFundingSplits] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");

  const addForm = useExpenseForm(undefined, now);
  const editForm = useExpenseForm();

  const { data: expenses, isLoading } = useGetExpenses({ month, year });
  const { data: categories } = useGetBudgetCategories();
  const { data: members } = useGetMembers();
  const { data: group } = useGetGroup();
  const sharedTransactionsLocked =
    group?.canRecordSharedTransactions === false && (members?.length ?? 0) < 2;
  const { data: summary } = useGetDashboardSummary({ month, year });
  const { data: breakdown } = useGetDashboardCategoryBreakdown({ month, year });
  const createExpense = useCreateExpense();
  const createCategory = useCreateBudgetCategory();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const applyRecurring = useApplyRecurringExpenses();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManageCategories = members?.some(
    (member) => member.userId === user?.id && (member.role === "owner" || member.role === "admin"),
  ) ?? false;

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
  const { data: addFormSources, refetch: refetchAddSources } = useIncomeSources(addForm.payerIds[0] ?? addForm.paidById);
  const { data: editFormSources } = useIncomeSources(editForm.paidById);

  const resetAdd = () => {
    addForm.setAmount(""); addForm.setCategory(""); addForm.setDescription(""); addForm.setNotes("");
    addForm.setPaidById(""); addForm.setPayerIds([]); addForm.setPayerAmounts({});
    addForm.setIncomeSourceId(null); addForm.setOtherIncomeSourceLabel(null); addForm.setIsRecurring(false);
    addForm.setDate(now.toISOString().split("T")[0]);
    setAddNewSource(false); setNewSourceName("");
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
    setIsAdding(false);
  };

  const startEdit = (expense: Expense) => {
    const personalSplit = expense.incomeSplits?.find((split) => !split.fromBank);
    const allFundingIsBank = expense.incomeSplits?.length
      ? expense.incomeSplits.every((split) => split.fromBank)
      : false;
    const paidFromBank = expense.paidFromBank === true || allFundingIsBank;

    editForm.setAmount(expense.amount.toString());
    editForm.setCategory(expense.category);
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
    setEditHasMultipleFundingSplits((expense.incomeSplits?.length ?? 0) > 1);
    editForm.setIsRecurring(expense.isRecurring);
    editForm.setDate(expense.date);
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
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
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [expenses, editingId, expenseDeepLink.editId]);

  const cancelEdit = () => {
    setIsCreatingCategory(false); setNewCategoryName(""); setNewCategoryBudget("");
    setEditingId(null);
  };

  const handleQuickCreateCategory = async (form: ReturnType<typeof useExpenseForm>) => {
    const budgetAmount = Number(newCategoryBudget);
    if (!newCategoryName.trim() || !Number.isInteger(budgetAmount) || budgetAmount < 0) {
      toast({
        variant: "destructive",
        title: "Add the category name and monthly budget",
        description: "The monthly budget must be a whole number of KES or zero.",
      });
      return;
    }

    try {
      const category = await createCategory.mutateAsync({
        data: {
          name: newCategoryName.trim(),
          budgetAmount,
          priority: 1,
          isRecurring: true,
        },
      });
      form.setCategory(category.name);
      setIsCreatingCategory(false);
      setNewCategoryName("");
      setNewCategoryBudget("");
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      toast({ title: "Category created", description: `${category.name} is ready to use.` });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not create category",
        description: "Check the name and try again. Categories with the same name cannot be duplicated.",
      });
    }
  };

  const handleAddNewSource = async (paidById: string) => {
    if (!newSourceName.trim()) return;
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
        setNewSourceName("");
        setAddNewSource(false);
        refetchAddSources();
        toast({ title: "Income source added" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not add income source." });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const sourceCount = addForm.payerIds.length + (addForm.paidFromBank ? 1 : 0);
    const isSplitPayment = sourceCount > 1;
    const effectivePaidById = addForm.payerIds[0] ?? addForm.paidById;
    if (!addForm.amount || !addForm.category || !addForm.description || !addForm.date) return;
    if (!effectivePaidById && !addForm.paidFromBank) return;
    if (isSplitPayment) {
      const total = Number(addForm.amount);
      const splitTotal = addForm.payerIds.reduce((s, id) => s + Number(addForm.payerAmounts[id] || 0), 0)
        + (addForm.paidFromBank ? Number(addForm.payerAmounts.__joint_bank__ || 0) : 0);
      if (!Number.isInteger(total) || splitTotal !== total) {
        toast({ variant: "destructive", title: "Amounts don't add up", description: `Portions total ${splitTotal} but expense is ${total}.` });
        return;
      }
    }
    try {
      const incomeSplits = isSplitPayment
        ? [
          ...(addForm.paidFromBank ? [{ amount: Number(addForm.payerAmounts.__joint_bank__ || 0), fromBank: true, userId: null, label: "Joint bank" }] : []),
          ...addForm.payerIds.map((userId) => ({
            userId, amount: Number(addForm.payerAmounts[userId] || 0), fromBank: false,
            label: (members ?? []).find((member) => member.userId === userId)?.userName?.split(" ")[0] ?? "Member",
          })),
        ]
        : undefined;
      await createExpense.mutateAsync({
        data: {
          amount: Number(addForm.amount), category: addForm.category,
          description: addForm.description, notes: addForm.notes || undefined,
          paidById: addForm.paidFromBank && !effectivePaidById ? null : (effectivePaidById || undefined),
          isRecurring: addForm.isRecurring, date: addForm.date, paidFromBank: addForm.paidFromBank && !isSplitPayment,
          ...(addForm.incomeSourceId && !isSplitPayment ? { incomeSourceId: addForm.incomeSourceId } : {}),
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
    if (!editForm.amount || !editForm.category || !editForm.description || !editForm.date || (!editForm.paidById && !editForm.paidFromBank)) return;
    if (editForm.otherIncomeSourceLabel !== null && !editForm.otherIncomeSourceLabel.trim()) {
      toast({
        variant: "destructive",
        title: "Source label required",
        description: "Describe the Other source before saving.",
      });
      return;
    }
    const selectedSource = editFormSources?.find((source) => source.id === editForm.incomeSourceId);
    const fundingSplits = editForm.paidFromBank
      ? [{ userId: null, label: "Joint bank", amount: Number(editForm.amount), fromBank: true }]
      : !editHasMultipleFundingSplits && (editForm.incomeSourceId || editForm.otherIncomeSourceLabel !== null)
        ? [{
          userId: editForm.paidById,
          label: editForm.otherIncomeSourceLabel?.trim() || selectedSource?.name || "Household member",
          amount: Number(editForm.amount),
          fromBank: false,
          ...(selectedSource ? { incomeSourceId: selectedSource.id } : {}),
        }]
        : undefined;
    try {
      await updateExpense.mutateAsync({
        id,
        data: {
          amount: Number(editForm.amount),
          category: editForm.category,
          description: editForm.description,
          notes: editForm.notes || undefined,
          paidById: editForm.paidById || undefined,
          isRecurring: editForm.isRecurring,
          date: editForm.date,
          paidFromBank: editForm.paidFromBank,
          ...(!editHasMultipleFundingSplits && editForm.incomeSourceId
            ? { incomeSourceId: editForm.incomeSourceId }
            : {}),
          ...(fundingSplits ? { incomeSplits: fundingSplits } : {}),
        } as Parameters<typeof updateExpense.mutateAsync>[0]["data"]
      });
      toast({ title: "Expense updated" });
      setEditingId(null);
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update expense." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteExpense.mutateAsync({ id });
      toast({ title: "Expense deleted" });
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
  ) => (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <h3 className="text-xl font-bold font-display text-foreground">{title}</h3>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
          <Input type="number" placeholder="e.g. 5000" value={form.amount} onChange={e => form.setAmount(e.target.value)}
            required min="1" className="h-12 text-lg bg-card" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Category</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="flex h-12 min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.category} onChange={e => form.setCategory(e.target.value)} required>
              <option value="" disabled>Select category...</option>
              {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {canManageCategories && (
              <Button
                type="button"
                variant="outline"
                className="h-12 shrink-0"
                onClick={() => setIsCreatingCategory((open) => !open)}
                aria-expanded={isCreatingCategory}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create category
              </Button>
            )}
          </div>
          {isCreatingCategory && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Create a category</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Add its name and monthly budget, then we’ll select it for this expense.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                <Input
                  placeholder="e.g. Transport"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  aria-label="New category name"
                  className="h-10 bg-card"
                />
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Monthly KES"
                  value={newCategoryBudget}
                  onChange={(event) => setNewCategoryBudget(event.target.value)}
                  aria-label="New category monthly budget in KES"
                  className="h-10 bg-card"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-10"
                  onClick={() => handleQuickCreateCategory(form)}
                  disabled={createCategory.isPending}
                >
                  {createCategory.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add category
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingCategory(false);
                  setNewCategoryName("");
                  setNewCategoryBudget("");
                }}
                className="text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
          {form.category && (() => {
            const cat = breakdown?.find(b => b.category === form.category);
            return cat ? (
              <p className="text-xs text-muted-foreground pt-1">
                Spent this month: <span className="font-semibold text-foreground">{formatKes(cat.spentAmount)}</span>
                <span className="mx-1">·</span>
                <span className={cat.spentAmount >= cat.budgetAmount ? "text-destructive font-semibold" : ""}>
                  {formatKes(Math.max(0, cat.budgetAmount - cat.spentAmount))} remaining of {formatKes(cat.budgetAmount)}
                </span>
              </p>
            ) : null;
          })()}
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-foreground">Description</label>
          <Input placeholder="e.g. Nathan's Term 2 school fees" value={form.description}
            onChange={e => form.setDescription(e.target.value)} required className="h-12 bg-card" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input placeholder="Any extra details..." value={form.notes ?? ""}
            onChange={e => form.setNotes(e.target.value)} className="h-12 bg-card" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Date</label>
          <Input type="date" value={form.date} onChange={e => form.setDate(e.target.value)} required className="h-12 bg-card" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Paid by <span className="text-destructive">*</span>
            {mode === "add" && <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {/* Joint bank — unattributed, no individual payer */}
            <button type="button"
              onClick={() => {
                const nextPaidFromBank = !form.paidFromBank;
                form.setPaidFromBank(nextPaidFromBank);
                form.setIncomeSourceId(null);
                form.setOtherIncomeSourceLabel(null);
                if (mode === "edit" && nextPaidFromBank) form.setPaidById("");
              }}
              className={`col-span-2 h-12 rounded-xl border text-base font-semibold transition-colors ${form.paidFromBank ? "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-700" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
            >
              🏦 Joint bank account
            </button>
            {(members ?? []).map((m) => {
              const name = m.userName?.split(" ")[0] ?? "Member";
              const isMultiEnabled = mode === "add";
              const selected = isMultiEnabled ? form.payerIds.includes(m.userId) : form.paidById === m.userId;
              return (
                <button
                  key={m.userId} type="button"
                  onClick={() => {
                    form.setIncomeSourceId(null);
                    form.setOtherIncomeSourceLabel(null);
                    if (isMultiEnabled) {
                      const next = form.payerIds.includes(m.userId)
                        ? form.payerIds.filter(id => id !== m.userId)
                        : [...form.payerIds, m.userId];
                      form.setPayerIds(next);
                      // Keep single paidById in sync for income sources
                      form.setPaidById(next.length === 1 ? next[0] : "");
                    } else {
                      form.setPaidById(m.userId);
                      form.setPaidFromBank(false);
                    }
                  }}
                  className={`h-12 rounded-xl border text-base font-semibold transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {mode === "add" && form.payerIds.length === 0 && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">Choose who paid, or select Joint bank account.</p>
          )}
          {mode === "edit" && !form.paidById && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">Choose who paid before saving.</p>
          )}

           {/* Per-source split rows. Joint bank can be combined with members. */}
           {mode === "add" && form.payerIds.length + (form.paidFromBank ? 1 : 0) > 1 && (() => {
            const total = Number(form.amount) || 0;
             const splitTotal = form.payerIds.reduce((s, id) => s + Number(form.payerAmounts[id] || 0), 0)
               + (form.paidFromBank ? Number(form.payerAmounts.__joint_bank__ || 0) : 0);
            const diff = total - splitTotal;
            return (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Enter how much each person paid{total > 0 ? ` (total: KES ${total.toLocaleString()})` : ""}:
                </p>
                 {form.paidFromBank && (
                   <div className="flex items-center gap-3">
                     <span className="text-sm font-semibold w-20 shrink-0">Joint bank</span>
                     <input type="number" placeholder="0" min="0" step="1"
                       value={form.payerAmounts.__joint_bank__ ?? ""}
                       onChange={e => form.setPayerAmounts(prev => ({ ...prev, __joint_bank__: e.target.value }))}
                       className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                   </div>
                 )}
                 {form.payerIds.map(pid => {
                  const member = (members ?? []).find(m => m.userId === pid);
                  const name = member?.userName?.split(" ")[0] ?? "Member";
                  return (
                    <div key={pid} className="flex items-center gap-3">
                      <span className="text-sm font-semibold w-20 shrink-0">{name}</span>
                      <input
                        type="number"
                        placeholder="0"
                        min="0"
                        value={form.payerAmounts[pid] ?? ""}
                        onChange={e => form.setPayerAmounts(prev => ({ ...prev, [pid]: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
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

        {/* Income source picker — shown when a single named payer is chosen */}
         {!form.paidFromBank && (mode === "add" ? form.payerIds.length === 1 : !!form.paidById) && (
          <div className="md:col-span-2 space-y-2">
            <label className="text-sm font-semibold text-foreground">
              Paid from <span className="font-normal text-muted-foreground">(counts as contribution if personal)</span>
            </label>
            <select
              disabled={mode === "edit" && editHasMultipleFundingSplits}
              className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.otherIncomeSourceLabel !== null ? "other" : (form.incomeSourceId?.toString() ?? "")}
              onChange={e => {
                const value = e.target.value;
                if (value === "other") {
                  form.setIncomeSourceId(null);
                  form.setOtherIncomeSourceLabel("");
                  return;
                }
                form.setIncomeSourceId(value ? Number(value) : null);
                form.setOtherIncomeSourceLabel(null);
              }}
            >
              <option value="">Select an income source...</option>
              {mode === "edit" && <option value="other">Other source...</option>}
              {(mode === "add" ? addFormSources : editFormSources)?.map(src => (
                <option key={src.id} value={src.id}>{src.name}</option>
              ))}
            </select>
            {mode === "edit" && editHasMultipleFundingSplits && (
              <p className="text-xs text-muted-foreground">
                This expense has multiple funding portions. They’ll be preserved while you edit the expense details here.
              </p>
            )}
            {mode === "edit" && form.otherIncomeSourceLabel !== null && (
              <Input
                placeholder="Describe the source (e.g. Consultancy, Parents)"
                value={form.otherIncomeSourceLabel ?? ""}
                onChange={(event) => form.setOtherIncomeSourceLabel(event.target.value)}
                className="h-12 bg-card"
              />
            )}
            {mode === "add" && (
              <div className="flex flex-wrap gap-2">
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

        <div className="md:col-span-2 flex items-center gap-3 bg-card rounded-xl p-4 border border-border/50">
          <input type="checkbox" id={`isRecurring-${title}`} checked={form.isRecurring} onChange={e => form.setIsRecurring(e.target.checked)}
            className="w-5 h-5 accent-primary rounded" />
          <div>
            <label htmlFor={`isRecurring-${title}`} className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" /> Recurring expense
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">Mark to get a reminder to apply it next month (rent, fees, salaries…)</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="h-12 px-6">Cancel</Button>
        <Button type="submit" disabled={isPending} className="h-12 px-8">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track where the money is going.</p>
        </div>
        <div className="flex items-center gap-1 bg-card rounded-xl p-1 border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5 text-foreground/70" />
          </Button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <select
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="font-semibold font-display text-sm text-foreground bg-transparent border-none outline-none cursor-pointer"
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
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg hover:bg-muted"
            disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5 text-foreground/70" />
          </Button>
        </div>
      </div>

      {/* Budget Status */}
      {summary && (
        <Card className="border-none shadow-md overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget Status — {formatMonthYear(month, year)}</p>

            {/* Expenses vs Budget */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
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
                <TrendingUp className="w-4 h-4 text-green-600" /> Income
              </span>
              {((summary as any).memberContributions ?? [] as Array<{name: string; contributed: number; target: number | null}>).map(({ name, contributed, target }: {name: string; contributed: number; target: number | null}) => (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="font-mono">
                      <span className={target != null && contributed >= target ? "text-green-600 font-bold" : "text-foreground"}>{formatKes(contributed)}</span>
                      {target != null && <span className="text-muted-foreground"> / {formatKes(target)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${target != null && contributed >= target ? "bg-green-500" : "bg-amber-400"}`}
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
                {((summary as any).memberContributions ?? [] as Array<{name: string; contributed: number; target: number | null}>).map(({ name, contributed, target }: {name: string; contributed: number; target: number | null}) => {
                  const myExpenses = expenses.filter(e => e.paidByName?.toLowerCase().startsWith(name.toLowerCase()));
                  const spent = myExpenses.reduce((s, e) => s + e.amount, 0);
                  const net = contributed - spent;
                  const overSpent = spent > contributed;
                  return (
                    <div key={name} className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Income</p>
                          <p className={`text-sm font-bold font-mono ${target != null && contributed >= target ? "text-green-600" : "text-amber-500"}`}>
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
                          <p className={`text-sm font-bold font-mono ${overSpent ? "text-destructive" : "text-green-600"}`}>
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
                    </div>
                  );
                })}
                {/* Joint / unattributed expenses */}
                {(() => {
                  const jointExpenses = expenses.filter(e => !e.paidByName);
                  if (jointExpenses.length === 0) return null;
                  const jointTotal = jointExpenses.reduce((s, e) => s + e.amount, 0);
                  return (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Joint / Unattributed</p>
                        <p className="text-sm font-bold font-mono text-foreground">{formatKes(jointTotal)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{jointExpenses.length} item{jointExpenses.length !== 1 ? "s" : ""} recorded without a payer</p>
                    </div>
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
                      <div key={cat.category} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
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
                      </div>
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
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Math.round(pct)}% used · {categories.join(", ")}</span>
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
          <CardContent className="p-6">
            {expenseFormFields(addForm, createExpense.isPending || sharedTransactionsLocked, handleCreate, resetAdd, "Record New Expense", "Save Expense", "add")}
          </CardContent>
        </Card>
      ) : (
        <Button disabled={sharedTransactionsLocked} onClick={() => { setIsAdding(true); setEditingId(null); }} className="h-12 px-6 rounded-xl shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> Record Expense
        </Button>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !expenses || expenses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No expenses for {formatMonthYear(month, year)}</p>
          <p className="text-sm mt-1">Click "Record Expense" to add the first one.</p>
        </div>
      ) : (
        <Card className="border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {expenses.map((expense) => (
              <div key={expense.id}>
                {editingId === expense.id ? (
                  <div className="p-5 bg-accent/20">
                    {expenseFormFields(
                      editForm,
                      updateExpense.isPending,
                      (e) => handleUpdate(e, expense.id),
                      cancelEdit,
                      "Edit Expense",
                      "Save Changes",
                      "edit",
                    )}
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 flex items-start justify-between hover:bg-muted/20 transition-colors gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">{expense.category.slice(0, 2).toUpperCase()}</span>
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
                          <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium">{expense.category}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{expense.paidByName ?? "🏦 Joint bank"}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{formatDate(expense.date)}</span>
                        </p>
                        {expense.incomeSplits && expense.incomeSplits.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Funded by {expense.incomeSplits.map((split) =>
                              `${split.fromBank ? "Joint bank" : split.label}: ${formatKes(split.amount)}`
                            ).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <p className="font-display font-bold text-lg text-foreground mr-2">{formatKes(expense.amount)}</p>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => startEdit(expense as Expense)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                        onClick={() => handleDelete(expense.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-muted/30 border-t border-border/50 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>
            <span className="font-display font-bold text-primary">{formatKes(expenses.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
