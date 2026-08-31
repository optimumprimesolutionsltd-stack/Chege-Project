import { useEffect, useState } from "react";
import {
  useGetJointAccount, useCreateDeposit, useCreateDisbursement, useCreateBankCharge, useUpdateJointAccountTransaction, useDeleteJointAccountTransaction,
  useGetMembers, useGetBudgetCategories, getGetBudgetCategoriesQueryKey,
  useGetSavingsGoals, useTransferBankToSavings, useTransferSavingsToBank, useGetGroup,
  getGetJointAccountQueryKey, getGetDashboardActivityQueryKey, getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardSummaryQueryKey, getGetSavingsGoalsQueryKey, useUpdateJointAccountOpeningBalance,
  useGetJointAccounts, useCreateJointAccount, useUpdateJointAccount, useDeleteJointAccount,
  getGetJointAccountsQueryKey, useTransferBankToBank,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate } from "@/lib/utils";
import { Trash2, Pencil, ArrowDownLeft, ArrowUpRight, Loader2, Landmark, TrendingUp, TrendingDown, Plus, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { canManageBankAccount, resolveBankAccountSelection } from "@/lib/bank-access";
import { getProjectedBalanceAfterOutgoing } from "@/lib/bank-balance-utils";

// "Joint bank" is represented as null — never implicitly attributed to the signed-in user.
const JOINT_BANK_ID = null as null;

function getBankEditDeepLink() {
  const editId = Number(new URLSearchParams(window.location.search).get("edit"));
  return Number.isInteger(editId) && editId > 0 ? editId : null;
}

type MemberIncomeSource = {
  id: number;
  name: string;
};

type EditableTransaction = {
  id: number;
  accountId?: number | null;
  type: string;
  amount: number;
  description: string;
  date: string;
  madeById?: string | null;
  incomeSourceId?: number | null;
  expenseCategory?: string | null;
  bankCharge?: boolean;
  bankTransferId?: string | null;
  bankTransferAccountId?: number | null;
  bankTransferAccountName?: string | null;
  savingsGoalId?: number | null;
  savingsGoalName?: string | null;
  transferDirection?: string | null;
  contributorSplits?: { userId: string; amount: number; incomeSourceId?: number | null }[];
};

export default function Bank() {
  const bankEditId = getBankEditDeepLink();
  const { data: group } = useGetGroup();
  const bankSelectionKey = group?.id ? `jamvi:bank-account:${group.id}` : null;
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const { data: accounts = [], isLoading: accountsLoading } = useGetJointAccounts();
  const { data: account, isLoading } = useGetJointAccount(
    selectedAccountId ? { accountId: selectedAccountId } : undefined,
  );
  const { data: members } = useGetMembers();
  const { data: categories } = useGetBudgetCategories();
  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();
  const createBankCharge = useCreateBankCharge();
  const updateTx = useUpdateJointAccountTransaction();
  const deleteTx = useDeleteJointAccountTransaction();
  const transferToSavings = useTransferBankToSavings();
  const transferFromSavings = useTransferSavingsToBank();
  const updateOpeningBalance = useUpdateJointAccountOpeningBalance();
  const createAccount = useCreateJointAccount();
  const updateAccount = useUpdateJointAccount();
  const deleteAccount = useDeleteJointAccount();
  const transferBankToBank = useTransferBankToBank();
  const { data: savingsGoals = [] } = useGetSavingsGoals();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSharedWorkspace = group?.isPrivate === false;
  const canManageAccount = canManageBankAccount(group);
  const canManageShared = isSharedWorkspace && canManageAccount;
  const canEditTransaction = (tx: EditableTransaction) =>
    canManageAccount || (
      tx.type === "deposit" &&
      tx.madeById === user?.id &&
      tx.date === new Date().toISOString().split("T")[0] &&
      !tx.savingsGoalId &&
      (tx.contributorSplits?.length ?? 0) === 0
    );

  const [mode, setMode] = useState<"deposit" | "disbursement" | "transfer" | "bank_transfer" | "bank_charge" | null>(null);
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
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<EditableTransaction | null>(null);
  const [transferDirection, setTransferDirection] = useState<"to_savings" | "from_savings">("to_savings");
  const [transferGoalId, setTransferGoalId] = useState<number | null>(null);
  const [bankTransferDestinationId, setBankTransferDestinationId] = useState<number | null>(null);
  const [openedDeepLinkId, setOpenedDeepLinkId] = useState<number | null>(null);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState("");
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountNumberDraft, setAccountNumberDraft] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId(null);
      return;
    }
    let savedId: number | null = null;
    if (bankSelectionKey) {
      try {
        const value = Number(localStorage.getItem(bankSelectionKey));
        savedId = Number.isInteger(value) && value > 0 ? value : null;
      } catch {}
    }
    setSelectedAccountId((current) => resolveBankAccountSelection(accounts, current, savedId));
  }, [accounts, bankSelectionKey]);

  useEffect(() => {
    if (!bankSelectionKey || !selectedAccountId) return;
    try { localStorage.setItem(bankSelectionKey, String(selectedAccountId)); } catch {}
  }, [bankSelectionKey, selectedAccountId]);

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
    queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardIncomeStreamsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
  };

  const openOpeningBalanceEditor = () => {
    setOpeningBalanceDraft(String(account?.openingBalance ?? 0));
    setEditingOpeningBalance(true);
  };

  const handleOpeningBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(openingBalanceDraft);
    if (!Number.isInteger(value) || value < 0) {
      toast({
        variant: "destructive",
        title: "Enter a whole KES amount",
        description: "The opening balance must be zero or more whole shillings.",
      });
      return;
    }
    try {
      if (!selectedAccountId) throw new Error("No bank account selected");
      await updateOpeningBalance.mutateAsync({ data: { openingBalance: value, accountId: selectedAccountId } });
      setEditingOpeningBalance(false);
      toast({
        title: "Opening balance saved",
        description: "The current balance now includes this starting amount.",
      });
      invalidate();
    } catch {
      toast({
        variant: "destructive",
        title: "Could not save opening balance",
        description: "Please try again.",
      });
    }
  };

  const handleAccountSave = async () => {
    const name = accountNameDraft.trim();
    const accountNumber = accountNumberDraft.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Account name required", description: "Enter a name for this bank account." });
      return;
    }
    try {
      const saved = editingAccountId
        ? await updateAccount.mutateAsync({ id: editingAccountId, data: { name, accountNumber: accountNumber || null } })
        : await createAccount.mutateAsync({ data: { name, accountNumber: accountNumber || undefined } });
      setSelectedAccountId(saved.id);
      setAccountNameDraft("");
      setAccountNumberDraft("");
      setEditingAccountId(null);
      invalidate();
      toast({ title: editingAccountId ? "Account renamed" : "Account added" });
    } catch {
      toast({ variant: "destructive", title: "Could not save account", description: "Check the name and try again." });
    }
  };

  const handleAccountDelete = async (id: number) => {
    if (!confirm("Remove this bank account? Accounts with transaction history cannot be removed.")) return;
    try {
      await deleteAccount.mutateAsync({ id });
      if (selectedAccountId === id) setSelectedAccountId(null);
      invalidate();
      toast({ title: "Account removed" });
    } catch {
      toast({ variant: "destructive", title: "Could not remove account", description: "Accounts with transaction history must be kept." });
    }
  };

  const handleCreateCategory = async () => {
    if (!canManageAccount) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Ask a group owner or admin to add a shared category.",
      });
      return;
    }
    const name = newCategoryName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Category name required",
        description: "Enter a category name before adding it.",
      });
      return;
    }

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
      setShowCategoryCreator(false);
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
    setDepositorIds(!isSharedWorkspace && user?.id ? [user.id] : []);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(!isSharedWorkspace ? user?.id ?? null : JOINT_BANK_ID);
    setExpenseCategory("");
    setWithdrawalDestinationKind("category");
    setTransferDirection("to_savings");
    setTransferGoalId(null);
    setBankTransferDestinationId(null);
    setNewCategoryName("");
    setShowCategoryCreator(false);
    setEditingTransaction(null);
    setMode(null);
  };

  const openMode = (m: "deposit" | "disbursement" | "transfer" | "bank_transfer" | "bank_charge") => {
    if (!canManageAccount && m !== "deposit") {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Ask a group owner or admin to record withdrawals and transfers.",
      });
      return;
    }
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setDepositorIds(!isSharedWorkspace && user?.id ? [user.id] : (!canManageShared && user?.id ? [user.id] : []));
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(!isSharedWorkspace ? user?.id ?? null : JOINT_BANK_ID);
    setExpenseCategory("");
    setWithdrawalDestinationKind("category");
    setTransferDirection("to_savings");
    setTransferGoalId(null);
    setBankTransferDestinationId(accounts.find((candidate) => candidate.id !== selectedAccountId)?.id ?? null);
    setNewCategoryName("");
    setShowCategoryCreator(false);
    setEditingTransaction(null);
    setMode(m);
  };

  useEffect(() => {
    const shortcut = new URLSearchParams(window.location.search).get("shortcut");
    if (!canManageAccount || (shortcut !== "withdraw" && shortcut !== "bank-transfer")) return;
    openMode(shortcut === "bank-transfer" ? "bank_transfer" : "disbursement");
    const url = new URL(window.location.href);
    url.searchParams.delete("shortcut");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [canManageAccount]);

  const openEdit = (tx: EditableTransaction) => {
    if (!canEditTransaction(tx)) {
      toast({
        variant: "destructive",
        title: "This transaction is locked",
        description: "Members can correct only their own deposits dated today. Ask an admin to correct an earlier or shared bank record.",
      });
      return;
    }
    const transactionMode = tx.savingsGoalId
      ? "transfer"
      : tx.bankCharge ? "bank_charge" : tx.type === "deposit" ? "deposit" : "disbursement";
    setEditingTransaction(tx);
    setMode(transactionMode);
    setAmount(String(tx.amount));
    setDescription(transactionMode === "transfer"
      ? tx.description.replace(/^Transfer (?:to|from) savings —\s*/, "")
      : tx.description);
    setDate(tx.date);
    const splitIds = tx.contributorSplits?.map((split) => split.userId) ?? [];
    setDepositorIds(transactionMode === "deposit"
      ? splitIds.length > 0 ? splitIds : tx.madeById ? [tx.madeById] : []
      : []);
    setDepositorAmounts(Object.fromEntries(
      (tx.contributorSplits ?? []).map((split) => [split.userId, String(split.amount)]),
    ));
    setIncomeSourceId(tx.incomeSourceId ?? null);
    setDepositSourceKind(null);
    setWithdrawerId(transactionMode === "disbursement" ? tx.madeById ?? null : JOINT_BANK_ID);
    setExpenseCategory(tx.expenseCategory ?? "");
    setWithdrawalDestinationKind(tx.description !== tx.expenseCategory ? "other" : "category");
    setTransferDirection(tx.transferDirection === "from_savings" ? "from_savings" : "to_savings");
    setTransferGoalId(tx.savingsGoalId ?? null);
    setNewCategoryName("");
  };

  useEffect(() => {
    if (!bankEditId || openedDeepLinkId === bankEditId || !account) return;
    const target = account.transactions.find((transaction) => transaction.id === bankEditId);
    if (!target || !canEditTransaction(target)) return;

    openEdit(target);
    setOpenedDeepLinkId(bankEditId);
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [account, bankEditId, openedDeepLinkId, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || !amount || !date || ((mode === "deposit" || mode === "transfer" || mode === "bank_transfer" || mode === "bank_charge") && !description.trim())) {
      toast({
        variant: "destructive",
        title: "Complete transaction details",
        description: "Enter an amount and date; deposits, transfers, and bank charges also need a narration.",
      });
      return;
    }
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
    if (!selectedAccountId) {
      toast({
        variant: "destructive",
        title: "Choose a bank account",
        description: "Add or select an account before recording a transaction.",
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
        const data = { amount: total, goalId: transferGoalId, narration: description.trim(), date, madeById: isSharedWorkspace ? null : user?.id, accountId: selectedAccountId };
        if (editingTransaction) {
          await updateTx.mutateAsync({
            id: editingTransaction.id,
            data: { ...data, transferDirection, accountId: editingTransaction.accountId ?? selectedAccountId },
          });
          toast({ title: "Transfer updated" });
          resetForm();
          invalidate();
          return;
        }
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
      if (mode === "bank_transfer") {
        if (!bankTransferDestinationId || bankTransferDestinationId === selectedAccountId) {
          toast({ variant: "destructive", title: "Choose another account", description: "Source and destination bank accounts must be different." });
          return;
        }
        await transferBankToBank.mutateAsync({
          data: {
            sourceAccountId: selectedAccountId,
            destinationAccountId: bankTransferDestinationId,
            amount: total,
            narration: description.trim(),
            date,
          },
        });
        toast({ title: "Bank transfer recorded", description: "Both account balances were updated." });
        resetForm();
        invalidate();
        return;
      }
      if (editingTransaction) {
        const contributorSplits = depositorIds.length > 1
          ? depositorIds.map((userId) => ({
              userId,
              amount: Number(depositorAmounts[userId] || 0),
              ...(() => {
                const existingSourceId = editingTransaction.contributorSplits
                  ?.find((split) => split.userId === userId)
                  ?.incomeSourceId;
                return existingSourceId ? { incomeSourceId: existingSourceId } : {};
              })(),
            }))
          : [];
        await updateTx.mutateAsync({
          id: editingTransaction.id,
          data: {
            amount: total,
            description: description.trim() || expenseCategory,
            date,
            madeById: mode === "deposit"
              ? (contributorSplits.length > 0 ? undefined : !isSharedWorkspace ? user?.id : depositorIds[0] ?? null)
              : (!isSharedWorkspace ? user?.id : withdrawerId),
            ...(mode === "deposit" ? { contributorSplits } : {}),
            ...(mode === "deposit" && contributorSplits.length === 0 ? { incomeSourceId } : {}),
            ...(mode === "deposit" && depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            ...(mode === "disbursement" ? { expenseCategory, destinationKind: withdrawalDestinationKind } : {}),
            ...(mode === "bank_charge" ? { bankCharge: true } : {}),
            accountId: editingTransaction.accountId ?? selectedAccountId ?? undefined,
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
              accountId: selectedAccountId ?? undefined,
            },
          });
        } else {
          // Single named depositor or Joint bank (null)
          const madeById = !isSharedWorkspace ? user?.id : depositorIds.length === 1 ? depositorIds[0] : null;
          await createDeposit.mutateAsync({
            data: {
              amount: Number(amount),
              description,
              date,
              madeById,
              ...(madeById && incomeSourceId ? { incomeSourceId } : {}),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
              accountId: selectedAccountId ?? undefined,
            },
          });
        }
        toast({ title: "Deposit recorded" });
      } else if (mode === "bank_charge") {
        await createBankCharge.mutateAsync({
          data: {
            amount: total,
            narration: description.trim(),
            date,
            accountId: selectedAccountId ?? undefined,
          },
        });
        toast({ title: "Bank charge recorded" });
      } else {
        await createDisbursement.mutateAsync({
          data: {
            amount: total,
            description: description.trim() || expenseCategory,
            date,
            expenseCategory,
            madeById: !isSharedWorkspace ? user?.id : withdrawerId,
            destinationKind: withdrawalDestinationKind,
            accountId: selectedAccountId ?? undefined,
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
    if (!canManageAccount) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: "Only an owner or admin can delete a shared bank transaction.",
      });
      return;
    }
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTx.mutateAsync({ id });
      toast({ title: "Transaction deleted" });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete transaction." });
    }
  };

  const isPending = createDeposit.isPending || createDisbursement.isPending || createBankCharge.isPending || updateTx.isPending ||
    transferToSavings.isPending || transferFromSavings.isPending || transferBankToBank.isPending || addingCategory;
  const outgoingAmount = Number(amount);
  const isOutgoingTransaction = mode === "disbursement" || mode === "bank_charge" ||
    mode === "bank_transfer" || (mode === "transfer" && transferDirection === "to_savings");
  const projectedBalance = isOutgoingTransaction &&
    account &&
    Number.isInteger(outgoingAmount) &&
    outgoingAmount > 0
    ? getProjectedBalanceAfterOutgoing(
        account.balance,
        outgoingAmount,
        editingTransaction
          ? { amount: editingTransaction.amount, type: editingTransaction.type }
          : null,
      )
    : null;

  // Helpers for attribution labels in transaction list
  const madeByLabel = (madeByName: string | null | undefined, type: string) => {
    if (!madeByName) return account?.accountName ?? "Bank account";
    return madeByName;
  };

  return (
    <div className="space-y-8 pb-12 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Bank accounts{account?.accountName ? ` · ${account.accountName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isSharedWorkspace
            ? "Track money going in and out of your Shared budget."
            : "Track money going in and out of your Personal budget."}
        </p>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Bank account</p>
              <p className="text-sm text-muted-foreground">Choose the account whose balance and transactions you want to view.</p>
            </div>
            <select data-testid="select-bank-account" value={selectedAccountId?.toString() ?? ""} onChange={(event) => setSelectedAccountId(event.target.value ? Number(event.target.value) : null)} disabled={accountsLoading || accounts.length === 0} className="h-10 min-w-48 rounded-md border border-input bg-card px-3 text-sm">
              {accounts.length === 0 ? <option value="">No accounts yet</option> : accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          {canManageAccount && (
            <div className="border-t border-border/60 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personalize bank accounts</p>
              <p className="mb-3 text-xs text-muted-foreground">Give each account a name you recognize, such as M-Pesa wallet, KCB salary, or Savings.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input data-testid="input-bank-account-name" value={accountNameDraft} onChange={(event) => setAccountNameDraft(event.target.value)} placeholder={editingAccountId ? "New account name" : "e.g. Family M-Pesa"} maxLength={80} />
                <Input data-testid="input-bank-account-number" value={accountNumberDraft} onChange={(event) => setAccountNumberDraft(event.target.value)} placeholder="Account number (optional)" maxLength={40} />
                <Button type="button" data-testid="button-save-bank-account" onClick={handleAccountSave} disabled={createAccount.isPending || updateAccount.isPending}>{editingAccountId ? "Save changes" : "Add account"}</Button>
                {editingAccountId && <Button type="button" variant="outline" data-testid="button-cancel-bank-account-edit" onClick={() => { setEditingAccountId(null); setAccountNameDraft(""); setAccountNumberDraft(""); }}>Cancel</Button>}
              </div>
              {selectedAccountId && <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" data-testid="button-rename-bank-account" onClick={() => { const item = accounts.find((candidate) => candidate.id === selectedAccountId); setEditingAccountId(selectedAccountId); setAccountNameDraft(item?.name ?? ""); setAccountNumberDraft(item?.accountNumber ?? ""); }}>Personalize selected</Button>
                <Button type="button" size="sm" variant="destructive" data-testid="button-remove-bank-account" onClick={() => handleAccountDelete(selectedAccountId)} disabled={deleteAccount.isPending}>Remove selected</Button>
              </div>}
            </div>
          )}
        </CardContent>
      </Card>

       {isSharedWorkspace && !canManageShared && (
          <div id="bank-manager-guidance" className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            You can add and correct your own deposit today. An admin handles earlier records, withdrawals, transfers, and removals.
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
                <p className="text-sm font-medium opacity-80">Closing balance</p>
              </div>
                <p className="text-4xl font-display font-bold" data-testid="bank-balance">{formatKes(account?.balance ?? 0)}</p>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="opacity-75">
                    Opening balance: <span className="font-semibold">{formatKes(account?.openingBalance ?? 0)}</span>
                  </span>
                  {canManageAccount && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 rounded-lg bg-primary-foreground/15 px-3 text-primary-foreground hover:bg-primary-foreground/25"
                      onClick={openOpeningBalanceEditor}
                      data-testid="button-edit-opening-balance"
                    >
                      Edit starting balance
                    </Button>
                  )}
                </div>
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

      {editingOpeningBalance && (
        <Card className="border-none shadow-md bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">Set starting balance</CardTitle>
            <CardDescription>
              Enter the money already in {account?.accountName ?? "this bank account"} before the transactions shown below.
              This is a workspace-level value and does not create a transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOpeningBalanceSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="bank-opening-balance">
                  Opening balance (KES)
                </label>
                <Input
                  id="bank-opening-balance"
                  data-testid="input-opening-balance"
                  type="number"
                  min="0"
                  step="1"
                  value={openingBalanceDraft}
                  onChange={(e) => setOpeningBalanceDraft(e.target.value)}
                  className="h-12 text-lg bg-card"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Current balance = opening balance + deposits − withdrawals.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setEditingOpeningBalance(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateOpeningBalance.isPending} data-testid="button-save-opening-balance">
                  {updateOpeningBalance.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save starting balance
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Action buttons / form */}
      {!mode ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <Button
            data-testid="button-deposit"
            onClick={() => openMode("deposit")}
            className="h-12 px-6 rounded-xl flex-1"
          >
            <ArrowDownLeft className="w-5 h-5 mr-2" /> Deposit
          </Button>
          <Button
            data-testid="button-withdraw"
            onClick={() => openMode("disbursement")}
            variant="outline"
            className="h-12 px-6 rounded-xl flex-1"
            disabled={!canManageAccount}
            aria-describedby={!canManageAccount ? "bank-manager-guidance" : undefined}
          >
            <ArrowUpRight className="w-5 h-5 mr-2" /> Withdraw
          </Button>
          <Button
            data-testid="button-transfer"
            onClick={() => openMode("transfer")}
            variant="secondary"
            className="h-12 px-4 rounded-xl"
            disabled={!canManageAccount}
            aria-describedby={!canManageAccount ? "bank-manager-guidance" : undefined}
          >
            Transfer
          </Button>
          <Button
            data-testid="button-bank-transfer"
            onClick={() => openMode("bank_transfer")}
            variant="secondary"
            className="h-12 px-4 rounded-xl"
            disabled={!canManageAccount || accounts.length < 2}
          >
            Bank → Bank
          </Button>
          <Button
            data-testid="button-bank-charge"
            onClick={() => openMode("bank_charge")}
            variant="outline"
            className="h-12 px-4 rounded-xl"
            disabled={!canManageAccount}
            aria-describedby={!canManageAccount ? "bank-manager-guidance" : undefined}
          >
            Bank charge
          </Button>
        </div>
      ) : (
        <Card className="border-none shadow-md bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">
              {editingTransaction
                ? `Edit ${mode === "deposit" ? "Deposit" : mode === "transfer" ? "Transfer" : mode === "bank_charge" ? "Bank Charge" : "Withdrawal"}`
                : mode === "deposit" ? "Add Money to Account" : mode === "transfer" ? "Move Between Bank & Savings" : mode === "bank_transfer" ? "Move Money Between Bank Accounts" : mode === "bank_charge" ? "Record Bank Charge" : "Take Money Out"}
            </CardTitle>
            <CardDescription>
              {mode === "deposit"
                ? `Money going into ${account?.accountName ?? "this bank account"}.`
                : mode === "transfer"
                  ? `Move ${isSharedWorkspace ? "Shared budget" : "Personal budget"} funds between this account and a savings goal.`
                  : mode === "bank_transfer"
                    ? "Record an internal move. It changes only these two bank balances and is not income or spending."
                  : mode === "bank_charge"
                    ? "Record a fee from the bank statement. It reduces this account but is not counted as household spending."
                  : `Money going out of ${account?.accountName ?? "this bank account"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {(mode === "deposit" || mode === "disbursement") && (
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="transaction-bank-account" className="text-sm font-semibold text-foreground">Bank account <span className="text-destructive">*</span></label>
                  <select id="transaction-bank-account" data-testid="select-transaction-bank-account" required value={selectedAccountId?.toString() ?? ""} onChange={(event) => setSelectedAccountId(event.target.value ? Number(event.target.value) : null)} disabled={accountsLoading || accounts.length === 0} className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="" disabled>{accounts.length === 0 ? "Add a bank account first" : "Choose the bank account"}</option>
                    {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.accountNumber ? ` · ${item.accountNumber}` : ""}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">This account will receive the deposit or be reduced by the withdrawal.</p>
                </div>
              )}
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
                    disabled={isSharedWorkspace && !canManageShared && editingTransaction !== null}
                    className="h-12 bg-card"
                  />
                  {isSharedWorkspace && !canManageShared && editingTransaction !== null && (
                    <p className="text-xs text-muted-foreground">
                      Members can correct this deposit today, but only an admin can change its date.
                    </p>
                  )}
                </div>
                {projectedBalance !== null && projectedBalance < 0 && (
                  <div
                    className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 sm:col-span-2 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                    data-testid="bank-negative-balance-warning"
                    role="alert"
                  >
                    <p className="flex items-center gap-2 font-semibold"><Flag className="h-4 w-4 fill-current" /> This will take the account below zero.</p>
                    <p className="mt-1">
                      The projected closing balance is {formatKes(projectedBalance)}. Jamvi will still save the record because it tracks what happened.
                    </p>
                  </div>
                )}
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
                      onChange={e => {
                        if (e.target.value === "__add_category__") {
                          setExpenseCategory("");
                          setShowCategoryCreator(true);
                        } else {
                          setExpenseCategory(e.target.value);
                        }
                      }}
                    >
                      <option value="" disabled>Choose a category...</option>
                      {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      <option value="__add_category__">+ Add new category</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      data-testid="button-show-withdrawal-category-creator"
                      onClick={() => setShowCategoryCreator((open) => !open)}
                      aria-expanded={showCategoryCreator}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {showCategoryCreator ? "Close category creator" : "Add category"}
                    </Button>
                    {showCategoryCreator && (
                      <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row">
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
                          placeholder="e.g. Transport"
                          className="h-10 bg-card"
                          autoFocus
                        />
                        <Button
                          type="button"
                          disabled={addingCategory}
                          onClick={() => void handleCreateCategory()}
                          className="h-10 shrink-0"
                          data-testid="button-add-expense-category"
                        >
                          {addingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save category"}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Categories make bank withdrawals appear accurately in expense and savings reports.
                    </p>
                  </div>
                )}
                {mode !== "transfer" && mode !== "bank_transfer" && <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-semibold text-foreground">
                    {mode === "deposit"
                      ? depositSourceKind === "other" ? "Other source narration" : "Description"
                      : mode === "bank_charge" ? "Narration" : withdrawalDestinationKind === "other" ? "Other destination narration" : "Details"}
                    {mode === "disbursement" && withdrawalDestinationKind !== "other" && <span className="font-normal text-muted-foreground"> (optional)</span>}
                    {mode === "bank_charge" && <span className="text-destructive"> *</span>}
                  </label>
                  <Input
                    data-testid="input-description"
                    placeholder={mode === "deposit"
                      ? depositSourceKind === "other" ? "e.g. Group gift from a friend" : "e.g. Salary deposit"
                      : mode === "bank_charge" ? "e.g. Monthly account maintenance fee" : withdrawalDestinationKind === "other" ? "e.g. Emergency cash support" : "e.g. Paid school fees for term two"}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required={mode === "deposit" || mode === "bank_charge" || withdrawalDestinationKind === "other"}
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
                {mode === "bank_transfer" && <div className="space-y-4 sm:col-span-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">From account</label>
                      <div className="flex h-12 items-center rounded-md border bg-muted/40 px-3">{account?.accountName ?? "Selected account"}</div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">To account <span className="text-destructive">*</span></label>
                      <select data-testid="select-bank-transfer-destination" value={bankTransferDestinationId?.toString() ?? ""} onChange={(e) => setBankTransferDestinationId(e.target.value ? Number(e.target.value) : null)} className="flex h-12 w-full rounded-md border border-input bg-card px-3 text-base">
                        <option value="" disabled>Choose destination...</option>
                        {accounts.filter((candidate) => candidate.id !== selectedAccountId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Narration <span className="text-destructive">*</span></label>
                    <Input data-testid="input-bank-transfer-narration" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Move operating funds" maxLength={200} />
                  </div>
                  {account && bankTransferDestinationId && Number.isInteger(outgoingAmount) && outgoingAmount > 0 && (
                    <div className="rounded-lg border bg-card p-3 text-sm" data-testid="bank-transfer-preview">
                      <strong>{account.accountName}</strong>: {formatKes(account.balance)} → {formatKes(account.balance - outgoingAmount)}
                      <br />
                      <strong>{accounts.find((candidate) => candidate.id === bankTransferDestinationId)?.name}</strong> receives {formatKes(outgoingAmount)}.
                    </div>
                  )}
                </div>}

                {/* ── DEPOSIT: who is depositing ── */}
                {mode === "deposit" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        {isSharedWorkspace ? "Who is depositing?" : "Deposited by"}
                        {canManageShared && <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>}
                      </label>
                      {!isSharedWorkspace ? (
                        <p className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                          This deposit will be recorded in your name and kept in your Personal budget.
                        </p>
                      ) : <div className="grid grid-cols-3 gap-2" data-testid="deposit-attribution">
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
                      </div>}

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
                    {isSharedWorkspace && <div className="space-y-2 sm:col-span-2">
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
                    </div>}

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
              const isBankTransfer = !!tx.bankTransferId;
              const isBankCharge = tx.bankCharge === true;
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
                        {isBankTransfer
                          ? `${isDeposit ? "From" : "To"} ${tx.bankTransferAccountName ?? "bank account"}`
                          : isTransfer
                          ? `${tx.transferDirection === "to_savings" ? "Bank → Savings" : "Savings → Bank"}: ${tx.savingsGoalName ?? "Savings goal"}`
                          : isBankCharge ? `Bank charge: ${tx.description}`
                          : !isDeposit && tx.expenseCategory ? tx.expenseCategory : tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`tx-meta-${tx.id}`}>
                        {isBankTransfer
                          ? `Internal bank transfer · ${tx.description}`
                          : isTransfer
                          ? tx.description
                          : isBankCharge
                            ? "Excluded from household spending and reports"
                          : isDeposit
                            ? `Deposited by ${attribution} · ${tx.description}`
                            : `Withdrawn by ${attribution}${tx.expenseCategory && tx.description !== tx.expenseCategory ? ` · ${tx.description}` : ""}`}
                        {" · "}{formatDate(tx.date)}{account.accountName ? ` · ${account.accountName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className={`font-display font-bold text-lg ${isDeposit ? "text-green-600" : "text-destructive"}`}>
                      {isDeposit ? "+" : "-"}{formatKes(tx.amount)}
                    </p>
                    {canEditTransaction(tx) && !isBankTransfer && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-edit-tx-${tx.id}`}
                      className="hover:bg-muted h-9 w-9"
                      onClick={() => openEdit(tx)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>}
                    {canManageAccount && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-tx-${tx.id}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                      onClick={() => handleDelete(tx.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>}
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
