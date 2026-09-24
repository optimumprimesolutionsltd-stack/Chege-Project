import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetJointAccount, useCreateDeposit, useCreateDisbursement, useUpdateJointAccountTransaction, useDeleteJointAccountTransaction, useDeleteExpense,
  useGetMembers, useGetBudgetCategories, getGetBudgetCategoriesQueryKey,
  useGetSavingsGoals, useTransferBankToSavings, useTransferSavingsToBank, useGetGroup,
  getGetJointAccountQueryKey, getGetDashboardActivityQueryKey, getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardSummaryQueryKey, getGetSavingsGoalsQueryKey, useUpdateJointAccountOpeningBalance,
  useGetJointAccounts, useCreateJointAccount, useUpdateJointAccount, useDeleteJointAccount,
  getGetJointAccountsQueryKey, getGetExpensesQueryKey, useTransferBankToBank,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes, formatDate } from "@/lib/utils";
import { movableOnDay, summariseDays } from "@/lib/move-day";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Repeat, Trash2, Pencil, ArrowDownLeft, ArrowUpRight, Loader2, Landmark, TrendingUp, TrendingDown, Plus, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { canManageBankAccount, resolveBankAccountSelection } from "@/lib/bank-access";
import { getProjectedBalanceAfterPosting } from "@/lib/bank-balance-utils";
import { buildCategoryTree, type CategoryRow } from "@workspace/category-tree";
import { CategorySearchInput, useCategorySearch } from "@/components/category-search";
import { evaluateAmountExpression, isAmountExpression } from "@/lib/amount-expression";
import { workspaceLabel } from "@/lib/workspace-identity";
import { useListEditor } from "@/hooks/use-list-editor";
import { EditableName, ListEditButton, ListEditorFooter, RemoveRowButton } from "@/components/list-editor";
import { GROUP_ATTRIBUTION } from "@/lib/attribution";

// GROUP_ATTRIBUTION is represented as null — never implicitly attributed to the signed-in user.
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
  runningBalance?: number | null;
  description: string;
  date: string;
  madeById?: string | null;
  incomeSourceId?: number | null;
  expenseCategory?: string | null;
  bankTransferId?: string | null;
  bankTransferAccountId?: number | null;
  bankTransferAccountName?: string | null;
  savingsGoalId?: number | null;
  savingsGoalName?: string | null;
  transferDirection?: string | null;
  expenseId?: number | null;
  // userId is optional now that a portion can be credited to a contributor
  // recorded by name, who has no account to point at.
  contributorSplits?: { userId?: string; contributorId?: number; amount: number; incomeSourceId?: number | null }[];
};

function parseBankAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A balance, which unlike an amount can be negative.
 *
 * Jamvi records an overdraft rather than refusing it, so a statement figure
 * below zero is a real thing somebody has to be able to type in.
 */
