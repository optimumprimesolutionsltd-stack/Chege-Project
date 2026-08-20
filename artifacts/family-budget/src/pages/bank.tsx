import { useState } from "react";
import {
  useGetJointAccount, useCreateDeposit, useCreateDisbursement, useUpdateJointAccountTransaction, useDeleteJointAccountTransaction,
  useGetMembers, useGetBudgetCategories, getGetBudgetCategoriesQueryKey,
  useGetSavingsGoals, useTransferBankToSavings, useTransferSavingsToBank,
  getGetJointAccountQueryKey, getGetDashboardSummaryQueryKey, getGetSavingsGoalsQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate } from "@/lib/utils";
import { Trash2, Pencil, ArrowDownLeft, ArrowUpRight, Loader2, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";

// "Joint bank" is represented as null — never implicitly attributed to the signed-in user.
const JOINT_BANK_ID = null as null;

type MemberIncomeSource = {
  id: number;
  name: string;
};

type EditableTransaction = {
  id: number;
  type: string;
  amount: number;
  description: string;
  date: string;
  madeById?: string | null;
  expenseCategory?: string | null;
  savingsGoalId?: number | null;
  savingsGoalName?: string | null;
  transferDirection?: string | null;
  contributorSplits?: { userId: string; amount: number; incomeSourceId?: number | null }[];
};

export default function Bank() {
  const { data: account, isLoading } = useGetJointAccount();
  const { data: members } = useGetMembers();
  const { data: categories } = useGetBudgetCategories();
  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();
  const updateTx = useUpdateJointAccountTransaction();
  const deleteTx = useDeleteJointAccountTransaction();
  const transferToSavings = useTransferBankToSavings();
  const transferFromSavings = useTransferSavingsToBank();
  const { data: savingsGoals = [] } = useGetSavingsGoals();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManageShared = members?.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  ) ?? false;

  const [mode, setMode] = useState<"deposit" | "disbursement" | "transfer" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Deposit attribution — null = Joint bank, string[] = named member IDs
  // Default: Joint bank (empty array = no named depositors selected)
  const [depositorIds, setDepositorIds] = useState<string[]>([]);
  const [depositorAmounts, setDepositorAmounts] = useState<Record<string, string>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [depositSourceKind, setDepositSourceKind] = useState<"income_source" | "other" | null>(null);

  // Withdrawal attribution — null = Joint bank, string = named member ID
  // Default: Joint bank
  const [withdrawerId, setWithdrawerId] = useState<string | null>(JOINT_BANK_ID);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [withdrawalDestinationKind, setWithdrawalDestinationKind] = useState<"category" | "other">("category");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<EditableTransaction | null>(null);
  const [transferDirection, setTransferDirection] = useState<"to_savings" | "from_savings">("to_savings");
  const [transferGoalId, setTransferGoalId] = useState<number | null>(null);

  // Income sources — only fetch when exactly one named depositor is selected
  const singleDepositorId = depositorIds.length === 1 ? depositorIds[0] : null;
  const { data: depositSources = [] } = useQuery<MemberIncomeSource[]>({
    queryKey: ["income-sources", singleDepositorId],
    queryFn: async () => {
      if (!singleDepositorId) return [];
      const res = await fetch(`/api/income-sources?userId=${singleDepositorId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!singleDepositorId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
  };

  const handleCreateCategory = async () => {
    if (!canManageShared) return;
    const name = newCategoryName.trim();
    if (!name) return;

    const existing = categories?.find((category) => category.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setExpenseCategory(existing.name);
      setNewCategoryName("");
      return;
    }

    setAddingCategory(true);
    try {
      const response = await fetch("/api/budget-categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, budgetAmount: 0, priority: 1, color: "#6B7280" }),
      });
      if (!response.ok) throw new Error("Could not create category");
      const category = await response.json();
      setExpenseCategory(category.name);
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      toast({ title: "Category added", description: `${category.name} is ready to use.` });
    } catch {
      toast({ variant: "destructive", title: "Could not add category", description: "Please try again." });
    } finally {
      setAddingCategory(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    // Always reset to Joint bank — never silently attribute to the signed-in user
    setDepositorIds([]);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(JOINT_BANK_ID);
    setExpenseCategory("");
    setWithdrawalDestinationKind("category");
    setTransferDirection("to_savings");
    setTransferGoalId(null);
    setNewCategoryName("");
    setEditingTransaction(null);
    setMode(null);
  };

  const openMode = (m: "deposit" | "disbursement" | "transfer") => {
    if (!canManageShared && m !== "deposit") return;
    // Reset attribution to Joint bank every time a form opens
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setDepositorIds(!canManageShared && user?.id ? [user.id] : []);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(JOINT_BANK_ID);
    setExpenseCategory("");
    setWithdrawalDestinationKind("category");
    setTransferDirection("to_savings");
    setTransferGoalId(null);
    setNewCategoryName("");
    setEditingTransaction(null);
    setMode(m);
  };

  const openEdit = (tx: EditableTransaction) => {
    if (!canManageShared) return;
    if (tx.savingsGoalId) {
      toast({
        title: "Transfer cannot be edited",
        description: "Delete and recreate a savings transfer to keep both balances in sync.",
      });
      return;
    }
    const transactionMode = tx.type === "deposit" ? "deposit" : "disbursement";
    setEditingTransaction(tx);
    setMode(transactionMode);
    setAmount(String(tx.amount));
    setDescription(tx.description);
    setDate(tx.date);
    setDepositorIds(transactionMode === "deposit" && tx.madeById ? [tx.madeById] : []);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(transactionMode === "disbursement" ? tx.madeById ?? null : JOINT_BANK_ID);
    setExpenseCategory(tx.expenseCategory ?? "");
    setWithdrawalDestinationKind(tx.description !== tx.expenseCategory ? "other" : "category");
    setNewCategoryName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || !amount || !date || ((mode === "deposit" || mode === "transfer") && !description.trim())) return;
    if (mode === "disbursement" && !expenseCategory) {
      toast({
        variant: "destructive",
        title: "Category required",
        description: "Choose or add a category before recording this withdrawal.",
      });
      return;
    }
    if (mode === "disbursement" && withdrawalDestinationKind === "other" && !description.trim()) {
      toast({
        variant: "destructive",
        title: "Narration required",
        description: "Explain where the money is going when you choose Other.",
      });
      return;
    }

    const total = Number(amount);
    if (!Number.isInteger(total) || total <= 0) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "Bank transactions are recorded in whole shillings.",
      });
      return;
    }

    const isMultiDepositor = depositorIds.length > 1;

    if (mode === "deposit" && isMultiDepositor) {
      const splitAmounts = depositorIds.map((id) => Number(depositorAmounts[id] || 0));
      if (splitAmounts.some((portion) => !Number.isInteger(portion) || portion <= 0)) {
        toast({
          variant: "destructive",
          title: "Enter every depositor's amount",
          description: "Each portion must be a positive whole-shilling amount.",
        });
        return;
      }
      const splitTotal = splitAmounts.reduce((sum, portion) => sum + portion, 0);
      if (splitTotal !== total) {
        toast({
          variant: "destructive",
          title: "Amounts don't add up",
          description: `Portions total ${splitTotal} but deposit is ${total}.`,
        });
        return;
      }
    }

    try {
      if (mode === "transfer") {
        if (!transferGoalId) {
          toast({
            variant: "destructive",
            title: "Choose a savings goal",
            description: "Select the savings goal for this transfer.",
          });
          return;
        }
        const data = { amount: total, goalId: transferGoalId, narration: description.trim(), date, madeById: null };
        if (transferDirection === "to_savings") {
          await transferToSavings.mutateAsync({ data });
          toast({ title: "Moved to savings" });
        } else {
          await transferFromSavings.mutateAsync({ data });
          toast({ title: "Moved to bank" });
        }
        resetForm();
        invalidate();
        return;
      }
      if (editingTransaction) {
        if (mode === "deposit" && depositorIds.length > 1) {
          toast({ variant: "destructive", title: "Split deposit", description: "Delete and recreate it to preserve each contributor's history." });
          return;
        }
        await updateTx.mutateAsync({
          id: editingTransaction.id,
          data: {
            amount: total,
            description: description.trim() || expenseCategory,
            date,
            madeById: mode === "deposit" ? depositorIds[0] ?? null : withdrawerId,
            ...(mode === "deposit" && depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            ...(mode === "disbursement" ? { expenseCategory, destinationKind: withdrawalDestinationKind } : {}),
          },
        });
        toast({ title: "Transaction updated" });
      } else if (mode === "deposit") {
        if (isMultiDepositor) {
          // One ledger transaction, with visible contributor portions.
          await createDeposit.mutateAsync({
            data: {
              amount: total,
              description,
              date,
              contributorSplits: depositorIds.map((userId) => ({
                userId,
                amount: Number(depositorAmounts[userId] || 0),
              })),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            },
          });
        } else {
          // Single named depositor or Joint bank (null)
          const madeById = depositorIds.length === 1 ? depositorIds[0] : null;
          await createDeposit.mutateAsync({
            data: {
              amount: Number(amount),
              description,
              date,
              madeById,
              ...(madeById && incomeSourceId ? { incomeSourceId } : {}),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            },
          });
        }
        toast({ title: "Deposit recorded" });
      } else {
        await createDisbursement.mutateAsync({
          data: {
            amount: total,
            description: description.trim() || expenseCategory,
            date,
            expenseCategory,
            madeById: withdrawerId,
            destinationKind: withdrawalDestinationKind,
          },
        });
        toast({ title: "Disbursement recorded" });
      }
      resetForm();
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save transaction." });
    }
  };

  const handleDelete = async (id: number) => {
    if (!canManageShared) return;
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTx.mutateAsync({ id });
      toast({ title: "Transaction deleted" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete transaction." });
    }
  };

  const isPending = createDeposit.isPending || createDisbursement.isPending || updateTx.isPending ||
    transferToSavings.isPending || transferFromSavings.isPending || addingCategory;

  // Helpers for attribution labels in transaction list
  const madeByLabel = (madeByName: string | null | undefined, type: string) => {
    if (!madeByName) return "Joint bank";
    return madeByName;
  };

  return (
    <div className="space-y-8 pb-12 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Joint Bank Account</h1>
        <p className="text-muted-foreground mt-1">Track money going in and out of your shared account.</p>
      </div>

       {!canManageShared && (
         <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
           You can add your own contribution to the shared bank. An admin handles withdrawals, transfers, and transaction changes.
         </div>
       )}

      {/* Balance card */}
      <Card className="border-none shadow-md bg-primary text-primary-foreground">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-8 h-8 animate-spin opacity-70" /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Landmark className="w-6 h-6 opacity-80" />
                <p className="text-sm font-medium opacity-80">Running Balance</p>
              </div>
              <p className="text-4xl font-display font-bold" data-testid="bank-balance">{formatKes(account?.balance ?? 0)}</p>
              <div className="flex gap-6 pt-2 border-t border-primary-foreground/20">
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total In</p>
                  <p className="text-lg font-semibold font-mono">{formatKes(account?.totalDeposits ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Total Out</p>
                  <p className="text-lg font-semibold font-mono">{formatKes(account?.totalDisbursements ?? 0)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons / form */}
      {!mode ? (
        <div className={`grid gap-3 ${canManageShared ? "grid-cols-3" : "grid-cols-1"}`}>
          {canManageShared && <Button
            data-testid="button-deposit"
            onClick={() => openMode("deposit")}
            className="h-12 px-6 rounded-xl flex-1"
          >
            <ArrowDownLeft className="w-5 h-5 mr-2" /> Deposit
          </Button>}
          {canManageShared && <Button
            data-testid="button-withdraw"
            onClick={() => openMode("disbursement")}
            variant="outline"
            className="h-12 px-6 rounded-xl flex-1"
          >
            <ArrowUpRight className="w-5 h-5 mr-2" /> Withdraw
          </Button>}
          <Button
            data-testid="button-transfer"
            onClick={() => openMode("transfer")}
            variant="secondary"
            className="h-12 px-4 rounded-xl"
          >
            Transfer
          </Button>
        </div>
      ) : (
        <Card className="border-none shadow-md bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">
              {editingTransaction
                ? `Edit ${mode === "deposit" ? "Deposit" : "Withdrawal"}`
                : mode === "deposit" ? "Add Money to Account" : mode === "transfer" ? "Move Between Bank & Savings" : "Take Money Out"}
            </CardTitle>
            <CardDescription>
              {mode === "deposit"
                ? "Money going into the joint bank account."
                : mode === "transfer"
                  ? "Move shared group funds between the joint bank account and a savings goal."
                  : "Money going out of the joint bank account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input
                    data-testid="input-amount"
                    type="number"
                    placeholder="e.g. 20000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    min="1"
                    step="1"
                    className="h-12 text-lg bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Date</label>
                  <Input
                    data-testid="input-date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                    className="h-12 bg-card"
                  />
                </div>
                {mode === "disbursement" && (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-semibold text-foreground">
                      Category <span className="text-destructive">*</span>
                    </label>
                    <select
                      data-testid="select-expense-category"
                      required
                      className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={expenseCategory}
                      onChange={e => setExpenseCategory(e.target.value)}
                    >
                      <option value="" disabled>Choose a category...</option>
                      {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        data-testid="input-new-expense-category"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateCategory();
                          }
                        }}
                        placeholder="Can't find it? Add a category, e.g. Transport"
                        className="h-10 bg-card"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!newCategoryName.trim() || addingCategory}
                        onClick={() => void handleCreateCategory()}
                        className="h-10 shrink-0"
                        data-testid="button-add-expense-category"
                      >
                        {addingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add category"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Categories make bank withdrawals appear accurately in expense and savings reports.
                    </p>
                  </div>
                )}
                {mode !== "transfer" && <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-semibold text-foreground">
                    {mode === "deposit"
                      ? depositSourceKind === "other" ? "Other source narration" : "Description"
                      : withdrawalDestinationKind === "other" ? "Other destination narration" : "Details"}
                    {mode === "disbursement" && withdrawalDestinationKind !== "other" && <span className="font-normal text-muted-foreground"> (optional)</span>}
                  </label>
                  <Input
                    data-testid="input-description"
                    placeholder={mode === "deposit"
                      ? depositSourceKind === "other" ? "e.g. Group gift from a friend" : "e.g. Salary deposit"
                      : withdrawalDestinationKind === "other" ? "e.g. Emergency cash support" : "e.g. Paid school fees for term two"}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required={mode === "deposit" || withdrawalDestinationKind === "other"}
                    className="h-12 bg-card"
                  />
                </div>}

                {mode === "transfer" && <div className="space-y-4 sm:col-span-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Transfer direction</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={transferDirection === "to_savings" ? "default" : "outline"} onClick={() => setTransferDirection("to_savings")}>Bank → Savings</Button>
                      <Button type="button" variant={transferDirection === "from_savings" ? "default" : "outline"} onClick={() => setTransferDirection("from_savings")}>Savings → Bank</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Savings goal <span className="text-destructive">*</span></label>
                    <select
                      data-testid="select-transfer-goal"
                      required
                      value={transferGoalId?.toString() ?? ""}
                      onChange={e => setTransferGoalId(e.target.value ? Number(e.target.value) : null)}
                      className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
                    >
                      <option value="" disabled>Choose a savings goal...</option>
                      {savingsGoals.map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Transfer narration <span className="text-destructive">*</span></label>
                    <Input data-testid="input-transfer-narration" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Set aside for school fees" required className="h-12 bg-card" />
                  </div>
                </div>}

                {/* ── DEPOSIT: who is depositing ── */}
                {mode === "deposit" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        Who is depositing?
                        {canManageShared && <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>}
                      </label>
                      <div className="grid grid-cols-3 gap-2" data-testid="deposit-attribution">
                        {/* Joint bank chip — mutually exclusive with named members */}
                        {canManageShared && <button
                          key="joint-bank"
                          type="button"
                          data-testid="chip-joint-bank-deposit"
                          onClick={() => {
                            setDepositorIds([]);
                            setIncomeSourceId(null);
                            setDepositorAmounts({});
                          }}
                          className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                            depositorIds.length === 0
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-input text-foreground hover:bg-muted/40"
                          }`}
                        >
                          Joint bank
                        </button>}

                        {/* Named member chips */}
                        {(canManageShared ? (members ?? []) : (members ?? []).filter((m) => m.userId === user?.id)).map(m => {
                          const name = m.userName?.split(' ')[0] ?? 'Member';
                          const selected = depositorIds.includes(m.userId);
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              data-testid={`chip-depositor-${m.userId}`}
                              onClick={() => {
                                setDepositorIds(prev =>
                                  prev.includes(m.userId)
                                    ? prev.filter(id => id !== m.userId)
                                    : [...prev, m.userId]
                                );
                                setIncomeSourceId(null);
                              }}
                              className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card border-input text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Per-depositor split rows — only when multiple named depositors */}
                      {depositorIds.length > 1 && (() => {
                        const total = Number(amount) || 0;
                        const splitTotal = depositorIds.reduce((s, id) => s + (Number(depositorAmounts[id] || 0)), 0);
                        const diff = total - splitTotal;
                        return (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted-foreground">
                              How much is each person depositing?{total > 0 ? ` (total: KES ${total.toLocaleString()})` : ""}
                            </p>
                            {depositorIds.map(did => {
                              const member = (members ?? []).find(m => m.userId === did);
                              const name = member?.userName?.split(' ')[0] ?? 'Member';
                              return (
                                <div key={did} className="flex items-center gap-3">
                                  <span className="text-sm font-semibold w-20 shrink-0">{name}</span>
                                  <input
                                    type="number"
                                    placeholder="0"
                                     min="1"
                                     step="1"
                                    data-testid={`input-depositor-amount-${did}`}
                                    value={depositorAmounts[did] ?? ""}
                                    onChange={e => setDepositorAmounts(prev => ({ ...prev, [did]: e.target.value }))}
                                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                    {/* Income source — only for exactly one named depositor */}
                    {singleDepositorId && (
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-semibold text-foreground">
                          Where did this money come from?{" "}
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        </label>
                        <select
                          data-testid="select-income-source"
                          className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          value={depositSourceKind === "other" ? "other" : incomeSourceId?.toString() ?? ""}
                          onChange={e => {
                            if (e.target.value === "other") {
                              setDepositSourceKind("other");
                              setIncomeSourceId(null);
                            } else {
                              setDepositSourceKind(e.target.value ? "income_source" : null);
                              setIncomeSourceId(e.target.value ? Number(e.target.value) : null);
                            }
                          }}
                        >
                          <option value="">Select an income source...</option>
                          {depositSources.map(src => (
                            <option key={src.id} value={src.id}>
                              {src.name}
                            </option>
                          ))}
                          <option value="other">Other — add narration</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Select a saved stream or choose Other and add a narration.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ── WITHDRAWAL: who is withdrawing ── */}
                {mode === "disbursement" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">Who is withdrawing?</label>
                      <div className="grid grid-cols-3 gap-2" data-testid="withdrawal-attribution">
                        {/* Joint bank — default selection */}
                        <button
                          key="joint-bank"
                          type="button"
                          data-testid="chip-joint-bank-withdrawal"
                          onClick={() => setWithdrawerId(null)}
                          className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                            withdrawerId === null
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-input text-foreground hover:bg-muted/40"
                          }`}
                        >
                          Joint bank
                        </button>

                        {/* Named member chips — one at a time */}
                        {(members ?? []).map(m => {
                          const name = m.userName?.split(' ')[0] ?? 'Member';
                          const selected = withdrawerId === m.userId;
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              data-testid={`chip-withdrawer-${m.userId}`}
                              onClick={() => setWithdrawerId(selected ? null : m.userId)}
                              className={`h-12 rounded-xl border text-base font-semibold transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card border-input text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">Where is the money going?</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={withdrawalDestinationKind === "category" ? "default" : "outline"} onClick={() => setWithdrawalDestinationKind("category")}>Budget category</Button>
                        <Button type="button" variant={withdrawalDestinationKind === "other" ? "default" : "outline"} onClick={() => setWithdrawalDestinationKind("other")}>Other</Button>
                      </div>
                      {withdrawalDestinationKind === "other" && (
                        <p className="text-xs text-muted-foreground">A narration is required for an Other destination.</p>
                      )}
                    </div>

                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={resetForm} className="h-12 px-6">Cancel</Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-transaction" className="h-12 px-8">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingTransaction ? "Save changes" : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transaction list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !account?.transactions?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Landmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No transactions yet</p>
          <p className="text-sm mt-1">Record a deposit or disbursement above.</p>
        </div>
      ) : (
        <Card className="border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {account.transactions.map((tx) => {
              const isDeposit = tx.type === "deposit";
              const isTransfer = !!tx.savingsGoalId;
              const attribution = madeByLabel(tx.madeByName, tx.type);
              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDeposit ? "bg-green-100" : "bg-red-100"}`}>
                      {isDeposit
                        ? <ArrowDownLeft className="w-5 h-5 text-green-600" />
                        : <ArrowUpRight className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {isTransfer
                          ? `${tx.transferDirection === "to_savings" ? "Bank → Savings" : "Savings → Bank"}: ${tx.savingsGoalName ?? "Savings goal"}`
                          : !isDeposit && tx.expenseCategory ? tx.expenseCategory : tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`tx-meta-${tx.id}`}>
                        {isTransfer
                          ? tx.description
                          : isDeposit
                            ? `Deposited by ${attribution} · ${tx.description}`
                            : `Withdrawn by ${attribution}${tx.expenseCategory && tx.description !== tx.expenseCategory ? ` · ${tx.description}` : ""}`}
                        {" · "}{formatDate(tx.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className={`font-display font-bold text-lg ${isDeposit ? "text-green-600" : "text-destructive"}`}>
                      {isDeposit ? "+" : "-"}{formatKes(tx.amount)}
                    </p>
                    {!isTransfer && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-edit-tx-${tx.id}`}
                      className="hover:bg-muted h-9 w-9"
                      onClick={() => openEdit(tx)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>}
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-tx-${tx.id}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                      onClick={() => handleDelete(tx.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