function parseBalanceFigure(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * What the person meant by what they typed: a number, or the arithmetic that
 * works one out. A day's spending arrives as several receipts that make one
 * posting, and leaving for a calculator loses the sitting.
 */
function readAmount(value: string): number | null {
  return parseBankAmount(value) ?? evaluateAmountExpression(value);
}

/**
 * A figure fit to be stored as money. Balances take two decimals now, and
 * arithmetic on them does not: 0.1 + 0.2 is 0.30000000000000004, which the
 * API refuses and nobody can read.
 */
function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

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
  const updateTx = useUpdateJointAccountTransaction();
  const deleteTx = useDeleteJointAccountTransaction();
  const deleteExpense = useDeleteExpense();
  const transferToSavings = useTransferBankToSavings();
  const transferFromSavings = useTransferSavingsToBank();
  const updateOpeningBalance = useUpdateJointAccountOpeningBalance();
  const createAccount = useCreateJointAccount();
  const updateAccount = useUpdateJointAccount();
  const deleteAccount = useDeleteJointAccount();
  const [, navigate] = useLocation();
  const transferBankToBank = useTransferBankToBank();
  const { data: savingsGoals = [] } = useGetSavingsGoals();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSharedWorkspace = group?.isPrivate === false;
  const budgetName = group?.isPrivate ? "Personal budget" : group ? workspaceLabel(group) : "Shared group";
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

  // Move every ordinary posting from one day onto another account: for the day
  // somebody realises they recorded under the wrong bank. Runs the same update
  // for each, so nothing else about an entry changes. A transfer, or a savings
  // or expense-linked posting, cannot change accounts on its own and stays put.
  const canMoveTx = (tx: EditableTransaction) =>
    canManageAccount && tx.bankTransferId == null && tx.savingsGoalId == null && tx.expenseId == null;
  // One entry to another account: the same update as Move a day, for a single
  // wrong-account entry, so it need not be deleted and retyped.
  const [movingTx, setMovingTx] = useState<EditableTransaction | null>(null);
  const [movingOne, setMovingOne] = useState(false);
  const moveOneTo = async (targetAccountId: number, targetName: string) => {
    if (!movingTx || movingOne) return;
    const tx = movingTx;
    setMovingOne(true);
    try {
      await updateTx.mutateAsync({ id: tx.id, data: { amount: tx.amount, date: tx.date, accountId: targetAccountId } });
      toast({ title: "Moved", description: `"${tx.description ?? "The entry"}" is now on ${targetName}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not move it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      invalidate();
      setMovingOne(false);
      setMovingTx(null);
    }
  };
  const [moveDayOpen, setMoveDayOpen] = useState(false);
  const [moveDayDate, setMoveDayDate] = useState<string | null>(null);
  const [movingDay, setMovingDay] = useState(false);
  // What to change about the day: the account it sits on, or the date it was
  // recorded under (the same slip, just as common - a whole day keyed in on the
  // wrong date).
  const [moveDayMode, setMoveDayMode] = useState<"account" | "date" | null>(null);
  const [moveDayNewDate, setMoveDayNewDate] = useState("");
  const closeMoveDay = () => {
    if (movingDay) return;
    setMoveDayOpen(false);
    setMoveDayDate(null);
    setMoveDayMode(null);
    setMoveDayNewDate("");
  };
  const moveDayTo = (targetAccountId: number, targetName: string) =>
    applyDayMove({ accountId: targetAccountId }, `moved to ${targetName}`);
  const moveDayToDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDayNewDate) || moveDayNewDate === moveDayDate) {
      toast({ variant: "destructive", title: "Pick a different date", description: "Choose the date these entries should really be under." });
      return Promise.resolve();
    }
    return applyDayMove({ date: moveDayNewDate }, `dated ${formatDate(moveDayNewDate)}`);
  };
  const applyDayMove = async (change: { accountId?: number; date?: string }, summary: string) => {
    if (!moveDayDate || movingDay) return;
    const all = (account?.transactions ?? []) as EditableTransaction[];
    const batch = movableOnDay(all, moveDayDate, canMoveTx);
    const daySize = all.filter((tx) => tx.date.slice(0, 10) === moveDayDate).length;
    setMovingDay(true);
    let moved = 0;
    let failure: string | null = null;
    for (const tx of batch) {
      try {
        // The account is always sent, so a date-only change cannot drop an
        // entry back onto the default account.
        await updateTx.mutateAsync({
          id: tx.id,
          data: { amount: tx.amount, date: change.date ?? tx.date, accountId: change.accountId ?? selectedAccountId ?? undefined },
        });
        moved += 1;
      } catch (error) {
        failure = error instanceof Error ? error.message : "Please try again.";
        break;
      }
    }
    invalidate();
    setMovingDay(false);
    setMoveDayOpen(false);
    setMoveDayDate(null);
    setMoveDayMode(null);
    setMoveDayNewDate("");
    const left = daySize - moved;
    toast({
      variant: failure ? "destructive" : undefined,
      title: failure ? "Only some were changed" : "Day changed",
      description: `${moved} ${moved === 1 ? "entry" : "entries"} ${summary}.`
        + (failure ? ` Stopped because: ${failure}` : "")
        + (!failure && left > 0 ? ` ${left} stayed as they were - transfers and savings or expense-linked entries cannot be changed on their own.` : ""),
    });
  };

  const [mode, setMode] = useState<"deposit" | "disbursement" | "transfer" | "bank_transfer" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // Deposit attribution — null = The group, string[] = named member IDs
  // Default: The group (empty array = no named depositors selected)
  const [depositorIds, setDepositorIds] = useState<string[]>([]);
  const [depositorAmounts, setDepositorAmounts] = useState<Record<string, string>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [depositSourceKind, setDepositSourceKind] = useState<"income_source" | "other" | null>(null);

  // Withdrawal attribution — null = The group, string = named member ID
  // Default: The group
  const [withdrawerId, setWithdrawerId] = useState<string | null>(JOINT_BANK_ID);
  const [expenseCategory, setExpenseCategory] = useState("");
  /**
   * "lend" is money out that is not spending: you expect it back, and it
   * becomes owed to you. It carries no category for that reason, and every
   * spending total filters on a category being present.
   */
  const [withdrawalDestinationKind, setWithdrawalDestinationKind] = useState<"category" | "other" | "party" | "lend">("category");
  // Paying somebody you owe: Mwangi, or KCB. And somebody paying you back,
  // which is not income — you had that money once already, when you lent it.
  const [withdrawPartyId, setWithdrawPartyId] = useState<string>("none");
  const [repayingPartyId, setRepayingPartyId] = useState<string>("none");
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyOwed, setNewPartyOwed] = useState("");
  const [newPartyIsInstitution, setNewPartyIsInstitution] = useState(false);
  const [addingParty, setAddingParty] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  // Which group a category added here joins, or null for a new top-level one.
  // It used to have no say: everything landed at the top level, which is how a
  // budget acquires a flat list of strays beside the groups it was given.
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<EditableTransaction | null>(null);
  const [transferDirection, setTransferDirection] = useState<"to_savings" | "from_savings">("to_savings");
  const [transferGoalId, setTransferGoalId] = useState<number | null>(null);
  const [bankTransferDestinationId, setBankTransferDestinationId] = useState<number | null>(null);
  const [openedDeepLinkId, setOpenedDeepLinkId] = useState<number | null>(null);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountNumberDraft, setAccountNumberDraft] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);

  // The transaction form replaces the action buttons at the top of the page. On a
  // phone the edit pencil sits far below that, so opening one looked like nothing
  // happened — bring the form into view whenever it opens.
  const formCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mode) return;
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode, editingTransaction?.id]);
  const [addingAccount, setAddingAccount] = useState(false);
  // A day's banking is several postings, not one. The form can stay open
  // between them and keep a tally of what the sitting has recorded.
  const [sitting, setSitting] = useState<{ count: number; inflow: number; outflow: number } | null>(null);
  // Reconciling: the statement's closing balance, against Jamvi's.
  const [reconciling, setReconciling] = useState(false);
  const [statementBalance, setStatementBalance] = useState("");
  const [reconcileNarration, setReconcileNarration] = useState("");
  const [reconcileCategory, setReconcileCategory] = useState("");

  const selectedBankAccount = accounts.find((item) => item.id === selectedAccountId) ?? null;
  const isCreatingAccount = addingAccount || !selectedBankAccount;

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

  useEffect(() => {
    if (!selectedBankAccount || addingAccount) return;
    if (editingAccountId === selectedBankAccount.id) return;
    setEditingAccountId(selectedBankAccount.id);
    setAccountNameDraft(selectedBankAccount.name);
    setAccountNumberDraft(selectedBankAccount.accountNumber ?? "");
  }, [selectedBankAccount, addingAccount, editingAccountId]);

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
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
  };

  // Panel-level edit mode: one Edit on a heading, stage renames/removals/adds,
  // one Save applies them all.
  const accountEditor = useListEditor({
    noun: "account",
    add: async (name) => { await createAccount.mutateAsync({ data: { name } }); },
    rename: async (id, name) => {
      const current = accounts.find((item) => item.id === id);
      await updateAccount.mutateAsync({ id, data: { name, accountNumber: current?.accountNumber ?? null } });
    },
    remove: async (id) => { await deleteAccount.mutateAsync({ id }); },
    afterSave: invalidate,
  });
  const txEditor = useListEditor({
    noun: "transaction",
    remove: async (id) => {
      const tx = (account?.transactions ?? []).find((item: EditableTransaction) => item.id === id);
      if (tx?.expenseId != null) await deleteExpense.mutateAsync({ id: tx.expenseId });
      else await deleteTx.mutateAsync({ id });
    },
    afterSave: invalidate,
  });

  const [showReconcile, setShowReconcile] = useState(false);

  const openReconcile = () => {
    setStatementBalance("");
    setReconcileNarration("");
    setReconcileCategory("");
    setShowReconcile(true);
  };

  /**
   * Record the shortfall as a bank charge.
   *
   * Only offered when Jamvi holds more than the statement does: money has left
   * the account that no posting accounts for, and on a Kenyan bank statement
   * that is nearly always a fee. Nearly always is not always, which is why the
   * app asks rather than assuming, and why the narration is editable — a
   * mis-attributed difference is worse than a visible one.
   */
  const recordDifference = async (difference: number) => {
    if (!selectedAccountId) {
      toast({
        variant: "destructive",
        title: "Choose a bank account",
        description: "Pick the account you are checking before recording the difference.",
      });
      return;
    }
    if (!reconcileCategory.trim()) {
      toast({
        variant: "destructive",
        title: "Choose a category",
        description: "Pick the category this spending belongs to, or record it as a bank charge.",
      });
      return;
    }
    setReconciling(true);
    try {
      {
        await createDisbursement.mutateAsync({
          data: {
            amount: difference,
            description: reconcileNarration.trim() || reconcileCategory,
            date: new Date().toISOString().slice(0, 10),
            expenseCategory: reconcileCategory,
            madeById: isSharedWorkspace ? null : user?.id,
            destinationKind: "category",
            accountId: selectedAccountId,
          },
        });
        toast({ title: "Spending recorded", description: `It counts against ${reconcileCategory}.` });
      }
      setShowReconcile(false);
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not record the difference." });
    } finally {
      setReconciling(false);
    }
  };

  const openOpeningBalanceEditor = () => {
    setOpeningBalanceDraft(String(account?.openingBalance ?? 0));
    setOpeningBalanceDate(account?.openingBalanceDate ?? new Date().toISOString().slice(0, 10));
    setEditingOpeningBalance(true);
  };

  const handleOpeningBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseBankAmount(openingBalanceDraft);
    if (value === null || value < 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid KES amount",
        description: "Use zero or more, with up to two decimal places.",
      });
      return;
    }
    try {
      if (!selectedAccountId) throw new Error("No bank account selected");
      await updateOpeningBalance.mutateAsync({
        data: { openingBalance: value, openingBalanceDate, accountId: selectedAccountId },
      });
      setEditingOpeningBalance(false);
      toast({
        title: "Opening balance saved",
        description: "The current balance now includes this starting amount.",
      });
      invalidate();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Could not save opening balance",
        description: error instanceof Error ? error.message : "Please try again.",
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
      setEditingAccountId(saved.id);
      setAddingAccount(false);
      invalidate();
      toast({ title: editingAccountId ? "Account updated" : "Account added" });
      // Came here from "Record this month" to sort out an account — hand the
      // treasurer straight back so they can carry on.
      if (new URLSearchParams(window.location.search).get("from") === "contributions") {
        navigate("/contributions");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save account",
        description: error instanceof Error ? error.message : "Check the name and try again.",
      });
    }
  };

  const handleAccountDelete = async (id: number) => {
    if (!confirm(`Remove this bank account from "${budgetName}"? Accounts with transaction history cannot be removed.`)) return;
    try {
      await deleteAccount.mutateAsync({ id });
      if (selectedAccountId === id) setSelectedAccountId(null);
      invalidate();
      toast({ title: "Account removed" });
    } catch {
      toast({ variant: "destructive", title: "Could not remove account", description: "Accounts with transaction history must be kept." });
    }
  };

  const startAddingAccount = () => {
    setAddingAccount(true);
    setEditingAccountId(null);
    setAccountNameDraft("");
    setAccountNumberDraft("");
  };

  const startEditingSelectedAccount = () => {
    if (!selectedBankAccount) return;
    setAddingAccount(false);
    setEditingAccountId(selectedBankAccount.id);
    setAccountNameDraft(selectedBankAccount.name);
    setAccountNumberDraft(selectedBankAccount.accountNumber ?? "");
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
      const parent = newCategoryParentId === null
        ? null
        : categories?.find((row) => row.id === newCategoryParentId) ?? null;
      const response = await fetch("/api/budget-categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          budgetAmount: 0,
          // A child takes its group's tier: the ranking is what the group is
          // worth against other groups, and asking again per ledger invites
          // two answers to one question. A new group starts in the middle
          // rather than at 1 — everything added in passing was being declared
          // must-pay, which is a claim nobody made.
          priority: parent?.priority ?? 3,
          color: parent?.color ?? "#6B7280",
          ...(parent ? { parentId: parent.id } : {}),
        }),
      });
      if (!response.ok) throw new Error("Could not create category");
      const category = await response.json();
      setExpenseCategory(category.name);
      setNewCategoryName("");
      setNewCategoryParentId(null);
      setShowCategoryCreator(false);
      queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      toast({ title: "Category added", description: `${category.name} is ready to use.` });
    } catch {
      toast({ variant: "destructive", title: "Could not add category", description: "Please try again." });
    } finally {
      setAddingCategory(false);
    }
  };

  /**
   * What changes between one posting and the next. The mode, the date and the
   * people stay: a sitting is one day on one account, and re-choosing them for
   * every line is the friction that made recording a whole day unappealing.
   */
  const resetForNextEntry = () => {
    setAmount("");
    setDescription("");
    setDepositorAmounts({});
    setExpenseCategory("");
    setWithdrawalDestinationKind("category");
    setTransferGoalId(null);
    setBankTransferDestinationId(null);
    setNewCategoryName("");
    setShowCategoryCreator(false);
    setWithdrawPartyId("none");
    setRepayingPartyId("none");
  };

  const resetForm = () => {
    resetForNextEntry();
    setDate(new Date().toISOString().split("T")[0]);
    setDepositorIds(!isSharedWorkspace && user?.id ? [user.id] : []);
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(!isSharedWorkspace ? user?.id ?? null : JOINT_BANK_ID);
    setTransferDirection("to_savings");
    setEditingTransaction(null);
    setSitting(null);
    setMode(null);
  };

  /**
   * End one posting: either close the form, or clear it for the next and count
   * what was just recorded. Called from every branch of the submit handler, so
   * no path can close the form behind your back mid-sitting.
   */
  const finishEntry = (keepOpen: boolean, recorded: { amount: number; direction: "in" | "out" }) => {
    if (!keepOpen) {
      resetForm();
      return;
    }
    setEditingTransaction(null);
    resetForNextEntry();
    setSitting((previous) => ({
      count: (previous?.count ?? 0) + 1,
      inflow: (previous?.inflow ?? 0) + (recorded.direction === "in" ? recorded.amount : 0),
      outflow: (previous?.outflow ?? 0) + (recorded.direction === "out" ? recorded.amount : 0),
    }));
  };

  const openMode = (m: "deposit" | "disbursement" | "transfer" | "bank_transfer") => {
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
      : tx.type === "deposit" ? "deposit" : "disbursement";
    setEditingTransaction(tx);
    setMode(transactionMode);
    setAmount(String(tx.amount));
    setDescription(transactionMode === "transfer"
      ? tx.description.replace(/^Transfer (?:to|from) savings —\s*/, "")
      : tx.description);
    setDate(tx.date);
    // This editor works in member ids, so portions credited to a contributor
    // recorded by name are not editable here. They are skipped rather than
    // silently turned into somebody else's.
    const splitIds = tx.contributorSplits
      ?.map((split) => split.userId)
      .filter((userId): userId is string => typeof userId === "string") ?? [];
    setDepositorIds(transactionMode === "deposit"
      ? splitIds.length > 0 ? splitIds : tx.madeById ? [tx.madeById] : []
      : []);
    setDepositorAmounts(Object.fromEntries(
      (tx.contributorSplits ?? [])
        .filter((split) => typeof split.userId === "string")
        .map((split) => [split.userId as string, String(split.amount)]),
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

  const handleSubmit = async (e?: React.FormEvent, { keepOpen = false }: { keepOpen?: boolean } = {}) => {
    e?.preventDefault();
    if (!mode || !amount || !date || ((mode === "deposit" || mode === "transfer" || mode === "bank_transfer") && !description.trim())) {
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

    // Clearing the amount on an existing posting means zero, not
    // "unfinished". A line that turned out to be reversed is still a line
    // that happened, and deleting the row loses the reconciliation with it.
    // On a new posting an empty field stays an empty field: saving one
    // silently as zero would be a way to create rows by accident.
    const total = amount.trim() === "" && editingTransaction ? 0 : readAmount(amount);
    if (total === null || total < 0) {
      toast({
        variant: "destructive",
        title: "Enter a valid KES amount",
        description: "Use zero or more, with up to two decimal places.",
      });
      return;
    }
    if (mode === "transfer" && !Number.isInteger(total)) {
      toast({
        variant: "destructive",
        title: "Use whole KES for savings",
        description: "Savings-goal transfers currently use whole shillings.",
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

    if (mode === "deposit" && isSharedWorkspace && depositorIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Choose who is depositing",
        description: "Pick the member whose money this is — select more than one to split it.",
      });
      return;
    }

    if (mode === "deposit" && isMultiDepositor) {
      const splitAmounts = depositorIds.map((id) => parseBankAmount(depositorAmounts[id] || ""));
      if (splitAmounts.some((portion) => portion === null || portion < 0)) {
        toast({
          variant: "destructive",
          title: "Enter every depositor's amount",
          description: "Each portion must be zero or more, with up to two decimal places.",
        });
        return;
      }
      const validSplitAmounts = splitAmounts as number[];
      const splitTotal = validSplitAmounts.reduce((sum, portion) => sum + portion, 0);
      if (validSplitAmounts.reduce((sum, portion) => sum + toCents(portion), 0) !== toCents(total)) {
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
          finishEntry(false, { amount: total, direction: transferDirection === "to_savings" ? "out" : "in" });
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
        finishEntry(keepOpen, { amount: total, direction: transferDirection === "to_savings" ? "out" : "in" });
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
        finishEntry(keepOpen, { amount: total, direction: "out" });
        invalidate();
        return;
      }
      if (editingTransaction) {
        const contributorSplits = depositorIds.length > 1
          ? depositorIds.map((userId) => ({
              userId,
              amount: parseBankAmount(depositorAmounts[userId] || "") ?? 0,
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
            ...(mode === "deposit" && repayingParty ? { settlesContributorId: repayingParty.id } : {}),
            ...(mode === "deposit" && isBorrowing ? { isBorrowing: true } : {}),
            ...(mode === "deposit" && !repayingParty && !isBorrowing && contributorSplits.length === 0 ? { incomeSourceId } : {}),
            ...(mode === "deposit" && depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            ...(mode === "disbursement" ? { expenseCategory, destinationKind: sentDestinationKind } : {}),
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
                amount: parseBankAmount(depositorAmounts[userId] || "") ?? 0,
              })),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
              accountId: selectedAccountId ?? undefined,
            },
          });
        } else {
          // Single named depositor or The group (null)
          const madeById = !isSharedWorkspace ? user?.id : depositorIds.length === 1 ? depositorIds[0] : null;
          await createDeposit.mutateAsync({
            data: {
              amount: total,
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
      } else {
        await createDisbursement.mutateAsync({
          data: {
            amount: total,
            description: description.trim() || lentToParty?.name || expenseCategory,
            date,
            madeById: !isSharedWorkspace ? user?.id : withdrawerId,
            accountId: selectedAccountId ?? undefined,
            // A loan out has no category, because it is not a cost. That is
            // what keeps it out of every spending total.
            ...(isLendingOut
              ? { isLending: true }
              : { expenseCategory, destinationKind: sentDestinationKind }),
          },
        });
        toast({ title: "Disbursement recorded" });
      }
      // Read before finishEntry, which clears the form. Asking after an edit
      // would move the balance a second time for one payment.
      const wasNew = !editingTransaction;
      const paidParty = mode === "disbursement" && withdrawalDestinationKind === "party" ? selectedParty : null;
      const lentTo = mode === "disbursement" && isLendingOut ? lentToParty : null;
      const repaidBy = mode === "deposit" ? repayingParty : null;
      const borrowedAgainst = mode === "deposit" ? borrowTarget : null;
      const borrowedFrom = borrowedFromParty;
      finishEntry(keepOpen, { amount: total, direction: mode === "deposit" ? "in" : "out" });
      if (wasNew && lentTo) offerLendingIncrease(lentTo, total);
      else if (wasNew && repaidBy) offerBalanceChange(repaidBy, total, "owedToUs");
      else if (wasNew && borrowedAgainst?.kind === "debt") offerDebtIncrease(borrowedAgainst.name, total);
      else if (wasNew && borrowedAgainst?.kind === "party" && borrowedFrom) offerBorrowedFromParty(borrowedFrom, total);
      else if (wasNew && paidParty) offerBalanceChange(paidParty, total, "owedByUs");
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save transaction." });
    }
  };

  const handleDelete = async (tx: EditableTransaction) => {
    if (!canManageAccount) {
      toast({
        variant: "destructive",
        title: "Admin access required",
        description: `Only an owner or admin can delete a shared bank transaction from "${budgetName}".`,
      });
      return;
    }
    const deletesExpense = tx.expenseId != null;
    if (!confirm(deletesExpense
      ? `Delete this expense from "${budgetName}"? Its bank funding transaction will also be removed.`
      : `Delete this transaction from "${budgetName}"?`)) return;
    try {
      if (deletesExpense) {
        await deleteExpense.mutateAsync({ id: tx.expenseId! });
      } else {
        await deleteTx.mutateAsync({ id: tx.id });
      }
      toast({ title: deletesExpense ? "Expense deleted" : "Transaction deleted" });
      invalidate();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: deletesExpense ? "Could not delete expense" : "Could not delete transaction",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const isPending = createDeposit.isPending || createDisbursement.isPending || updateTx.isPending ||
    transferToSavings.isPending || transferFromSavings.isPending || transferBankToBank.isPending || addingCategory;
  const outgoingAmount = readAmount(amount);
  const isOutgoingTransaction = mode === "disbursement" ||
    mode === "bank_transfer" || (mode === "transfer" && transferDirection === "to_savings");
  // The balance the account will hold once this posting is saved, shown while
  // the amount is still being typed. Incoming money is projected too: somebody
  // recording a day works down to the closing balance on their statement, and
  // a figure that only moves for withdrawals cannot be worked down to.
  const projectedBalance = account &&
    outgoingAmount !== null &&
    outgoingAmount > 0
    ? getProjectedBalanceAfterPosting(
        account.balance,
        outgoingAmount,
        isOutgoingTransaction ? "out" : "in",
        editingTransaction
          ? { amount: editingTransaction.amount, type: editingTransaction.type }
          : null,
      )
    : null;

  // Spending lands on a category that holds no subcategories: a category with
  // children is a heading, and its spending is theirs added up, so neither
  // picker offers one.
  /**
   * Everybody money passes between you and: people and institutions alike.
   * The contributor routes predate the spec and are still read directly.
   */
  type Party = { id: number; name: string; owedToUs?: number | null; owedByUs?: number | null };
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load who you owe.");
      return response.json() as Promise<Party[]>;
    },
    staleTime: 30_000,
  });
  const owedParties = useMemo(() => parties.filter((party) => typeof party.owedByUs === "number"), [parties]);
  const owingParties = useMemo(() => parties.filter((party) => typeof party.owedToUs === "number"), [parties]);
  const selectedParty = owedParties.find((party) => String(party.id) === withdrawPartyId) ?? null;
  const repayingParty = repayingPartyId.startsWith("borrow:")
    ? null
    : owingParties.find((party) => String(party.id) === repayingPartyId) ?? null;
  /**
   * Money borrowed, arriving in the account. The same select, the opposite
   * meaning: a loan paid out to you is not earnings either, so it is left out
   * of every figure that counts money in. What it was borrowed against is
   * optional — naming it only means the balance can be offered afterwards.
   */
  const borrowTarget: { kind: "none" } | { kind: "debt"; name: string } | { kind: "party"; id: number } | null =
    repayingPartyId === "borrow:none"
      ? { kind: "none" }
      : repayingPartyId.startsWith("borrow:debt:")
        ? { kind: "debt", name: repayingPartyId.slice("borrow:debt:".length) }
        : repayingPartyId.startsWith("borrow:party:")
          ? { kind: "party", id: Number(repayingPartyId.slice("borrow:party:".length)) }
          : null;
  const isBorrowing = borrowTarget !== null;
  const borrowedFromParty = borrowTarget?.kind === "party" ? parties.find((party) => party.id === borrowTarget.id) ?? null : null;
  const trackedDebts = ((categories ?? []) as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
    .filter((row) => typeof row.debtBalance === "number");

  // The API knows two destinations. Paying a party is still a categorised
  // withdrawal — the money left and belongs to a category; who received it is
  // held beside that, not instead of it.
  const sentDestinationKind = withdrawalDestinationKind === "party" || withdrawalDestinationKind === "lend" ? "category" : withdrawalDestinationKind;
  const isLendingOut = withdrawalDestinationKind === "lend";
  const lentToParty = isLendingOut ? parties.find((party) => String(party.id) === withdrawPartyId) ?? null : null;

  const createParty = async ({ owing, asLender = false }: { owing: boolean; asLender?: boolean }) => {
    const name = newPartyName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Who is it?", description: "Give the person or institution a name." });
      return;
    }
    const owed = readAmount(newPartyOwed || "0");
    if (owed === null || owed < 0) {
      toast({ variant: "destructive", title: "What is owed?", description: "Enter zero or more." });
      return;
    }
    setAddingParty(true);
    try {
      const response = await fetch("/api/contributors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind: newPartyIsInstitution ? "institution" : "person",
          // Which way it stands between you is the only difference.
          ...(owing ? { owedToUs: toMoney(owed) } : { owedByUs: toMoney(owed) }),
        }),
      });
      const created = (await response.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!response.ok || !created.id) throw new Error(created.error ?? "Could not add them.");
      // Awaited: the picker and the settlement prompt both read this list.
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
      // A lender is somebody you owe, so it writes the same column as
      // paying one — it is only the selection afterwards that differs.
      if (asLender) setRepayingPartyId(`borrow:party:${created.id}`);
      else if (owing) setRepayingPartyId(String(created.id));
      else setWithdrawPartyId(String(created.id));
      setNewPartyName("");
      setNewPartyOwed("");
      setNewPartyIsInstitution(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add them", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setAddingParty(false);
    }
  };

  /**
   * Offer to move a balance after the money has moved. Asked rather than
   * applied: the posting can be edited or deleted afterwards, and a balance
   * moved by itself would have to be moved back on every one of those paths.
   */
  const offerBalanceChange = (party: Party, amount: number, direction: "owedByUs" | "owedToUs") => {
    const owed = direction === "owedByUs" ? party.owedByUs : party.owedToUs;
    if (typeof owed !== "number" || owed <= 0 || amount <= 0) return;
    const paid = toMoney(amount);
    const remaining = Math.max(0, owed - paid);
    const question = direction === "owedByUs"
      ? `Take ${formatKes(paid)} off what you owe ${party.name}? That leaves ${formatKes(remaining)}.`
      : `Take ${formatKes(paid)} off what ${party.name} owes you? That leaves ${formatKes(remaining)}.`;
    if (!window.confirm(question)) return;
    void (async () => {
      try {
        const response = await fetch(`/api/contributors/${party.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [direction]: remaining }),
        });
        if (!response.ok) throw new Error("Could not update the balance.");
        await queryClient.invalidateQueries({ queryKey: ["parties"] });
      } catch (error) {
        toast({ variant: "destructive", title: "Could not update the balance", description: error instanceof Error ? error.message : "Please try again." });
      }
    })();
  };

  /**
   * Offer to add what was borrowed to a tracked debt. The mirror of
   * offerBalanceChange, and asked for the same reason: the balance is a stored
   * number and the deposit can be edited or deleted afterwards. A brand-new
   * loan starts at nothing outstanding, so zero is allowed here.
   */
  const offerDebtIncrease = (categoryName: string, amount: number) => {
    const name = categoryName.trim().toLocaleLowerCase();
    const debt = ((categories ?? []) as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
      .find((row) => row.name.trim().toLocaleLowerCase() === name && typeof row.debtBalance === "number");
    const owed = debt?.debtBalance;
    if (!debt || typeof owed !== "number" || amount <= 0) return;
    const borrowed = toMoney(amount);
    if (!window.confirm(`Add ${formatKes(borrowed)} to ${debt.name}? That makes it ${formatKes(owed + borrowed)}.`)) return;
    void (async () => {
      try {
        const response = await fetch(`/api/budget-categories/${debt.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ debtBalance: owed + borrowed }),
        });
        if (!response.ok) throw new Error("Could not update the debt.");
        await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      } catch (error) {
        toast({ variant: "destructive", title: "Could not update the debt", description: error instanceof Error ? error.message : "Please try again." });
      }
    })();
  };

  /**
   * Offer to add what was lent to what somebody owes you. Somebody with
   * nothing tracked on that side starts from zero rather than from nowhere: a
   * first loan is exactly when nothing is tracked.
   */
  const offerLendingIncrease = (party: Party, amount: number) => {
    if (amount <= 0) return;
    const owed = typeof party.owedToUs === "number" ? party.owedToUs : 0;
    const lent = toMoney(amount);
    if (!window.confirm(`Add ${formatKes(lent)} to what ${party.name} owes you? That makes it ${formatKes(owed + lent)}.`)) return;
    void (async () => {
      try {
        const response = await fetch(`/api/contributors/${party.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owedToUs: owed + lent }),
        });
        if (!response.ok) throw new Error("Could not update the balance.");
        await queryClient.invalidateQueries({ queryKey: ["parties"] });
      } catch (error) {
        toast({ variant: "destructive", title: "Could not update the balance", description: error instanceof Error ? error.message : "Please try again." });
      }
    })();
  };

  /** Offer to add what was borrowed to what you owe a party. */
  const offerBorrowedFromParty = (party: Party, amount: number) => {
    if (amount <= 0) return;
    const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;
    const borrowed = toMoney(amount);
    if (!window.confirm(`Add ${formatKes(borrowed)} to what you owe ${party.name}? That makes it ${formatKes(owed + borrowed)}.`)) return;
    void (async () => {
      try {
        const response = await fetch(`/api/contributors/${party.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owedByUs: owed + borrowed }),
        });
        if (!response.ok) throw new Error("Could not update the balance.");
        await queryClient.invalidateQueries({ queryKey: ["parties"] });
      } catch (error) {
        toast({ variant: "destructive", title: "Could not update the balance", description: error instanceof Error ? error.message : "Please try again." });
      }
    })();
  };

  const categoryTree = useMemo(
    () => buildCategoryTree((categories ?? []) as unknown as CategoryRow[]),
    [categories],
  );
  const reconcileSearch = useCategorySearch(categoryTree);
  const withdrawSearch = useCategorySearch(categoryTree);

  // Reconciling compares Jamvi's balance with the statement's. A positive
  // difference means Jamvi holds more than the bank does: money left the
  // account with nothing recorded against it.
  const parsedStatementBalance = parseBalanceFigure(statementBalance);
  const reconcileDifference = parsedStatementBalance !== null && account
    ? Math.round((account.balance - parsedStatementBalance) * 100) / 100
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
            ? "Track money going in and out of your Shared group."
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
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isCreatingAccount ? "Create a bank account" : "Manage bank accounts"}
                </p>
                <ListEditButton editor={accountEditor} canManage={canManageAccount} label="Rename or remove bank accounts" />
              </div>

              {accountEditor.editing ? (
                <div className="space-y-2">
                  <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
                    {accounts.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                        <RemoveRowButton editor={accountEditor} id={item.id} name={item.name} />
                        <EditableName editor={accountEditor} id={item.id} name={item.name} className="flex-1 text-sm font-medium" />
                      </li>
                    ))}
                  </ul>
                  <ListEditorFooter
                    editor={accountEditor}
                    addPlaceholder="Add a bank account by name"
                    summary="An account with transactions cannot be removed — move or delete its transactions first."
                  />
                </div>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {isCreatingAccount
                      ? "Every bank account is created by you. Give it a clear name such as M-Pesa wallet, KCB salary, or Savings."
                      : "Edit the selected account or add another separate bank account."}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input data-testid="input-bank-account-name" value={accountNameDraft} onChange={(event) => setAccountNameDraft(event.target.value)} placeholder={isCreatingAccount ? "e.g. Family M-Pesa" : "Account name"} maxLength={80} />
                    <Input data-testid="input-bank-account-number" value={accountNumberDraft} onChange={(event) => setAccountNumberDraft(event.target.value)} placeholder="Account number (optional)" maxLength={40} />
                    <Button type="button" data-testid="button-save-bank-account" onClick={handleAccountSave} disabled={createAccount.isPending || updateAccount.isPending}>{isCreatingAccount ? "Add account" : "Save changes"}</Button>
                    {!isCreatingAccount && <Button type="button" variant="outline" data-testid="button-add-bank-account" onClick={startAddingAccount}>Add another</Button>}
                    {addingAccount && selectedBankAccount && <Button type="button" variant="outline" data-testid="button-cancel-bank-account-edit" onClick={startEditingSelectedAccount}>Cancel</Button>}
                  </div>
                  {selectedAccountId && <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" data-testid="button-rename-bank-account" onClick={startEditingSelectedAccount}>Edit selected account</Button>
                    <Button type="button" size="sm" variant="destructive" data-testid="button-remove-bank-account" onClick={() => handleAccountDelete(selectedAccountId)} disabled={deleteAccount.isPending}>Remove selected</Button>
                  </div>}
                </>
              )}
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
                <p className="whitespace-nowrap font-display text-[clamp(1.8rem,8vw,2.25rem)] font-bold leading-tight" data-testid="bank-balance">{formatKes(account?.balance ?? 0)}</p>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="opacity-75">
                    Opening balance: <span className="font-semibold">{formatKes(account?.openingBalance ?? 0)}</span>
                    {account?.openingBalanceDate ? ` as of ${formatDate(account.openingBalanceDate)}` : ""}
                  </span>
                  {canManageAccount && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 rounded-lg bg-primary-foreground/15 px-3 text-primary-foreground hover:bg-primary-foreground/25"
                        onClick={openOpeningBalanceEditor}
                        data-testid="button-edit-opening-balance"
                      >
                        Edit starting balance
                      </Button>
                      {accounts.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-lg bg-primary-foreground/15 px-3 text-primary-foreground hover:bg-primary-foreground/25"
                          onClick={openReconcile}
                          data-testid="button-check-against-statement"
                        >
                          Check against statement
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              <div className="flex gap-6 pt-2 border-t border-primary-foreground/20">
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total In</p>
                   <p className="whitespace-nowrap text-lg font-semibold font-mono">{formatKes(account?.totalDeposits ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Total Out</p>
                   <p className="whitespace-nowrap text-lg font-semibold font-mono">{formatKes(account?.totalDisbursements ?? 0)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showReconcile && (
        <Card className="border-none shadow-md bg-accent/20" data-testid="bank-reconcile-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">Check against your statement</CardTitle>
            <CardDescription>
              Type the closing balance your bank shows for {account?.accountName ?? "this account"}. Jamvi will tell you
              what it cannot account for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="bank-statement-balance">
                Statement closing balance (KES)
              </label>
              <Input
                id="bank-statement-balance"
                data-testid="input-statement-balance"
                inputMode="text"
                placeholder="e.g. 9400"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                className="h-12 text-lg bg-card"
                autoFocus
              />
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-sm text-muted-foreground">Jamvi has</span>
                <span className="text-lg font-semibold text-foreground">{formatKes(account?.balance ?? 0)}</span>
              </div>
              {reconcileDifference !== null && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-sm text-muted-foreground">Your statement has</span>
                  <span className="text-lg font-semibold text-foreground">{formatKes(parsedStatementBalance ?? 0)}</span>
                </div>
              )}
            </div>

            {reconcileDifference === null ? null : reconcileDifference === 0 ? (
              <p className="text-sm font-semibold text-primary" data-testid="bank-reconcile-matched">
                They match. Every shilling that left this account is recorded.
              </p>
            ) : reconcileDifference > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground" data-testid="bank-reconcile-short">
                  {formatKes(reconcileDifference)} left the account with nothing recorded against it — a fee the bank
                  took, or a posting you have not entered yet. Either way it is spending, so give it a category.
                </p>
                {(
                  <>
                  <CategorySearchInput query={reconcileSearch.query} onChange={reconcileSearch.setQuery} testId="search-reconcile-category" />
                  <select
                    data-testid="select-reconcile-category"
                    className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
                    value={reconcileCategory}
                    onChange={(e) => setReconcileCategory(e.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {/* A category holding subcategories is a heading and its
                        spending is theirs added up, so it is not offered. */}
                    {reconcileSearch.visible(reconcileCategory).map((group) => (
                      group.children.length > 0 ? (
                        <optgroup key={group.name} label={group.name}>
                          {group.children.map((child) => (
                            <option key={child} value={child}>{child}</option>
                          ))}
                        </optgroup>
                      ) : (
                        <option key={group.name} value={group.name}>{group.name}</option>
                      )
                    ))}
                  </select>
                  </>
                )}
                <Input
                  data-testid="input-reconcile-narration"
                  placeholder="What the statement calls it (default: Bank charges)"
                  value={reconcileNarration}
                  onChange={(e) => setReconcileNarration(e.target.value)}
                  className="h-12 bg-card"
                />
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setShowReconcile(false)} className="h-12 px-6">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={reconciling}
                    onClick={() => recordDifference(reconcileDifference)}
                    data-testid="button-record-difference-as-charge"
                    className="h-12 px-6"
                  >
                    {reconciling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Record {formatKes(reconcileDifference)} as spending
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will count against {reconcileCategory || "the category you pick"} like any other withdrawal.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-foreground" data-testid="bank-reconcile-over">
                  Your statement holds {formatKes(Math.abs(reconcileDifference))} more than Jamvi knows about, so this is
                  money that came in without being recorded. A charge would be the wrong answer — record the deposit
                  instead, so it can be attributed to whoever paid it.
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setShowReconcile(false)} className="h-12 px-6">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { setShowReconcile(false); openMode("deposit"); }}
                    data-testid="button-reconcile-record-deposit"
                    className="h-12 px-6"
                  >
                    Record a deposit
                  </Button>
                </div>
              </div>
            )}

            {reconcileDifference === null && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setShowReconcile(false)} className="h-12 px-6">
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  step="0.01"
                  value={openingBalanceDraft}
                  onChange={(e) => setOpeningBalanceDraft(e.target.value)}
                  className="h-12 text-lg bg-card"
                  autoFocus
                />
                <label className="text-sm font-semibold text-foreground" htmlFor="bank-opening-balance-date">
                  Balance date
                </label>
                <Input
                  id="bank-opening-balance-date"
                  data-testid="input-opening-balance-date"
                  type="date"
                  value={openingBalanceDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setOpeningBalanceDate(e.target.value)}
                  className="h-12 bg-card"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The date marks when this starting amount applied. Current balance = opening balance + deposits − withdrawals.
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
            To savings
          </Button>
          <Button
            data-testid="button-bank-transfer"
            onClick={() => openMode("bank_transfer")}
            variant="secondary"
            className="h-12 px-4 rounded-xl"
            disabled={!canManageAccount || accounts.length < 2}
          >
            Between accounts
          </Button>
        </div>
      ) : (
        <Card ref={formCardRef} className="border-none shadow-md bg-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-display">
              {editingTransaction
                ? `Edit ${mode === "deposit" ? "Deposit" : mode === "transfer" ? "Transfer" : "Withdrawal"}`
                : mode === "deposit" ? "Add Money to Account" : mode === "transfer" ? "Move Money To or From Savings" : mode === "bank_transfer" ? "Move Money Between Your Accounts" : "Take Money Out"}
            </CardTitle>
            <CardDescription>
              {mode === "deposit"
                ? `Money going into ${account?.accountName ?? "this bank account"}.`
                : mode === "transfer"
                  ? `Move ${isSharedWorkspace ? "Shared group" : "Personal budget"} funds between this account and a savings goal.`
                  : mode === "bank_transfer"
                    ? "Record an internal move. It changes only these two bank balances and is not income or spending."
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
                  {accounts.length === 0 && canManageAccount && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      data-testid="button-create-account-from-transaction"
                      onClick={startAddingAccount}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Create bank account
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {accounts.length === 0
                      ? canManageAccount
                        ? "Create an account above, then return here to record the transaction."
                        : "Ask an owner or admin to create a bank account before recording a deposit."
                      : "This account will receive the deposit or be reduced by the withdrawal."}
                  </p>
                  {selectedAccountId && account && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3" data-testid="transaction-account-balance">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-sm font-medium text-foreground">
                          {account.accountName} current balance
                        </span>
                        <span className="text-lg font-semibold text-foreground">{formatKes(account.balance)}</span>
                      </div>
                      {projectedBalance !== null && (
                        <div
                          className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                          data-testid="bank-projected-balance"
                        >
                          <span className="text-sm text-muted-foreground">After this posting</span>
                          <span
                            className={`text-lg font-semibold ${
                              projectedBalance < 0
                                ? "text-destructive"
                                : isOutgoingTransaction
                                  ? "text-foreground"
                                  : "text-primary"
                            }`}
                          >
                            {formatKes(projectedBalance)}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {projectedBalance !== null
                          ? "The balance moves as you type, so you can work down to the figure on your statement."
                          : "This is the balance before the transaction is saved."}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Amount (KES)</label>
                  <Input
                    data-testid="input-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 20000, or 1200+800+450"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    className="h-12 text-lg bg-card"
                  />
                  {isAmountExpression(amount) && outgoingAmount !== null ? (
                    <p className="text-sm font-semibold text-primary" data-testid="amount-resolved">
                      = {formatKes(outgoingAmount)}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                   <label className="text-sm font-semibold text-foreground">{mode === "deposit" ? "Deposit date" : "Date"}</label>
                  <Input
                    data-testid="input-date"
                    type="date"
                    value={date}
                    min={isSharedWorkspace && !canManageShared ? new Date().toISOString().slice(0, 10) : undefined}
                    onChange={e => setDate(e.target.value)}
                    required
                    disabled={isSharedWorkspace && !canManageShared && editingTransaction !== null}
                    className="h-12 bg-card"
                  />
                  {isSharedWorkspace && !canManageShared && editingTransaction === null && (
                    <p className="text-xs text-muted-foreground">
                      Shared-budget members can record bank deposits for today only.
                    </p>
                  )}
                  {isSharedWorkspace && !canManageShared && editingTransaction !== null && (
                    <p className="text-xs text-muted-foreground">
                      Members can correct this deposit today, but only an admin can change its date.
                    </p>
                  )}
                </div>
                {isOutgoingTransaction && projectedBalance !== null && projectedBalance < 0 && (
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
                {mode === "disbursement" && (withdrawalDestinationKind === "party" || isLendingOut) ? (
                  <div className="space-y-2 sm:col-span-2" data-testid="party-picker">
                    <label className="text-sm font-semibold text-foreground">{isLendingOut ? "Who are you lending to?" : "Who are you paying?"}</label>
                    <select
                      className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
                      value={withdrawPartyId}
                      onChange={(e) => setWithdrawPartyId(e.target.value)}
                      data-testid="select-party"
                    >
                      <option value="none">Choose somebody</option>
                      {(isLendingOut ? parties : owedParties).map((party) => (
                        <option key={party.id} value={String(party.id)}>
                          {party.name} — {isLendingOut ? `owes you ${formatKes(party.owedToUs ?? 0)}` : `owe ${formatKes(party.owedByUs ?? 0)}`}
                        </option>
                      ))}
                    </select>
                    {/* The only place to say somebody is owed. Offered whether
                        or not anybody is recorded: a way in hidden behind the
                        thing it creates is no way in at all. */}
                    <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row" data-testid="add-party-form">
                      <Input
                        placeholder="e.g. Mwangi, or KCB"
                        value={newPartyName}
                        onChange={(e) => setNewPartyName(e.target.value)}
                        className="h-10 bg-card"
                        data-testid="input-new-party-name"
                      />
                      <Input
                        placeholder="Owed"
                        value={newPartyOwed}
                        onChange={(e) => setNewPartyOwed(e.target.value)}
                        className="h-10 w-full bg-card sm:w-32"
                        data-testid="input-new-party-owed"
                      />
                      <Button type="button" disabled={addingParty} onClick={() => void createParty({ owing: false })} className="h-10 shrink-0" data-testid="button-add-party">
                        {addingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={newPartyIsInstitution}
                        onChange={(e) => setNewPartyIsInstitution(e.target.checked)}
                        data-testid="checkbox-party-institution"
                      />
                      A bank or business, not a person
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {isLendingOut
                        ? "Nothing is owed to them yet? Add them above. Once it saves, Jamvi offers to add this to what they owe you."
                        : "The category below still says what kind of cost this was. Once it saves, Jamvi offers to take the payment off what you owe."}
                    </p>
                  </div>
                ) : null}
                {mode === "disbursement" && !isLendingOut && (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-semibold text-foreground">
                      Category <span className="text-destructive">*</span>
                    </label>
                    <div className="mb-2">
                      <CategorySearchInput query={withdrawSearch.query} onChange={withdrawSearch.setQuery} testId="search-expense-category" />
                    </div>
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
                      {withdrawSearch.visible(expenseCategory).map((group) => (
                        group.children.length > 0 ? (
                          <optgroup key={group.name} label={group.name}>
                            {group.children.map((child) => (
                              <option key={child} value={child}>{child}</option>
                            ))}
                          </optgroup>
                        ) : (
                          <option key={group.name} value={group.name}>{group.name}</option>
                        )
                      ))}
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
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={newCategoryParentId === null ? "default" : "outline"}
                            onClick={() => setNewCategoryParentId(null)}
                            data-testid="button-new-category-parent-top-level"
                          >
                            Its own group
                          </Button>
                          {categoryTree.map((group) => {
                            const parent = categories?.find((row) => row.name === group.name);
                            if (!parent) return null;
                            return (
                              <Button
                                key={parent.id}
                                type="button"
                                size="sm"
                                variant={newCategoryParentId === parent.id ? "default" : "outline"}
                                onClick={() => setNewCategoryParentId(parent.id)}
                                data-testid={`button-new-category-parent-${group.name}`}
                              >
                                Under {group.name}
                              </Button>
                            );
                          })}
                        </div>
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
                  {account && bankTransferDestinationId && outgoingAmount !== null && outgoingAmount > 0 && (
                    <div className="rounded-lg border bg-card p-3 text-sm" data-testid="bank-transfer-preview">
                      <strong>{account.accountName}</strong>: {formatKes(account.balance)} → {formatKes(account.balance - outgoingAmount)}
                      <br />
                      <strong>{accounts.find((candidate) => candidate.id === bankTransferDestinationId)?.name}</strong> receives {formatKes(outgoingAmount)}.
                    </div>
                  )}
                </div>}

                {/* Somebody paying back what they owe. Asked before who
                    deposited it, because the answer changes what the money
                    means: a repayment is not income. */}
                {mode === "deposit" ? (
                  <div className="space-y-2 sm:col-span-2" data-testid="repayment-picker">
                    <label className="text-sm font-semibold text-foreground">What kind of money is this?</label>
                    <select
                      className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base"
                      value={repayingPartyId}
                      onChange={(e) => setRepayingPartyId(e.target.value)}
                      data-testid="select-repayment"
                    >
                      <option value="none">Ordinary money in</option>
                      {owingParties.length > 0 ? (
                        <optgroup label="Somebody paying you back">
                          {owingParties.map((party) => (
                            <option key={party.id} value={String(party.id)}>
                              {party.name} — owes you {formatKes(party.owedToUs ?? 0)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {/* Borrowed money: the same deposit, the opposite
                          meaning. Naming what it was borrowed against is
                          optional — it is not income either way. */}
                      <optgroup label="Borrowed — not income">
                        {trackedDebts.map((debt) => (
                          <option key={`borrow-debt-${debt.id}`} value={`borrow:debt:${debt.name}`}>
                            Borrowed — {debt.name}
                          </option>
                        ))}
                        {parties.map((party) => (
                          <option key={`borrow-party-${party.id}`} value={`borrow:party:${party.id}`}>
                            Borrowed from {party.name}
                          </option>
                        ))}
                        <option value="borrow:none">Borrowed — from somewhere else</option>
                      </optgroup>
                    </select>
                    <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row" data-testid="add-debtor-form">
                      <Input
                        placeholder="e.g. Kamau"
                        value={newPartyName}
                        onChange={(e) => setNewPartyName(e.target.value)}
                        className="h-10 bg-card"
                        data-testid="input-new-debtor-name"
                      />
                      <Input
                        placeholder="Owes you"
                        value={newPartyOwed}
                        onChange={(e) => setNewPartyOwed(e.target.value)}
                        className="h-10 w-full bg-card sm:w-32"
                        data-testid="input-new-debtor-owed"
                      />
                      <Button type="button" disabled={addingParty} onClick={() => void createParty({ owing: true })} className="h-10 shrink-0" data-testid="button-add-debtor">
                        {addingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                    {isBorrowing ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row" data-testid="add-lender-form">
                        <Input
                          placeholder="Who lent it? e.g. Mwangi or KCB"
                          value={newPartyName}
                          onChange={(e) => setNewPartyName(e.target.value)}
                          className="h-10 bg-card"
                          data-testid="input-new-lender-name"
                        />
                        <Input
                          placeholder="Already owed"
                          value={newPartyOwed}
                          onChange={(e) => setNewPartyOwed(e.target.value)}
                          className="h-10 w-full bg-card sm:w-32"
                          data-testid="input-new-lender-owed"
                        />
                        <Button type="button" disabled={addingParty} onClick={() => void createParty({ owing: false, asLender: true })} className="h-10 shrink-0" data-testid="button-add-lender">
                          {addingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                        </Button>
                      </div>
                    ) : null}
                    {repayingParty ? (
                      <p className="text-xs text-muted-foreground">
                        This will not count as income — you had the money once already, when you lent it. It still
                        shows in the account and the ledger.
                      </p>
                    ) : isBorrowing ? (
                      <p className="text-xs text-muted-foreground" data-testid="borrowing-note">
                        This will not count as income — a loan is not earnings, and you will pay it back. It still
                        shows in the account and the ledger.
                        {borrowTarget?.kind === "none" ? "" : " Once it saves, Jamvi offers to add it to what you owe."}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* ── DEPOSIT: who is depositing ── */}
                {mode === "deposit" && !repayingParty && !isBorrowing && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        {isSharedWorkspace ? "Whose money is this?" : "Deposited by"}
                        {canManageShared && <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>}
                      </label>
                      {!isSharedWorkspace ? (
                        <p className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                          This deposit will be recorded in your name and kept in your Personal budget.
                        </p>
                      ) : <div className="grid grid-cols-2 gap-2" data-testid="deposit-attribution">
                        {/* Named member chips — a deposit always belongs to a
                            person, so there is no GROUP_ATTRIBUTION option here. */}
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
                                 setDepositSourceKind(null);
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
                        const total = parseBankAmount(amount) ?? 0;
                        const splitTotal = depositorIds.reduce((s, id) => s + (parseBankAmount(depositorAmounts[id] || "") ?? 0), 0);
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
                                     min="0"
                                    step="0.01"
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

                    {/* Income source — saved sources for one named depositor, or Other for The group */}
                    {(singleDepositorId || depositorIds.length === 0) && (
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
                          {singleDepositorId
                            ? "Select a saved stream or choose Other and add a narration."
                            : "This deposit is attributed to the The group. Choose Other to explain a non-salary source."}
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
                        {/* The group — default selection */}
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
                          The group
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
                      <div className="grid grid-cols-3 gap-2">
                        <Button type="button" variant={withdrawalDestinationKind === "category" ? "default" : "outline"} onClick={() => setWithdrawalDestinationKind("category")}>Budget category</Button>
                        <Button
                          type="button"
                          variant={withdrawalDestinationKind === "party" ? "default" : "outline"}
                          onClick={() => setWithdrawalDestinationKind("party")}
                          data-testid="button-dest-party"
                        >
                          Someone I owe
                        </Button>
                        <Button type="button" variant={withdrawalDestinationKind === "other" ? "default" : "outline"} onClick={() => setWithdrawalDestinationKind("other")}>Other</Button>
                        <Button
                          type="button"
                          variant={withdrawalDestinationKind === "lend" ? "default" : "outline"}
                          onClick={() => { setWithdrawalDestinationKind("lend"); setExpenseCategory(""); setWithdrawPartyId("none"); }}
                          data-testid="button-dest-lend"
                        >
                          Lending it out
                        </Button>
                      </div>
                      {withdrawalDestinationKind === "lend" && (
                        <p className="text-xs text-muted-foreground" data-testid="lending-note">
                          No category: lending is not spending. You expect it back, so it counts against no budget — it
                          leaves the account and becomes owed to you. Once it saves, Jamvi offers to add it to what they owe.
                        </p>
                      )}
                      {withdrawalDestinationKind === "other" && (
                        <p className="text-xs text-muted-foreground">A narration is required for an Other destination.</p>
                      )}
                    </div>

                  </>
                )}
              </div>

              {/* A charge or a transfer has no account card to carry the
                  projection, so the falling balance is shown here instead. */}
              {projectedBalance !== null && mode !== "deposit" && mode !== "disbursement" && (
                <p className="text-xs text-muted-foreground" data-testid="bank-projected-balance-compact">
                  Balance after this posting: {formatKes(projectedBalance)}
                </p>
              )}

              {sitting !== null && (
                <p className="text-xs text-muted-foreground" data-testid="bank-sitting-tally">
                  {sitting.count} {sitting.count === 1 ? "posting" : "postings"} recorded in this sitting
                  {sitting.outflow > 0 ? ` · ${formatKes(sitting.outflow)} out` : ""}
                  {sitting.inflow > 0 ? ` · ${formatKes(sitting.inflow)} in` : ""}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={resetForm} className="h-12 px-6">
                  {sitting !== null ? "Done" : "Cancel"}
                </Button>
                {/* An edit is one posting by definition, so it gets no second
                    button. Everything else is likely part of a day's run. */}
                {!editingTransaction && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleSubmit(undefined, { keepOpen: true })}
                    data-testid="button-save-and-add-another"
                    className="h-12 px-6"
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Save and add another
                  </Button>
                )}
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
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transactions</h2>
            <ListEditButton editor={txEditor} canManage={canManageAccount} label="Remove several transactions" />
            {canManageAccount && !txEditor.editing ? (
              <button
                type="button"
                onClick={() => setMoveDayOpen(true)}
                className="text-xs font-semibold text-primary hover:underline"
                data-testid="bank-move-day"
              >
                Move a day
              </button>
            ) : null}
          </div>
        <Card className="border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {account.transactions.map((tx) => {
              const isDeposit = tx.type === "deposit";
              const isTransfer = !!tx.savingsGoalId;
              const isBankTransfer = !!tx.bankTransferId;
              const attribution = madeByLabel(tx.madeByName, tx.type);
              const removable = canManageAccount || canEditTransaction(tx);
              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  className={`p-4 sm:p-5 flex items-center justify-between gap-4 transition-colors ${txEditor.editing && txEditor.isRemoving(tx.id) ? "bg-destructive/5 opacity-70" : "hover:bg-muted/20"}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {txEditor.editing ? (
                      <RemoveRowButton editor={txEditor} id={tx.id} name={tx.description ?? "this transaction"} disabled={!removable} />
                    ) : null}
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
                          : !isDeposit && tx.expenseCategory ? tx.expenseCategory : tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`tx-meta-${tx.id}`}>
                        {isBankTransfer
                          ? `Internal bank transfer · ${tx.description}`
                          : isTransfer
                          ? tx.description
                          : isDeposit
                            ? `Deposited by ${attribution} · ${tx.description}`
                            : `Withdrawn by ${attribution}${tx.expenseCategory && tx.description !== tx.expenseCategory ? ` · ${tx.description}` : ""}`}
                        {account.accountName ? ` · ${account.accountName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                       <p className={`whitespace-nowrap font-display font-bold text-lg ${isDeposit ? "text-green-600" : "text-destructive"}`}>
                        {isDeposit ? "+" : "-"}{formatKes(tx.amount)}
                      </p>
                      <time
                        dateTime={tx.date}
                        data-testid={`transaction-date-${tx.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {formatDate(tx.date)}
                      </time>
                      {typeof tx.runningBalance === "number" && (
                         <p className="whitespace-nowrap text-xs text-muted-foreground" data-testid={`running-balance-${tx.id}`}>
                          Balance {formatKes(tx.runningBalance)}
                        </p>
                      )}
                    </div>
                    {!txEditor.editing && canEditTransaction(tx) && !isBankTransfer && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-edit-tx-${tx.id}`}
                      className="hover:bg-muted h-9 w-9"
                      onClick={() => openEdit(tx)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>}
                    {!txEditor.editing && canMoveTx(tx) && accounts.length > 1 && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-move-tx-${tx.id}`}
                      aria-label="Move to another account"
                      className="hover:bg-muted h-9 w-9"
                      onClick={() => setMovingTx(tx)}
                    >
                      <Repeat className="w-4 h-4" />
                    </Button>}
                    {!txEditor.editing && canManageAccount && <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-tx-${tx.id}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                      onClick={() => handleDelete(tx)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Dialog open={movingTx !== null} onOpenChange={(open) => { if (!open && !movingOne) setMovingTx(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move to which account?</DialogTitle>
              <DialogDescription>
                This takes "{movingTx?.description ?? "the entry"}" off {selectedBankAccount?.name ?? "this account"} and onto the one you choose. Both balances update.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {movingOne ? (
                <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin" />
              ) : (
                accounts.filter((item) => item.id !== selectedAccountId).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void moveOneTo(item.id, item.name)}
                    className="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
                    data-testid={`bank-move-tx-to-${item.id}`}
                  >
                    {item.name}
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={moveDayOpen} onOpenChange={(open) => { if (!open) closeMoveDay(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {!moveDayDate
                  ? "Which day needs fixing?"
                  : moveDayMode === null
                  ? "What was wrong with it?"
                  : moveDayMode === "account"
                  ? "Move to which account?"
                  : "Which date should it be under?"}
              </DialogTitle>
              <DialogDescription>
                {!moveDayDate
                  ? `Entries on ${selectedBankAccount?.name ?? "this account"}. Transfers and savings or expense-linked entries are left as they are.`
                  : moveDayMode === "date"
                  ? `Every ordinary entry on ${formatDate(moveDayDate)} is re-dated to the day you pick. Balances are as at today, so they may change.`
                  : moveDayMode === "account"
                  ? `Every ordinary entry on ${formatDate(moveDayDate)} leaves ${selectedBankAccount?.name ?? "this account"} and goes to the one you pick. Both balances update.`
                  : `${formatDate(moveDayDate)} on ${selectedBankAccount?.name ?? "this account"}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {movingDay ? (
                <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin" />
              ) : moveDayDate && moveDayMode === null ? (
                <>
                  {accounts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setMoveDayMode("account")}
                      className="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
                      data-testid="bank-move-day-mode-account"
                    >
                      Recorded under the wrong account
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { setMoveDayNewDate(moveDayDate.slice(0, 10)); setMoveDayMode("date"); }}
                    className="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
                    data-testid="bank-move-day-mode-date"
                  >
                    Recorded under the wrong date
                  </button>
                </>
              ) : moveDayDate && moveDayMode === "date" ? (
                <div className="space-y-3 pt-1">
                  <input
                    type="date"
                    value={moveDayNewDate}
                    onChange={(event) => setMoveDayNewDate(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="bank-move-day-new-date"
                  />
                  <Button type="button" className="w-full" onClick={() => void moveDayToDate()} data-testid="bank-move-day-date-save">
                    Change the date
                  </Button>
                </div>
              ) : moveDayDate ? (
                accounts.filter((item) => item.id !== selectedAccountId).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void moveDayTo(item.id, item.name)}
                    className="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
                    data-testid={`bank-move-day-to-${item.id}`}
                  >
                    {item.name}
                  </button>
                ))
              ) : (
                summariseDays((account?.transactions ?? []) as EditableTransaction[], canMoveTx).map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setMoveDayDate(day.date)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
                    data-testid={`bank-move-day-${day.date}`}
                  >
                    <span>{formatDate(day.date)}</span>
                    <span className="text-muted-foreground">{day.movable} {day.movable === 1 ? "entry" : "entries"}</span>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
        <ListEditorFooter
          editor={txEditor}
          summary={`${(account?.transactions ?? []).filter((tx: EditableTransaction) => txEditor.isRemoving(tx.id)).length} marked for deletion. A withdrawal linked to an expense removes that expense too.`}
        />
        </div>
      )}
    </div>
  );
}
