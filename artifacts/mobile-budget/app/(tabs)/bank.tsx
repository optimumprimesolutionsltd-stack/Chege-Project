import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { useListEditor } from '@/hooks/useListEditor';
import { EditableName, ListEditButton, ListEditorFooter, RemoveRowButton } from '@/components/ListEditor';
import { PageFlatList } from '@/components/PageScrollReset';
import {
  useGetJointAccount,
  useCreateDeposit,
  useCreateDisbursement,
  useUpdateJointAccountTransaction,
  useDeleteJointAccountTransaction,
  useDeleteExpense,
  useGetBudgetCategories,
  getGetBudgetCategoriesQueryKey,
  useGetMembers,
  useGetSavingsGoals,
  useCreateSavingsGoal,
  useTransferBankToSavings,
  useTransferSavingsToBank,
  useTransferBankToBank,
  getGetJointAccountQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetSavingsGoalsQueryKey,
  useUpdateJointAccountOpeningBalance,
  useGetGroup,
  useGetJointAccounts,
  useCreateJointAccount,
  useUpdateJointAccount,
  useDeleteJointAccount,
  getGetJointAccountsQueryKey,
  getGetExpensesQueryKey,
  customFetch,
} from '@workspace/api-client-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { handleLapsedError } from '@/lib/lapsedError';
import { WorkspaceIdentityRow } from '@/components/WorkspaceIdentityRow';
import { canManageBankAccount, resolveBankAccountSelection } from '@/lib/bankAccess';
import { getProjectedBalanceAfterPosting } from '@/lib/bankBalance';
import { evaluateAmountExpression, isAmountExpression } from '@/lib/amountExpression';
import { buildCategoryTree, type CategoryRow } from '@workspace/category-tree';
import { workspaceBudgetName } from '@/lib/workspaceIdentity';
import { formatDisplayDate } from '@/lib/displayFormat';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDateTime(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return (
    d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  );
}

function formatBankDate(s?: string | null): string {
  return formatDisplayDate(s);
}

type Tx = {
  id: number;
  type: string;
  amount: number;
  runningBalance?: number | null;
  description: string;
  madeById?: string | null;
  madeByName?: string | null;
  incomeSourceId?: number | null;
  expenseCategory?: string | null;
  /** The month a deposit was for, when that is not the month it arrived. */
  appliesToMonth?: number | null;
  appliesToYear?: number | null;
  savingsGoalId?: number | null;
  savingsGoalName?: string | null;
  transferDirection?: string | null;
  expenseId?: number | null;
  bankTransferId?: string | null;
  bankTransferAccountId?: number | null;
  bankTransferAccountName?: string | null;
  // userId is optional now that a portion can be credited to a contributor
  // recorded by name, who has no account to point at.
  contributorSplits?: { userId?: string; contributorId?: number; amount: number; incomeSourceId?: number | null }[];
  date: string;
  createdAt?: string | null;
};

type TxType = 'deposit' | 'disbursement' | 'transfer' | 'bank_transfer';

type MemberIncomeSource = {
  id: number;
  name: string;
};

function parseBankAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
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
  const normalized = value.trim().replace(/,/g, '');
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

function toCents(value: number): number {
  return Math.round(value * 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { shortcut } = useLocalSearchParams<{ shortcut?: string }>();
  const handledShortcut = useRef<string | null>(null);

  const { data: group } = useGetGroup();
  const { data: accounts = [], refetch: refetchAccounts } = useGetJointAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const accountStorageKey = group?.id && user?.id ? `bank-account:${group.id}:${user.id}` : null;
  const { data, isLoading, isFetching, refetch } = useGetJointAccount(
    selectedAccountId ? { accountId: selectedAccountId } : undefined,
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchAccounts()]);
    setRefreshing(false);
  }, [refetch, refetchAccounts]);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [txType, setTxType] = useState<TxType>('deposit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  // The month a deposit was *for*, when that is not the month it arrived.
  // Null is "the month it arrived in", which is almost every deposit.
  const [appliesTo, setAppliesTo] = useState<{ month: number; year: number } | null>(null);
  const [appliesToOpen, setAppliesToOpen] = useState(false);
  // The months worth offering: the last twelve, newest first, plus the next
  // three so a prepayment is the same mechanism pointed forward. Paying June's
  // dues in April is as real as paying April's in September.
  const recentPeriods = useMemo(() => {
    const now = new Date();
    const periods: Array<{ month: number; year: number }> = [];
    for (let offset = 3; offset >= -11; offset -= 1) {
      const when = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      periods.push({ month: when.getMonth() + 1, year: when.getFullYear() });
    }
    return periods;
  }, []);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  // Which group a category added here joins, or null for a new top-level one.
  // It used to have no say: everything landed at the top level, which is how a
  // budget acquires a flat list of strays beside the groups it was given.
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null);
  // A creditor made where it is paid. Adding one here used to produce an
  // ordinary category, so you still had to go to the Debt tab to say what was
  // owed — and the payment you were entering had already lost its category.
  const [newCategoryIsDebt, setNewCategoryIsDebt] = useState(false);
  const [newCategoryOwed, setNewCategoryOwed] = useState('');
  const [newCategoryRate, setNewCategoryRate] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A day's banking is several postings, not one. Recording them used to mean
  // reopening the sheet each time and losing the thread of where the balance
  // had got to, so the sheet can stay open and keep a tally of the sitting.
  const [sitting, setSitting] = useState<{ count: number; inflow: number; outflow: number } | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [openingBalanceModalVisible, setOpeningBalanceModalVisible] = useState(false);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState('');
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayIso());
  const [showOpeningBalanceDatePicker, setShowOpeningBalanceDatePicker] = useState(false);
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  // Reconciling: the statement's closing balance, against Jamvi's.
  const [reconcileVisible, setReconcileVisible] = useState(false);
  const [statementBalance, setStatementBalance] = useState('');
  const [reconcileNarration, setReconcileNarration] = useState('');
  // The day being reconciled is not always today. A charge stamped with the
  // wrong date leaves that day still not adding up, which is the one thing
  // this screen exists to fix.
  const [reconcileDate, setReconcileDate] = useState(todayIso());
  const [showReconcileDatePicker, setShowReconcileDatePicker] = useState(false);
  const [reconcileCategory, setReconcileCategory] = useState('');
  const [showReconcileCategoryPicker, setShowReconcileCategoryPicker] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState('');
  const [accountNumberDraft, setAccountNumberDraft] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  // ── Deposit payer state ────────────────────────────────────────────────────
  // depositorIds: [] = Joint bank (null madeById)
  //               [id] = single named member
  //               [id1, id2, …] = multi-split named members
  const [depositorIds, setDepositorIds] = useState<string[]>([]);
  const [depositorAmounts, setDepositorAmounts] = useState<Record<string, string>>({});
  const [incomeSourceId, setIncomeSourceId] = useState<number | null>(null);
  const [depositSourceKind, setDepositSourceKind] = useState<'income_source' | 'other' | null>(null);

  // ── Withdrawal payer state ─────────────────────────────────────────────────
  // withdrawerId: null = Joint bank; string = named member
  const [withdrawerId, setWithdrawerId] = useState<string | null>(null);

  // ── Withdrawal destination state ───────────────────────────────────────────
  // 'source' = an income stream they defined, 'savings' = a savings goal,
  // 'other' = free-text description
  type WithdrawDestType = 'source' | 'savings' | 'other';
  const [withdrawDest, setWithdrawDest] = useState<WithdrawDestType | null>(null);
  const [withdrawSourceName, setWithdrawSourceName] = useState<string | null>(null);
  const [withdrawGoalId, setWithdrawGoalId] = useState<number | null>(null);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  // A goal can be made without leaving the withdrawal. Sending somebody to the
  // Goals tab costs them the posting they were entering, and the moment you
  // discover the goal is missing is the moment you are trying to use it.
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);
  const [transferDirection, setTransferDirection] = useState<'to_savings' | 'from_savings'>('to_savings');
  const [bankTransferDestinationId, setBankTransferDestinationId] = useState<number | null>(null);

  // Derived: for income sources, only show when exactly one depositor is selected
  const singleDepositorId = depositorIds.length === 1 ? depositorIds[0] : null;

  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();
  const { mutateAsync: deleteTransaction } = useDeleteJointAccountTransaction();
  const { mutateAsync: deleteExpense } = useDeleteExpense();
  const { mutateAsync: transferBankToSavings } = useTransferBankToSavings();
  const { mutateAsync: transferSavingsToBank } = useTransferSavingsToBank();
  const { mutateAsync: transferBankToBank } = useTransferBankToBank();
  const { mutateAsync: updateOpeningBalance } = useUpdateJointAccountOpeningBalance();
  const { mutateAsync: createAccount } = useCreateJointAccount();
  const { mutateAsync: createSavingsGoal } = useCreateSavingsGoal();
  const { mutateAsync: updateAccount } = useUpdateJointAccount();
  const { mutateAsync: deleteAccount } = useDeleteJointAccount();
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const isSharedWorkspace = group?.isPrivate === false;
  const budgetName = workspaceBudgetName(group);
  const canManageAccount = canManageBankAccount(group);
  const canManageShared = isSharedWorkspace && canManageAccount;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
    ?? accounts[0];
  const hasBankAccounts = accounts.length > 0;

  useEffect(() => {
    if (!accountStorageKey) return;
    let active = true;
    AsyncStorage.getItem(accountStorageKey).then((stored) => {
      const id = Number(stored);
      if (active) {
        setSelectedAccountId((current) =>
          resolveBankAccountSelection(accounts, current, Number.isInteger(id) ? id : null),
        );
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [accountStorageKey, accounts]);

  const selectAccount = (accountId: number) => {
    setSelectedAccountId(accountId);
    if (accountStorageKey) AsyncStorage.setItem(accountStorageKey, String(accountId)).catch(() => {});
  };
  const canEditTransaction = (tx: Tx) =>
    (canManageAccount && !tx.bankTransferId) || (
      tx.type === 'deposit' &&
      tx.madeById === user?.id &&
      tx.date === todayIso() &&
      !tx.savingsGoalId
    );
  const selectableDepositors = canManageShared
    ? members
    : members.filter((member) => member.userId === user?.id);

  // Fetch income sources for selected depositor (single named only)
  // Whose income streams to offer: the person depositing, when it is one
  // named person, and the group's when the money is coming from the joint
  // bank (depositorIds is empty for that — see the note above). The endpoint
  // has always answered both; the client simply never asked in the second
  // case, so choosing Joint bank left "Other" as the only thing on offer.
  const { data: depositSources = [] } = useQuery<MemberIncomeSource[]>({
    queryKey: ['income-sources', singleDepositorId ?? '__group__'],
    queryFn: () => customFetch<MemberIncomeSource[]>(
      singleDepositorId ? `/api/income-sources?userId=${singleDepositorId}` : '/api/income-sources',
    ),
    enabled: txType === 'deposit' && (!!singleDepositorId || depositorIds.length === 0),
  });

  // Fetch income sources for the selected withdrawer (withdrawal destination chips)
  const { data: withdrawSources = [] } = useQuery<MemberIncomeSource[]>({
    queryKey: ['income-sources', withdrawerId],
    queryFn: async () => {
      if (!withdrawerId) return [];
      return customFetch<MemberIncomeSource[]>(`/api/income-sources?userId=${withdrawerId}`);
    },
    enabled: !!withdrawerId && txType === 'disbursement',
    staleTime: 60_000,
  });

  // Savings goals for the "Savings" destination option
  const { data: savingsGoals = [] } = useGetSavingsGoals();

  // The savings goal matching the current withdrawGoalId selection
  const selectedGoal = savingsGoals.find(g => g.id === withdrawGoalId) ?? null;

  const openModal = (type: TxType) => {
    if (!canManageAccount && type !== 'deposit') {
      Alert.alert('Admin access required', 'Ask a group owner or admin to record a shared transfer or withdrawal.');
      return;
    }
    setEditingTransactionId(null);
    setTxType(type);
    setAmount('');
    setDescription('');
    setExpenseCategory('');
    setShowCategoryPicker(false);
    setNewCategoryName('');
    setDate(todayIso());
    setShowDatePicker(false);
    setDepositorIds(!isSharedWorkspace && user?.id ? [user.id] : (!canManageShared && user?.id ? [user.id] : []));
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
    setWithdrawerId(!isSharedWorkspace ? user?.id ?? null : null);
    // Reset withdrawal destination
    setWithdrawDest(null);
    setWithdrawSourceName(null);
    setWithdrawGoalId(null);
    setShowGoalPicker(false);
    setTransferDirection('to_savings');
    setBankTransferDestinationId(accounts.find((candidate) => candidate.id !== selectedAccountId)?.id ?? null);
    setModalVisible(true);
  };

  useEffect(() => {
    if ((shortcut !== 'deposit' && shortcut !== 'withdraw' && shortcut !== 'bank-transfer') || handledShortcut.current === shortcut) return;
    handledShortcut.current = shortcut;
    openModal(shortcut === 'bank-transfer' ? 'bank_transfer' : shortcut === 'withdraw' ? 'disbursement' : 'deposit');
  }, [shortcut]);

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setNewCategoryName('');
    setEditingTransactionId(null);
    setSitting(null);
  };

  // What changes between one posting and the next. The type, the date, the
  // account and the people stay: a sitting is one day on one account, and
  // re-choosing them for every line is the friction that made recording a
  // whole day unappealing in the first place.
  const resetForNextEntry = () => {
    setAmount('');
    setDescription('');
    setExpenseCategory('');
    setShowCategoryPicker(false);
    setNewCategoryName('');
    setWithdrawDest(null);
    setWithdrawSourceName(null);
    setWithdrawGoalId(null);
    setShowGoalPicker(false);
    setDepositorAmounts({});
  };

  /**
   * End one posting: either close the sheet, or clear it for the next and
   * count what was just recorded. Called from every branch of the submit
   * handler, so no path can leave the sheet in a half-saved state.
   */
  const finishEntry = (keepOpen: boolean, recorded: { amount: number; direction: 'in' | 'out' }) => {
    setEditingTransactionId(null);
    if (!keepOpen) {
      setModalVisible(false);
      setSitting(null);
      return;
    }
    resetForNextEntry();
    setSitting((previous) => ({
      count: (previous?.count ?? 0) + 1,
      inflow: (previous?.inflow ?? 0) + (recorded.direction === 'in' ? recorded.amount : 0),
      outflow: (previous?.outflow ?? 0) + (recorded.direction === 'out' ? recorded.amount : 0),
    }));
  };

  const openReconcile = () => {
    setStatementBalance('');
    setReconcileNarration('');
    setReconcileCategory('');
    setShowReconcileCategoryPicker(false);
    // Default to the day the account was last active rather than today: you
    // reconcile a statement after the fact, often the next morning.
    setReconcileDate(data?.transactions?.[0]?.date?.slice(0, 10) ?? todayIso());
    setShowReconcileDatePicker(false);
    setReconcileVisible(true);
  };

  /**
   * Record the shortfall, as whichever kind of thing it turned out to be.
   *
   * Only offered when Jamvi holds more than the statement does: money has left
   * the account that no posting accounts for. On a Kenyan statement that is
   * often a fee, and a fee belongs outside household spending. But it is just
   * as often a posting somebody forgot, and that money was genuinely spent on
   * something. Only the person holding the statement knows which, so the app
   * asks; a mis-attributed difference is worse than a visible one.
   */
  const recordDifference = async (difference: number) => {
    if (!selectedAccountId) {
      Alert.alert('Choose a bank account', 'Pick the account you are checking before recording the difference.');
      return;
    }
    if (!reconcileCategory.trim()) {
      Alert.alert('Choose a category', 'Pick the category this spending belongs to, or record it as a bank charge.');
      return;
    }
    setReconciling(true);
    try {
      await createDisbursement({
        data: {
          amount: difference,
          description: reconcileNarration.trim() || reconcileCategory,
          date: reconcileDate,
          expenseCategory: reconcileCategory,
          madeById: !isSharedWorkspace ? user?.id : null,
          destinationKind: 'category',
          accountId: selectedAccountId,
        },
      });
      setReconcileVisible(false);
      await invalidateBalance();
    } catch (err: unknown) {
      if (!handleLapsedError(err)) {
        Alert.alert('Could not record the difference', err instanceof Error ? err.message : 'Nothing was recorded.');
      }
    } finally {
      setReconciling(false);
    }
  };

  // Invalidate everywhere that displays the joint-account balance so all
  // screens (home card + bank tab) update immediately after any mutation.
  const invalidateBalance = () => {
    queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
  };

  const invalidateAccounts = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
    await invalidateBalance();
  };

  // When the account editor is opened from inside a transaction sheet, the
  // sheet is put away and brought back afterwards. Without this, adding the
  // account you realised you needed cost you the posting you were entering.
  const [resumeTransactionAfterAccount, setResumeTransactionAfterAccount] = useState(false);

  const openAccountEditor = (accountId?: number, { resumeTransaction = false } = {}) => {
    setResumeTransactionAfterAccount(resumeTransaction);
    const account = accounts.find((item) => item.id === accountId);
    setEditingAccountId(account?.id ?? null);
    setAccountNameDraft(account?.name ?? '');
    setAccountNumberDraft(account?.accountNumber ?? '');
    setAccountModalVisible(true);
  };

  /**
   * Leave the account editor, saved or not, and go back to the posting that
   * sent you here. Backing out used to leave the transaction sheet hidden with
   * everything typed into it still there but unreachable.
   */
  const closeAccountEditor = () => {
    if (savingAccount) return;
    setAccountModalVisible(false);
    if (resumeTransactionAfterAccount) {
      setResumeTransactionAfterAccount(false);
      setModalVisible(true);
    }
  };

  const saveAccount = async () => {
    const name = accountNameDraft.trim();
    const accountNumber = accountNumberDraft.trim();
    if (!name) {
      Alert.alert('Account name required', 'Enter a clear name for this bank account.');
      return;
    }
    setSavingAccount(true);
    try {
      const account = editingAccountId
        ? await updateAccount({ id: editingAccountId, data: { name, accountNumber: accountNumber || null } })
        : await createAccount({ data: { name, accountNumber: accountNumber || undefined } });
      selectAccount(account.id);
      setAccountModalVisible(false);
      await invalidateAccounts();
      // Back to the posting that sent you here, with the new account already
      // chosen. Everything typed so far is still in the form: the sheet was
      // hidden rather than reset.
      if (resumeTransactionAfterAccount) {
        setResumeTransactionAfterAccount(false);
        setModalVisible(true);
      }
    } catch (error: unknown) {
      Alert.alert('Could not save account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingAccount(false);
    }
  };

  const removeAccount = (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    Alert.alert('Remove bank account', `Remove "${account?.name ?? 'this account'}" from "${budgetName}"? Accounts with transactions cannot be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount({ id: accountId });
            const next = accounts.find((item) => item.id !== accountId);
            if (next) selectAccount(next.id);
            await invalidateAccounts();
          } catch (error: unknown) {
            Alert.alert(
              'Account cannot be removed',
              error instanceof Error
                ? error.message
                : 'This account may have transaction history. Move or remove its transactions first.',
            );
          }
        },
      },
    ]);
  };

  const openOpeningBalanceEditor = () => {
    setOpeningBalanceDraft(String(data?.openingBalance ?? 0));
    setOpeningBalanceDate(data?.openingBalanceDate ?? todayIso());
    setOpeningBalanceModalVisible(true);
  };

  const closeOpeningBalanceEditor = () => {
    if (!savingOpeningBalance) setOpeningBalanceModalVisible(false);
  };

  const handleOpeningBalanceSubmit = async () => {
    const value = parseBankAmount(openingBalanceDraft);
    if (value === null || value < 0) {
      Alert.alert('Enter a valid KES amount', 'Use zero or more, with up to two decimal places.');
      return;
    }

    setSavingOpeningBalance(true);
    try {
      await updateOpeningBalance({
        data: { openingBalance: value, openingBalanceDate, accountId: selectedAccountId ?? undefined },
      });
      setOpeningBalanceModalVisible(false);
      await invalidateBalance();
      Alert.alert('Opening balance saved', 'The current balance now includes this starting amount.');
    } catch (err: unknown) {
      Alert.alert('Could not save opening balance', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingOpeningBalance(false);
    }
  };

  const handleDelete = (tx: Tx) => {
    if (!canManageAccount) {
      Alert.alert('Admin access required', `Ask a group owner or admin to delete a shared bank transaction from "${budgetName}".`);
      return;
    }
    const deletesExpense = tx.expenseId != null;
    Alert.alert(
      deletesExpense ? 'Delete expense' : 'Delete transaction',
      deletesExpense
        ? `Delete "${tx.description}" from "${budgetName}"? Its bank funding transaction will also be removed.`
        : `Delete "${tx.description}" from "${budgetName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              if (deletesExpense) {
                await deleteExpense({ id: tx.expenseId! });
              } else {
                await deleteTransaction({ id: tx.id });
              }
              await invalidateBalance();
            } catch (error: unknown) {
              Alert.alert(
                deletesExpense ? 'Could not delete expense' : 'Could not delete transaction',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const openEdit = (tx: Tx) => {
    if (!canEditTransaction(tx)) {
      Alert.alert('This transaction is locked', 'Members can correct only their own deposits dated today. Ask an admin to correct an earlier or shared bank record.');
      return;
    }
    const type: TxType = tx.savingsGoalId
      ? 'transfer'
      : tx.type === 'deposit' ? 'deposit' : 'disbursement';
    setTxType(type);
    setEditingTransactionId(tx.id);
    setAmount(String(tx.amount));
    setDescription(type === 'transfer'
      ? tx.description.replace(/^Transfer (?:to|from) savings —\s*/, '')
      : tx.description);
    setDate(tx.date);
    setExpenseCategory(tx.expenseCategory ?? '');
    setAppliesTo(tx.appliesToMonth && tx.appliesToYear
      ? { month: tx.appliesToMonth, year: tx.appliesToYear }
      : null);
    setShowCategoryPicker(false);
    // This editor works in member ids, so portions credited to a contributor
    // recorded by name are skipped rather than turned into somebody else's.
    const splitIds = tx.contributorSplits
      ?.map((split) => split.userId)
      .filter((userId): userId is string => typeof userId === "string") ?? [];
    setDepositorIds(type === 'deposit'
      ? (splitIds.length > 0 ? splitIds : !isSharedWorkspace && user?.id ? [user.id] : tx.madeById ? [tx.madeById] : [])
      : []);
    setDepositorAmounts(Object.fromEntries(
      (tx.contributorSplits ?? [])
        .filter((split) => typeof split.userId === "string")
        .map((split) => [split.userId as string, String(split.amount)]),
    ));
    setIncomeSourceId(tx.incomeSourceId ?? null);
    setDepositSourceKind(null);
    setWithdrawerId(type === 'disbursement'
      ? (!isSharedWorkspace ? user?.id ?? null : tx.madeById ?? null)
      : null);
    setWithdrawDest(type === 'disbursement' ? 'other' : null);
    setWithdrawSourceName(null);
    setWithdrawGoalId(tx.savingsGoalId ?? null);
    setShowGoalPicker(false);
    setShowDatePicker(false);
    setTransferDirection(tx.transferDirection === 'from_savings' ? 'from_savings' : 'to_savings');
    setModalVisible(true);
  };

  // ── Toggle depositor member chip ───────────────────────────────────────────
  // Selecting a member deselects Joint bank (and vice versa).
  // Selecting all-off means Joint bank again.
  const toggleDepositor = (memberId: string) => {
    if (!canManageShared) {
      Alert.alert('Admin access required', 'Ask a group owner or admin to choose another person for this shared transaction.');
      return;
    }
    setDepositorIds(prev => {
      if (prev.includes(memberId)) {
        // Deselect this member
        return prev.filter(id => id !== memberId);
      } else {
        // Add member (removes Joint bank implicitly since joint = empty array)
        return [...prev, memberId];
      }
    });
    setIncomeSourceId(null);
    setDepositSourceKind(null);
  };

  // Selecting Joint bank chip explicitly clears all named members
  const handleCreateGoal = async () => {
    const name = newGoalName.trim();
    if (!name) {
      Alert.alert('Name the goal', 'Give it a short name, such as School fees or Emergency fund.');
      return;
    }
    // A target is what makes a goal a goal rather than a pot. Zero is allowed
    // for somebody setting aside without a figure in mind yet.
    const target = readAmount(newGoalTarget || '0');
    if (target === null || target < 0) {
      Alert.alert('Target not valid', 'Enter zero or more, with up to two decimal places.');
      return;
    }
    setAddingGoal(true);
    try {
      const goal = await createSavingsGoal({ data: { name, targetAmount: target } });
      setWithdrawGoalId(goal.id);
      setNewGoalName('');
      setNewGoalTarget('');
      setShowGoalPicker(false);
      await queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
    } catch (error: unknown) {
      if (!handleLapsedError(error)) {
        Alert.alert('Could not add goal', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setAddingGoal(false);
    }
  };

  /**
   * Offer to take a payment off what is owed.
   *
   * Asked rather than applied. A debt balance is a stored number and a posting
   * is a record that can be edited or deleted afterwards; if paying reduced
   * the balance by itself, every one of those paths would have to put it back,
   * and the first one that did not would send the balance quietly wrong. A
   * number you are asked about stays a number you own.
   *
   * Only on a new withdrawal. Offering it again when an existing one is edited
   * would take the money off twice.
   */
  const offerDebtReduction = (categoryName: string, amount: number) => {
    const name = categoryName.trim().toLocaleLowerCase();
    // The generated category type does not declare the debt columns; the route
    // returns the whole row and always has.
    const debt = (categories as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
      .find((row) => row.name.trim().toLocaleLowerCase() === name && typeof row.debtBalance === 'number');
    const owed = debt?.debtBalance;
    if (!debt || typeof owed !== 'number' || owed <= 0 || amount <= 0) return;

    // Whole shillings: the column is an integer, and a debt quoted to the
    // cent is not how anybody is told what they owe.
    const paid = Math.round(amount);
    const remaining = Math.max(0, owed - paid);
    Alert.alert(
      `Take this off ${debt.name}?`,
      paid >= owed
        ? `You owe KES ${formatKES(owed)}. This clears it.`
        : `You owe KES ${formatKES(owed)}. Taking KES ${formatKES(paid)} off leaves KES ${formatKES(remaining)}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: remaining === 0 ? 'Clear it' : 'Reduce',
          onPress: async () => {
            try {
              await customFetch(`/api/budget-categories/${debt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ debtBalance: remaining }),
              });
              await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
            } catch (error: unknown) {
              Alert.alert('Could not update the debt', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const selectJointBank = () => {
    if (!canManageShared) {
      Alert.alert('Admin access required', 'Ask a group owner or admin to use Joint bank for this shared transaction.');
      return;
    }
    setDepositorIds([]);
    setDepositorAmounts({});
    setIncomeSourceId(null);
    setDepositSourceKind(null);
  };

  const handleCreateCategory = async () => {
    if (!canManageAccount) {
      Alert.alert(
        'Admin access required',
        isSharedWorkspace
          ? 'Ask a group owner or admin to add a shared category.'
          : 'Only the Personal budget owner can add a category.',
      );
      return;
    }
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert('Enter a category name', 'Give the new category a short name first.');
      return;
    }

    // A creditor with nothing owed is a category, not a debt. Saying so is
    // better than tracking a debt of zero and calling it cleared.
    const owed = newCategoryIsDebt ? readAmount(newCategoryOwed || '0') : null;
    if (newCategoryIsDebt && (owed === null || owed < 0)) {
      Alert.alert('What is owed?', 'Enter the balance as zero or more, with up to two decimal places.');
      return;
    }
    const ratePercent = newCategoryRate.trim();
    if (newCategoryIsDebt && ratePercent && !/^\d+(\.\d{1,2})?$/.test(ratePercent)) {
      Alert.alert('Rate not valid', 'Give the yearly rate as a percentage, such as 14 or 7.5. Leave it blank if you do not know it.');
      return;
    }

    setAddingCategory(true);
    try {
      const parent = newCategoryParentId === null
        ? null
        : categories.find((row) => row.id === newCategoryParentId) ?? null;
      const category = await customFetch<{ id: number; name: string }>('/api/budget-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          budgetAmount: 0,
          // A child takes its group's tier: the ranking is what the group is
          // worth against other groups, and asking again per ledger invites
          // two answers to one question. A new group starts in the middle
          // rather than at 1 — everything added in passing was being declared
          // must-pay, which is a claim nobody made.
          priority: parent?.priority ?? 3,
          color: parent?.color ?? '#6B7280',
          ...(parent ? { parentId: parent.id } : {}),
          // Basis points, so the rate is an exact integer rather than a float
          // that drifts on repeated writes.
          ...(newCategoryIsDebt
            ? {
                debtBalance: Math.round(owed ?? 0),
                debtInterestRateBps: ratePercent ? Math.round(Number(ratePercent) * 100) : null,
              }
            : {}),
        }),
      });
      setExpenseCategory(category.name);
      setNewCategoryName('');
      setNewCategoryParentId(null);
      setNewCategoryIsDebt(false);
      setNewCategoryOwed('');
      setNewCategoryRate('');
      setShowCategoryPicker(false);
      // Awaited: the reduce prompt reads this list after the withdrawal saves,
      // and a debt created moments before has to be in it by then.
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
    } catch {
      Alert.alert('Could not add category', 'Please try again.');
    } finally {
      setAddingCategory(false);
    }
  };

  // ── Validate member IDs against known members ──────────────────────────────
  const knownMemberIds = new Set(members.map(m => m.userId));
  const validDepositorIds = depositorIds.filter(id => knownMemberIds.has(id));

  const handleSubmit = async ({ keepOpen = false }: { keepOpen?: boolean } = {}) => {
    // Clearing the amount on an existing posting means zero, not "unfinished".
    // A line that turned out to be reversed is still a line that happened, and
    // deleting the row loses the reconciliation with it. On a new posting an
    // empty field is still an empty field: saving one silently as zero would
    // be a way to create rows by accident.
    const parsed = amount.trim() === '' && editingTransactionId !== null ? 0 : readAmount(amount);
    if (parsed === null || parsed < 0) {
      Alert.alert('Invalid amount', 'Enter zero or more, with up to two decimal places.');
      return;
    }
    if (txType === 'transfer' && !Number.isInteger(parsed)) {
      Alert.alert('Use whole KES for savings', 'Savings-goal transfers currently use whole shillings.');
      return;
    }
    if (!selectedAccountId) {
      Alert.alert(
        'Choose a bank account',
        canManageAccount
          ? 'Create a bank account first, then return here to record the transaction.'
          : 'Ask an owner or admin to create a bank account before recording a deposit.',
      );
      return;
    }
    // "Where is this money going? → Savings" built an ordinary disbursement
    // whose description happened to mention the goal. The goal was never
    // credited, and the posting counted as spending against a category it had
    // to borrow. It is the same movement the Transfer action makes, so it now
    // makes it — money into savings is moved, not spent.
    if (txType === 'disbursement' && withdrawDest === 'savings') {
      if (!selectedGoal) {
        Alert.alert('Select a goal', 'Please choose which savings goal this is for.');
        return;
      }
      if (!Number.isInteger(parsed)) {
        Alert.alert('Use whole KES for savings', 'Savings-goal transfers currently use whole shillings.');
        return;
      }
      setSubmitting(true);
      try {
        await transferBankToSavings({
          data: {
            amount: parsed,
            goalId: selectedGoal.id,
            narration: description.trim() || `Savings – ${selectedGoal.name}`,
            date,
            madeById: isSharedWorkspace ? null : user?.id,
            accountId: selectedAccountId ?? undefined,
          },
        });
        finishEntry(keepOpen, { amount: parsed, direction: 'out' });
        await invalidateBalance();
      } catch (err: unknown) {
        if (!handleLapsedError(err)) {
          Alert.alert('Could not move this to savings', err instanceof Error ? err.message : 'Nothing was moved.');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (txType === 'disbursement' && withdrawDest !== 'savings' && !expenseCategory.trim()) {
      Alert.alert('Category required', 'Choose or add a category for this withdrawal.');
      return;
    }
    if (txType === 'disbursement' && withdrawDest === 'other' && !description.trim()) {
      Alert.alert('Narration required', 'Explain where the money is going when you choose Other.');
      return;
    }
    if (txType === 'transfer') {
      if (!selectedGoal) {
        Alert.alert('Select a goal', 'Choose the savings goal for this transfer.');
        return;
      }
      if (!description.trim()) {
        Alert.alert('Narration required', 'Add a short narration for this transfer.');
        return;
      }
      setSubmitting(true);
      try {
        const transfer = {
          amount: parsed,
          goalId: selectedGoal.id,
          narration: description.trim(),
          date,
          madeById: isSharedWorkspace ? null : user?.id,
          accountId: selectedAccountId ?? undefined,
        };
        if (editingTransactionId !== null) {
          await updateTransaction({
            id: editingTransactionId,
            data: { ...transfer, transferDirection },
          });
        } else if (transferDirection === 'to_savings') {
          await transferBankToSavings({ data: transfer });
        } else {
          await transferSavingsToBank({ data: transfer });
        }
        finishEntry(keepOpen, { amount: parsed, direction: transferDirection === 'to_savings' ? 'out' : 'in' });
        await invalidateBalance();
      } catch (err: unknown) {
        Alert.alert('Could not create transfer', err instanceof Error ? err.message : 'Nothing was transferred.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (txType === 'bank_transfer') {
      if (!selectedAccountId || !bankTransferDestinationId || selectedAccountId === bankTransferDestinationId) {
        Alert.alert('Choose another account', 'Source and destination bank accounts must be different.');
        return;
      }
      if (!description.trim()) {
        Alert.alert('Narration required', 'Add a short narration for this transfer.');
        return;
      }
      setSubmitting(true);
      try {
        await transferBankToBank({ data: { sourceAccountId: selectedAccountId, destinationAccountId: bankTransferDestinationId, amount: parsed, narration: description.trim(), date } });
        finishEntry(keepOpen, { amount: parsed, direction: 'out' });
        await invalidateAccounts();
        // The confirmation is worth an interruption once, but not after every
        // line of a sitting — the running tally already says it landed.
        if (!keepOpen) Alert.alert('Bank transfer recorded', 'Both account balances were updated.');
      } catch (err: unknown) {
        Alert.alert('Could not create transfer', err instanceof Error ? err.message : 'Nothing was transferred.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // For withdrawals, derive description from destination selection
    let finalDescription = description.trim();
    if (txType === 'disbursement') {
      if (withdrawDest === 'source') {
        if (!withdrawSourceName) {
          Alert.alert('Destination required', 'Please select where this money is going.');
          return;
        }
        finalDescription = description.trim() || withdrawSourceName;
      } else if (withdrawDest === 'savings') {
        if (!selectedGoal) {
          Alert.alert('Select a goal', 'Please choose which savings goal this is for.');
          return;
        }
        finalDescription = description.trim() || `Savings – ${selectedGoal.name}`;
      } else {
        // Details are optional for a withdrawal — its category is the primary
        // reportable label, and becomes the fallback transaction description.
        finalDescription = description.trim() || expenseCategory;
      }
    } else if (!finalDescription) {
      Alert.alert('Description required', 'Please enter a description.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingTransactionId !== null) {
        const editingTransaction = data?.transactions.find((transaction) => transaction.id === editingTransactionId);
        const contributorSplits = txType === 'deposit' && validDepositorIds.length > 1
          ? validDepositorIds.map((userId) => ({
              userId,
              amount: parseBankAmount(depositorAmounts[userId] || '') ?? 0,
              ...(() => {
                const existingSourceId = editingTransaction?.contributorSplits
                  ?.find((split) => split.userId === userId)
                  ?.incomeSourceId;
                return existingSourceId ? { incomeSourceId: existingSourceId } : {};
              })(),
            }))
          : [];
        await updateTransaction({
          id: editingTransactionId,
          data: {
            amount: parsed,
            description: finalDescription,
            date,
            madeById: !isSharedWorkspace
              ? user?.id
              : txType === 'deposit'
                ? contributorSplits.length > 0 ? undefined : validDepositorIds[0] ?? null
                : withdrawerId ?? null,
            ...(txType === 'deposit' ? { contributorSplits } : {}),
            ...(txType === 'deposit' && contributorSplits.length === 0 ? { incomeSourceId } : {}),
            ...(txType === 'deposit' && depositSourceKind ? { sourceKind: depositSourceKind } : {}),
            ...(txType === 'deposit' && appliesTo ? { appliesToMonth: appliesTo.month, appliesToYear: appliesTo.year } : {}),
            ...(txType === 'disbursement' ? { expenseCategory, destinationKind: withdrawDest === 'other' ? 'other' : 'category' } : {}),
            accountId: selectedAccountId ?? undefined,
          },
        });
      } else if (txType === 'deposit') {
        const isJoint = isSharedWorkspace && validDepositorIds.length === 0;
        const isMultiDepositor = validDepositorIds.length > 1;

        if (isMultiDepositor) {
          // Multiple named depositors: validate split sums match total
          const splitTotal = validDepositorIds.reduce(
            (s, id) => s + (parseBankAmount(depositorAmounts[id] || '') ?? 0), 0
          );
          const splitAmounts = validDepositorIds.map(
            id => parseBankAmount(depositorAmounts[id] || ''),
          );
          if (splitAmounts.some(portion => portion === null || portion < 0)) {
            Alert.alert(
              'Enter every amount',
              'Each depositor portion must be zero or more, with up to two decimal places.',
            );
            setSubmitting(false);
            return;
          }
          if (splitAmounts.reduce<number>((sum, portion) => sum + toCents(portion ?? 0), 0) !== toCents(parsed)) {
            Alert.alert(
              "Amounts don't add up",
              `Depositor portions total KES ${splitTotal.toLocaleString()} but the deposit is KES ${parsed.toLocaleString()}.`,
            );
            setSubmitting(false);
            return;
          }
          await createDeposit({
            data: {
              amount: parsed,
              description: description.trim(),
              date,
              contributorSplits: validDepositorIds.map((userId) => ({
                userId,
                amount: parseBankAmount(depositorAmounts[userId] || '') ?? 0,
              })),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
              ...(appliesTo ? { appliesToMonth: appliesTo.month, appliesToYear: appliesTo.year } : {}),
              accountId: selectedAccountId ?? undefined,
            },
          });
        } else if (isJoint) {
          // Joint bank: send madeById: null explicitly
          await createDeposit({
            data: {
              amount: parsed,
              description: description.trim(),
              date,
              madeById: null,
              ...(incomeSourceId ? { incomeSourceId } : {}),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
              ...(appliesTo ? { appliesToMonth: appliesTo.month, appliesToYear: appliesTo.year } : {}),
              accountId: selectedAccountId ?? undefined,
            },
          });
        } else {
          // Single named depositor
          const singleId = validDepositorIds[0];
          await createDeposit({
            data: {
              amount: parsed,
              description: description.trim(),
              date,
              madeById: singleId,
              ...(incomeSourceId ? { incomeSourceId } : {}),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
              ...(appliesTo ? { appliesToMonth: appliesTo.month, appliesToYear: appliesTo.year } : {}),
              accountId: selectedAccountId ?? undefined,
            },
          });
        }
      } else {
        // Disbursement — include madeById: null for Joint bank or the selected member
        await createDisbursement({
          data: {
            amount: parsed,
            description: finalDescription,
            date,
            expenseCategory,
            madeById: !isSharedWorkspace ? user?.id : withdrawerId ?? null,
            destinationKind: withdrawDest === 'other' ? 'other' : 'category',
            accountId: selectedAccountId ?? undefined,
          },
        });
      }
      // Read before finishEntry, which clears it. Asking after an edit would
      // take the money off a second time.
      const wasNewWithdrawal = txType === 'disbursement' && editingTransactionId === null;
      const paidCategory = expenseCategory.trim();
      finishEntry(keepOpen, { amount: parsed, direction: txType === 'deposit' ? 'in' : 'out' });
      await invalidateBalance();
      if (wasNewWithdrawal && paidCategory) {
        offerDebtReduction(paidCategory, parsed);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Nothing was recorded.';
      // A lapsed subscription answers 402 with a reason and a way to fix it,
      // which is more use than a box headed "Error".
      if (!handleLapsedError(err)) {
        Alert.alert('Could not save this bank record', message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const transactions: Tx[] = data?.transactions ?? [];

  // "Withdrawn" counted spending, savings transfers and moves between your own
  // accounts as one figure. The balance falls the same way for all three, but
  // only the first is money consumed: a day of transfers read exactly like a
  // day of spending, and a budget built on that figure is wrong by whatever
  // was merely moved.
  const outgoing = useMemo(() => {
    let spent = 0;
    let moved = 0;
    for (const tx of transactions) {
      if (tx.type !== 'disbursement') continue;
      if (tx.bankTransferId != null || tx.savingsGoalId != null) {
        // Still yours, in another pot.
        moved += tx.amount;
      } else {
        spent += tx.amount;
      }
    }
    return { spent, moved };
  }, [transactions]);

  // Panel-level edit mode: one Edit on a heading turns the list editable, one
  // Save at the foot applies every staged change.
  const accountEditor = useListEditor({
    add: async (name) => { await createAccount({ data: { name } }); },
    rename: async (id, name) => {
      const account = accounts.find((item) => item.id === id);
      await updateAccount({ id, data: { name, accountNumber: account?.accountNumber ?? null } });
    },
    remove: async (id) => { await deleteAccount({ id }); },
    afterSave: invalidateAccounts,
  });
  const txEditor = useListEditor({
    remove: async (id) => {
      const tx = transactions.find((item) => item.id === id);
      if (tx?.expenseId != null) await deleteExpense({ id: tx.expenseId });
      else await deleteTransaction({ id });
    },
    afterSave: invalidateBalance,
  });
  // A transaction row can only be staged for removal when the person could
  // delete it on its own — the same rule the per-row Delete already enforces.
  const canRemoveTx = (tx: Tx) => canManageAccount || canEditTransaction(tx);

  // Spending lands on a category that holds no subcategories: a category with
  // children is a heading, and its spending is theirs added up, so neither
  // picker offers one.
  const categoryTree = useMemo(
    () => buildCategoryTree(categories as unknown as CategoryRow[]),
    [categories],
  );

  // What is owed on each category that is a tracked debt, by name, so the
  // picker can say so. Without it a debt reads as an ordinary category and the
  // reduce prompt afterwards arrives from nowhere.
  const owedByCategory = useMemo(() => {
    const owed = new Map<string, number>();
    for (const row of categories as unknown as Array<{ name: string; debtBalance?: number | null }>) {
      if (typeof row.debtBalance === 'number' && row.debtBalance > 0) {
        owed.set(row.name.trim().toLocaleLowerCase(), row.debtBalance);
      }
    }
    return owed;
  }, [categories]);
  const owedOn = (name: string) => owedByCategory.get(name.trim().toLocaleLowerCase()) ?? null;

  // Reconciling compares Jamvi's balance with the statement's. A positive
  // difference means Jamvi holds more than the bank does: money left the
  // account with nothing recorded against it.
  const parsedStatementBalance = parseBalanceFigure(statementBalance);
  const reconcileDifference = parsedStatementBalance !== null && data
    ? Math.round((data.balance - parsedStatementBalance) * 100) / 100
    : null;

  const isDeposit = txType === 'deposit';
  const isWithdrawal = txType === 'disbursement';
  const isTransfer = txType === 'transfer';
  const isBankTransfer = txType === 'bank_transfer';
  const parsedOutgoingAmount = readAmount(amount);
  const editingTransaction = editingTransactionId === null
    ? null
    : transactions.find((transaction) => transaction.id === editingTransactionId) ?? null;
  const isOutgoingTransaction = isWithdrawal || isBankTransfer || (isTransfer && transferDirection === 'to_savings');
  // The balance the account will hold once this posting is saved, shown while
  // the amount is still being typed. Incoming money is projected too: somebody
  // recording a day works down to the closing balance on their statement, and
  // a figure that only moves for withdrawals cannot be worked down to.
  // Suppressed while the balance is being refetched. After each save in a
  // sitting the account is invalidated, and for that moment data.balance is
  // the figure from *before* the posting that just landed — so projecting
  // from it would show the next line falling from the wrong number, which is
  // precisely the figure somebody recording a day is watching.
  const projectedBalance = data &&
    !isFetching &&
    parsedOutgoingAmount !== null &&
    parsedOutgoingAmount > 0
    ? getProjectedBalanceAfterPosting(
        data.balance,
        parsedOutgoingAmount,
        isOutgoingTransaction ? 'out' : 'in',
        editingTransaction
          ? { amount: editingTransaction.amount, type: editingTransaction.type }
          : null,
      )
    : null;

  // Derive a display label for a transaction in the list
  const txPayerLabel = (tx: Tx): string => {
    if (tx.type === 'deposit') {
      if (tx.madeByName) return tx.madeByName;
       return selectedAccount?.name ?? 'Bank account';
    }
    // disbursement
    if (tx.madeByName) return tx.madeByName;
    return selectedAccount?.name ?? 'Bank account';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <PageFlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          // The balance, the account chips and the five actions used to
          // sit above the list, pinned, so only the transactions moved and
          // the top of the screen could never be scrolled away. As the
          // list header they scroll with everything else.
          <>
        <LinearGradient
          colors={['#0a1a10', '#0f2217', '#132a1c']}
          style={[styles.header, { paddingTop: topPad + 16 }]}
        >
          <WorkspaceIdentityRow group={group} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={styles.headerTitle}>Bank accounts</Text>
            {canManageAccount && !accountEditor.editing && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {hasBankAccounts && (
                  <TouchableOpacity onPress={accountEditor.open} hitSlop={10} testID="bank-edit-accounts">
                    <Feather name="edit-2" size={19} color="#86efac" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => openAccountEditor()} hitSlop={10} testID="bank-add-account">
                  <Feather name="plus-circle" size={24} color="#86efac" />
                </TouchableOpacity>
              </View>
            )}
          </View>
          {accountEditor.editing ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              {accounts.map((account) => {
                const staged = accountEditor.isRemoving(account.id);
                const renaming = accountEditor.editingRow === account.id;
                return (
                  <View
                    key={account.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1f3a2b', borderRadius: 12, paddingHorizontal: 12, minHeight: 44 }}
                  >
                    <TouchableOpacity onPress={() => accountEditor.toggleRemoval(account.id)} hitSlop={8} testID={`bank-remove-account-${account.id}`}>
                      <Feather name={staged ? 'rotate-ccw' : 'trash-2'} size={16} color={staged ? '#86efac' : '#fca5a5'} />
                    </TouchableOpacity>
                    {renaming ? (
                      <>
                        <TextInput
                          autoFocus
                          value={accountEditor.rowDraft}
                          onChangeText={accountEditor.setRowDraft}
                          onSubmitEditing={() => accountEditor.commitRename(account.id, account.name)}
                          maxLength={120}
                          style={{ flex: 1, color: '#ecfdf5', fontFamily: 'Inter_600SemiBold', paddingVertical: 8 }}
                          placeholderTextColor="#6ee7b7"
                        />
                        <TouchableOpacity onPress={() => accountEditor.commitRename(account.id, account.name)} hitSlop={8}>
                          <Feather name="check" size={17} color="#86efac" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}
                        onPress={() => accountEditor.startRename(account.id, account.name)}
                      >
                        <Text
                          style={{ color: '#d1fae5', fontFamily: 'Inter_600SemiBold', textDecorationLine: staged ? 'line-through' : 'none' }}
                          numberOfLines={1}
                        >
                          {accountEditor.displayName(account.id, account.name)}
                        </Text>
                        <Feather name="edit-2" size={11} color="#6ee7b7" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {accountEditor.adds.map((name, index) => (
                <TouchableOpacity
                  key={`add-${index}`}
                  onPress={() => accountEditor.dropAdd(index)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#14532d', borderRadius: 12, paddingHorizontal: 12, minHeight: 40 }}
                >
                  <Feather name="plus" size={14} color="#86efac" />
                  <Text style={{ flex: 1, color: '#ecfdf5' }}>{name}</Text>
                  <Feather name="x" size={13} color="#6ee7b7" />
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                <TextInput
                  value={accountEditor.addName}
                  onChangeText={accountEditor.setAddName}
                  onSubmitEditing={accountEditor.commitAdd}
                  maxLength={120}
                  placeholder="Add a bank account by name"
                  placeholderTextColor="#6ee7b7"
                  style={{ flex: 1, height: 42, borderWidth: 1, borderColor: '#2f6f4c', borderRadius: 10, paddingHorizontal: 12, color: '#ecfdf5' }}
                />
                <TouchableOpacity onPress={accountEditor.commitAdd} style={{ width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#2f6f4c', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="plus" size={18} color="#86efac" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 4 }}>
                <TouchableOpacity onPress={accountEditor.cancel} disabled={accountEditor.saving} hitSlop={8}>
                  <Text style={{ color: '#9ca3af', fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void accountEditor.save()}
                  disabled={accountEditor.saving || !accountEditor.dirty}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22c55e', paddingHorizontal: 16, height: 40, borderRadius: 10, opacity: accountEditor.saving || !accountEditor.dirty ? 0.5 : 1 }}
                  testID="bank-save-accounts"
                >
                  {accountEditor.saving ? <ActivityIndicator size="small" color="#052e16" /> : null}
                  <Text style={{ color: '#052e16', fontFamily: 'Inter_700Bold' }}>Save changes</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#6ee7b7', fontSize: 11, lineHeight: 16 }}>
                An account with transactions cannot be removed — move or delete its transactions first.
              </Text>
            </View>
          ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {accounts.map((account) => {
              const active = account.id === selectedAccount?.id;
              return (
                <TouchableOpacity
                  key={account.id}
                  onPress={() => selectAccount(account.id)}
                  style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: active ? '#dcfce7' : '#1f3a2b' }}
                  testID={`bank-account-${account.id}`}
                >
                  <Text style={{ color: active ? '#14532d' : '#d1fae5', fontFamily: 'Inter_600SemiBold' }}>{account.name}</Text>
                  {canManageAccount && active && (
                    <TouchableOpacity onPress={() => openAccountEditor(account.id)} hitSlop={8} testID={`bank-edit-account-${account.id}`}>
                      <Feather name="edit-2" size={13} color="#14532d" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          )}
          {!hasBankAccounts && canManageAccount && (
            <Pressable
              onPress={() => openAccountEditor()}
              style={[styles.firstAccountCta, { borderColor: '#86efac', backgroundColor: '#1f3a2b' }]}
              testID="bank-create-first-account"
            >
              <Feather name="plus-circle" size={18} color="#86efac" />
              <View style={{ flex: 1 }}>
                <Text style={styles.firstAccountCtaTitle}>Create your first bank account</Text>
                <Text style={styles.firstAccountCtaText}>Jamvi will not create a main or placeholder account for you.</Text>
              </View>
            </Pressable>
          )}
          {isSharedWorkspace && !canManageAccount && (
            <Text style={styles.managerGuidance}>
              You can add your own deposit today. An owner or admin handles withdrawals, transfers, and account changes.
            </Text>
          )}
          {isLoading ? (
            <ActivityIndicator color="#4ade80" style={{ marginTop: 16, marginBottom: 8 }} />
          ) : (
            <>
              <Text style={styles.balanceLabel}>Closing balance</Text>
              <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>KES {formatKES(data?.balance)}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Feather name="arrow-down-circle" size={14} color="#4ade80" />
                  <Text style={styles.statLabel}>Deposits</Text>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>KES {formatKES(data?.totalDeposits)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem} testID="bank-stat-spent">
                  <Feather name="arrow-up-circle" size={14} color="#f87171" />
                  <Text style={styles.statLabel}>Spent</Text>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>KES {formatKES(outgoing.spent)}</Text>
                </View>
                {outgoing.moved > 0 ? (
                  <>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem} testID="bank-stat-moved">
                      <Feather name="repeat" size={14} color="#fbbf24" />
                      <Text style={styles.statLabel}>Moved</Text>
                      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>KES {formatKES(outgoing.moved)}</Text>
                    </View>
                  </>
                ) : null}
              </View>
              <View style={styles.openingBalanceRow}>
                <View>
                  <Text style={styles.openingBalanceLabel}>Opening balance</Text>
                   <Text style={styles.openingBalanceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>KES {formatKES(data?.openingBalance)}</Text>
                  {data?.openingBalanceDate && (
                    <Text style={styles.openingBalanceDate}>
                       As of {formatDisplayDate(data.openingBalanceDate)}
                    </Text>
                  )}
                </View>
                {canManageAccount && (
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.editOpeningBalanceBtn}
                      onPress={openOpeningBalanceEditor}
                      activeOpacity={0.8}
                      testID="bank-edit-opening-balance"
                    >
                      <Feather name="edit-2" size={14} color="#d1fae5" />
                      <Text style={styles.editOpeningBalanceText}>Edit starting balance</Text>
                    </TouchableOpacity>
                    {hasBankAccounts && (
                      <TouchableOpacity
                        style={styles.editOpeningBalanceBtn}
                        onPress={openReconcile}
                        activeOpacity={0.8}
                        testID="bank-reconcile-action"
                      >
                        <Feather name="check-square" size={14} color="#d1fae5" />
                        <Text style={styles.editOpeningBalanceText}>Check against statement</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Action buttons inside header */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openModal('deposit')}
                  activeOpacity={0.8}
                  testID="bank-deposit-action"
                >
                  <Feather name="arrow-down-left" size={16} color="#0a1a10" />
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.actionBtnText}>Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDisburse, (!canManageAccount || !hasBankAccounts) && styles.actionBtnDisabled]}
                  onPress={() => openModal('disbursement')}
                  activeOpacity={0.8}
                  disabled={!canManageAccount || !hasBankAccounts}
                  accessibilityHint={!canManageAccount ? 'Only a Shared group owner or admin can withdraw money.' : undefined}
                  testID="bank-withdraw-action"
                >
                  <Feather name="arrow-up-right" size={16} color="#f87171" />
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.actionBtnText, styles.actionBtnTextDisburse]}>Withdraw</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#164e63' }, (!canManageAccount || !hasBankAccounts) && styles.actionBtnDisabled]}
                  onPress={() => openModal('transfer')}
                  activeOpacity={0.8}
                  disabled={!canManageAccount || !hasBankAccounts}
                  accessibilityHint={!canManageAccount ? 'Only a Shared group owner or admin can transfer shared money.' : undefined}
                  testID="bank-transfer-action"
                >
                  <Feather name="repeat" size={16} color="#67e8f9" />
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.actionBtnText, { color: '#67e8f9' }]}>Transfer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#164e63' }, (!canManageAccount || accounts.length < 2) && styles.actionBtnDisabled]}
                  onPress={() => openModal('bank_transfer')}
                  disabled={!canManageAccount || accounts.length < 2}
                  testID="bank-to-bank-action"
                >
                  <Feather name="shuffle" size={16} color="#67e8f9" />
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.actionBtnText, { color: '#67e8f9' }]}>Bank → Bank</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </LinearGradient>
          {transactions.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>TRANSACTIONS</Text>
              <ListEditButton editor={txEditor} canManage={canManageAccount} />
            </View>
          ) : null}
          </>
        }
        ListFooterComponent={
          txEditor.editing ? (
            <ListEditorFooter
              editor={txEditor}
              summary={`${transactions.filter((tx) => txEditor.isRemoving(tx.id)).length} marked for deletion. A withdrawal linked to an expense removes that expense too.`}
            />
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                 {hasBankAccounts ? 'No transactions yet' : 'Create a bank account first'}
               </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                 {hasBankAccounts
                   ? 'Money you put in or take out will appear here'
                   : 'Every account in Jamvi is created by you—there is no automatic main account.'}
              </Text>
               <Pressable
                 testID={hasBankAccounts ? 'bank-create-first-deposit' : 'bank-create-first-account-empty'}
                 accessibilityRole="button"
                 accessibilityLabel={hasBankAccounts ? 'Record your first deposit' : 'Create your first bank account'}
                 onPress={() => hasBankAccounts ? openModal('deposit') : openAccountEditor()}
                 style={[styles.emptyAction, { backgroundColor: colors.primary }]}
               >
                 <Feather name="plus" size={16} color={colors.primaryForeground} />
                 <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>
                   {hasBankAccounts ? 'Record first deposit' : 'Create bank account'}
                 </Text>
               </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const dep = item.type === 'deposit';
          const payerLabel = txPayerLabel(item);
          const editing = txEditor.editing;
          const removable = canRemoveTx(item);
          const staged = editing && txEditor.isRemoving(item.id);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.txRow,
                { borderBottomColor: colors.border, opacity: pressed && !editing ? 0.7 : staged ? 0.55 : 1 },
              ]}
            >
              {editing ? (
                removable ? (
                  <RemoveRowButton editor={txEditor} id={item.id} />
                ) : (
                  <Feather name="lock" size={14} color={colors.mutedForeground} style={{ marginRight: 2 }} />
                )
              ) : null}
              <View style={[styles.txIcon, { backgroundColor: dep ? '#1a3320' : '#3a1a1a' }]}>
                <Feather
                  name={dep ? 'arrow-down-left' : 'arrow-up-right'}
                  size={18}
                  color={dep ? '#4ade80' : '#f87171'}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                  {item.bankTransferId
                    ? `${dep ? 'From' : 'To'} ${item.bankTransferAccountName ?? 'bank account'}`
                    : item.savingsGoalId
                    ? `${item.transferDirection === 'to_savings' ? 'Bank → Savings' : 'Savings → Bank'}: ${item.savingsGoalName ?? 'Savings goal'}`
                    : !dep && item.expenseCategory ? item.expenseCategory : item.description}
                </Text>
                <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                  {item.bankTransferId
                    ? `Internal bank transfer · ${item.description} · `
                    : item.savingsGoalId
                    ? `${item.description} · `
                    : dep
                      ? `${payerLabel} · ${item.description} · `
                      : `${payerLabel}${item.expenseCategory && item.description !== item.expenseCategory ? ` · ${item.description}` : ''} · `}
                  {data?.accountName ? `${data.accountName} · ` : ''}
                  {canManageAccount ? 'Edit or delete' : canEditTransaction(item) ? 'Edit today' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                 <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.txAmount, { color: dep ? '#4ade80' : '#f87171' }]}>
                  {dep ? '+' : '-'}KES {formatKES(item.amount)}
                </Text>
                <Text
                  style={[styles.txDate, { color: colors.mutedForeground }]}
                  testID={`transaction-date-${item.id}`}
                >
                  {formatBankDate(item.date)}
                </Text>
                {typeof item.runningBalance === 'number' && (
                   <Text
                     numberOfLines={1}
                     adjustsFontSizeToFit
                     minimumFontScale={0.72}
                    style={[styles.txMeta, { color: colors.mutedForeground, textAlign: 'right' }]}
                    testID={`bank-running-balance-${item.id}`}
                  >
                    Balance KES {formatKES(item.runningBalance)}
                  </Text>
                )}
                {!editing && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {canEditTransaction(item) && <TouchableOpacity
                    onPress={() => openEdit(item)}
                    hitSlop={8}
                    testID={`bank-edit-transaction-${item.id}`}
                  >
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>}
                  {canManageAccount && <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={8}
                    testID={`bank-delete-transaction-${item.id}`}
                  >
                    <Feather name="trash-2" size={16} color="#f87171" />
                  </TouchableOpacity>}
                </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Transaction modal */}
      <Modal
        visible={accountModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAccountEditor}
      >
        <KeyboardAvoidingView style={[styles.modalOverlay, { justifyContent: 'flex-end' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {editingAccountId ? 'Personalize account' : 'Add bank account'}
              </Text>
              <TextInput
                value={accountNameDraft}
                onChangeText={setAccountNameDraft}
                placeholder="e.g. M-Pesa, Family savings"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                testID="bank-account-name"
              />
              <TextInput
                value={accountNumberDraft}
                onChangeText={setAccountNumberDraft}
                placeholder="Account number (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { marginTop: 12, color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                testID="bank-account-number"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                  onPress={closeAccountEditor}
                  disabled={savingAccount}
                  testID="bank-cancel-account"
                >
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                </TouchableOpacity>
                {editingAccountId !== null && (
                  <TouchableOpacity
                    style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#7f1d1d' }}
                    onPress={() => { setAccountModalVisible(false); removeAccount(editingAccountId); }}
                    testID="bank-remove-account"
                  >
                    <Text style={{ color: '#fee2e2', fontFamily: 'Inter_600SemiBold' }}>Remove</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.submitBtn, { flex: 1, opacity: savingAccount ? 0.6 : 1 }]} disabled={savingAccount} onPress={saveAccount} testID="bank-save-account">
                  <Text style={styles.submitText}>{savingAccount ? 'Saving…' : 'Save account'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            {/* Sheet handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {/* The form scrolls inside the capped sheet. Unbounded and
                pinned to the bottom, a long form grew off the top of the
                screen and its first fields could not be reached. */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >

              {/* Type stays fixed when editing so a deposit cannot become a withdrawal. */}
              {editingTransactionId === null ? (
              <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    txType === 'deposit' && styles.toggleActive,
                  ]}
                  onPress={() => setTxType('deposit')}
                  testID="bank-toggle-deposit"
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: txType === 'deposit' ? '#0a1a10' : colors.mutedForeground },
                    ]}
                  >
                    Deposit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    txType === 'disbursement' && styles.toggleActiveDisburse,
                  ]}
                  onPress={() => setTxType('disbursement')}
                  testID="bank-toggle-withdraw"
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: txType === 'disbursement' ? '#fff' : colors.mutedForeground },
                    ]}
                  >
                    Withdraw
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleOption, txType === 'transfer' && styles.toggleActiveDisburse]}
                  onPress={() => setTxType('transfer')}
                  testID="bank-toggle-transfer"
                >
                  <Text style={[styles.toggleText, { color: txType === 'transfer' ? '#fff' : colors.mutedForeground }]}>Transfer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleOption, txType === 'bank_transfer' && styles.toggleActiveDisburse]}
                  onPress={() => setTxType('bank_transfer')}
                  testID="bank-toggle-bank-transfer"
                >
                  <Text style={[styles.toggleText, { color: txType === 'bank_transfer' ? '#fff' : colors.mutedForeground }]}>Bank</Text>
                </TouchableOpacity>
              </View>
              ) : null}

              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {editingTransactionId !== null
                  ? `Edit ${isDeposit ? 'Deposit' : isTransfer ? 'Transfer' : 'Withdrawal'}`
                  : isDeposit ? 'Add Money to Account' : isTransfer ? 'Move Bank & Savings Funds' : isBankTransfer ? 'Move Between Bank Accounts' : 'Take Money Out'}
              </Text>

              {(isDeposit || isWithdrawal) && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Bank account *</Text>
                  <View style={{ gap: 8 }}>
                    {accounts.length === 0 ? (
                      <View style={{ gap: 10 }}>
                        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                          Add a bank account before recording this transaction.
                        </Text>
                        {canManageAccount ? (
                          <TouchableOpacity
                            style={[styles.inlineAccountButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}18` }]}
                            onPress={() => {
                              setModalVisible(false);
                              openAccountEditor(undefined, { resumeTransaction: true });
                            }}
                            testID="bank-create-account-from-transaction"
                          >
                            <Feather name="plus-circle" size={16} color={colors.primary} />
                            <Text style={[styles.inlineAccountButtonText, { color: colors.primary }]}>Create bank account</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                            Ask an owner or admin to create an account before recording a deposit.
                          </Text>
                        )}
                      </View>
                    ) : accounts.map((accountOption) => (
                      <TouchableOpacity key={accountOption.id} onPress={() => selectAccount(accountOption.id)} style={{ borderWidth: 1, borderColor: selectedAccountId === accountOption.id ? colors.primary : colors.border, backgroundColor: selectedAccountId === accountOption.id ? `${colors.primary}18` : colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }} accessibilityRole="radio" accessibilityState={{ selected: selectedAccountId === accountOption.id }}>
                        <Text style={{ color: colors.foreground, fontWeight: selectedAccountId === accountOption.id ? '700' : '500' }}>{accountOption.name}{accountOption.accountNumber ? ` · ${accountOption.accountNumber}` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                    {/* Offered whether or not accounts exist. It used to appear
                        only when there were none at all, so the moment you
                        opened an account the app stopped letting you say so
                        from the one place you notice it is missing. */}
                    {accounts.length > 0 && canManageAccount ? (
                      <TouchableOpacity
                        style={[styles.inlineAccountButton, { borderColor: colors.border, backgroundColor: 'transparent' }]}
                        onPress={() => {
                          setModalVisible(false);
                          openAccountEditor(undefined, { resumeTransaction: true });
                        }}
                        testID="bank-add-account-from-transaction"
                      >
                        <Feather name="plus-circle" size={16} color={colors.mutedForeground} />
                        <Text style={[styles.inlineAccountButtonText, { color: colors.mutedForeground }]}>Add another account</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>This account will receive the deposit or be reduced by the withdrawal.</Text>
                  {selectedAccountId && data && (
                    <View style={[styles.transactionBalanceCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]} testID="bank-transaction-account-balance">
                      <View style={styles.transactionBalanceRow}>
                        <Text style={[styles.transactionBalanceLabel, { color: colors.foreground }]}>
                          {selectedAccount?.name ?? 'Selected account'} current balance
                        </Text>
                        <Text style={[styles.transactionBalanceValue, { color: colors.foreground }]}>
                          KES {formatKES(data.balance)}
                        </Text>
                      </View>
                      {projectedBalance !== null ? (
                        <View style={styles.transactionBalanceRow} testID="bank-projected-balance">
                          <Text style={[styles.transactionBalanceLabel, { color: colors.mutedForeground }]}>
                            After this posting
                          </Text>
                          <Text
                            style={[
                              styles.transactionBalanceValue,
                              { color: projectedBalance < 0 ? '#f87171' : isOutgoingTransaction ? colors.foreground : '#4ade80' },
                            ]}
                          >
                            KES {formatKES(projectedBalance)}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={[styles.transactionBalanceHelp, { color: colors.mutedForeground }]}>
                        {projectedBalance !== null
                          ? 'The balance moves as you type, so you can work down to the figure on your statement.'
                          : 'This is the balance before the transaction is saved.'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Amount */}
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (KES)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.muted,
                  },
                ]}
                placeholder="e.g. 5000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                returnKeyType="next"
                testID="bank-amount-input"
              />
              {/* The keypad a decimal-pad gives you has no operators, and
                  switching the field to a full keyboard would make every
                  plain amount harder to type for the sake of the occasional
                  sum. These put the operators one tap away instead. */}
              <View style={styles.calcRow}>
                {(['+', '−', '×', '÷', '(', ')'] as const).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => setAmount((previous) => previous + key)}
                    style={[styles.calcKey, { borderColor: colors.border, backgroundColor: colors.muted }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${key}`}
                    testID={`bank-amount-key-${key}`}
                  >
                    <Text style={[styles.calcKeyText, { color: colors.foreground }]}>{key}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setAmount((previous) => previous.slice(0, -1))}
                  style={[styles.calcKey, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete the last character"
                  testID="bank-amount-key-delete"
                >
                  <Feather name="delete" size={15} color={colors.foreground} />
                </Pressable>
              </View>
              {/* Only when there is working to show: no point printing
                  "= 5,000" under a field that already says 5000. */}
              {isAmountExpression(amount) && parsedOutgoingAmount !== null ? (
                <Text style={[styles.calcResult, { color: colors.primary }]} testID="bank-amount-resolved">
                  = KES {formatKES(parsedOutgoingAmount)}
                </Text>
              ) : null}
               {/* Date stays beside the amount so every bank entry starts with its transaction date. */}
               <Text style={[styles.label, { color: colors.mutedForeground }]}>
                 {isDeposit ? 'Deposit date' : 'Date'}
               </Text>
               <Pressable
                 onPress={() => {
                   if (canManageShared || editingTransactionId === null) setShowDatePicker(true);
                 }}
                 style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                 testID="bank-date-picker"
               >
                 <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                 <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_400Regular', flex: 1 }}>
                   {new Date(date + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                 </Text>
                 <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
               </Pressable>
               {isSharedWorkspace && !canManageShared && editingTransactionId === null && (
                 <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                   Shared-budget members can record bank deposits for today only.
                 </Text>
               )}
               {showDatePicker && (
                 <DateTimePicker
                   value={new Date(date + 'T00:00:00')}
                   mode="date"
                   display={Platform.OS === 'ios' ? 'inline' : 'default'}
                   minimumDate={isSharedWorkspace && !canManageShared ? new Date() : undefined}
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
               {/* The second date: the month this money was *for*. A deposit
                   carries only the day it arrived, so April's dues paid in
                   September counted as September — April stayed in arrears and
                   September showed a surplus. The day above still drives the
                   balance; only the obligation follows this.

                   A month, not a day: a contribution period is monthly, and
                   offering a calendar would invite "12 April" and then ignore
                   the 12. */}
               {txType === 'deposit' ? (
                 <>
                   <Pressable
                     onPress={() => setAppliesToOpen((open) => !open)}
                     style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                     testID="bank-applies-to"
                     accessibilityRole="button"
                     accessibilityState={{ expanded: appliesToOpen }}
                   >
                     <Feather name="clock" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                     <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_400Regular', flex: 1 }}>
                       {appliesTo
                         ? `For ${MONTH_NAMES[appliesTo.month - 1]} ${appliesTo.year}`
                         : 'For the month it arrived'}
                     </Text>
                     <Feather name={appliesToOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                   </Pressable>
                   {appliesToOpen ? (
                     <View style={styles.appliesToGrid}>
                       <Pressable
                         onPress={() => { setAppliesTo(null); setAppliesToOpen(false); }}
                         testID="bank-applies-to-arrival"
                         style={[styles.appliesToChip, {
                           borderColor: appliesTo === null ? colors.primary : colors.border,
                           backgroundColor: appliesTo === null ? colors.primary + '22' : colors.muted,
                         }]}
                       >
                         <Text style={{ color: appliesTo === null ? colors.primary : colors.mutedForeground, fontSize: 13 }}>
                           The month it arrived
                         </Text>
                       </Pressable>
                       {recentPeriods.map((period) => {
                         const picked = appliesTo?.month === period.month && appliesTo?.year === period.year;
                         return (
                           <Pressable
                             key={`${period.year}-${period.month}`}
                             onPress={() => { setAppliesTo(period); setAppliesToOpen(false); }}
                             testID={`bank-applies-to-${period.year}-${period.month}`}
                             style={[styles.appliesToChip, {
                               borderColor: picked ? colors.primary : colors.border,
                               backgroundColor: picked ? colors.primary + '22' : colors.muted,
                             }]}
                           >
                             <Text style={{ color: picked ? colors.primary : colors.mutedForeground, fontSize: 13 }}>
                               {MONTH_NAMES[period.month - 1]} {period.year}
                             </Text>
                           </Pressable>
                         );
                       })}
                     </View>
                   ) : null}
                 </>
               ) : null}
              {isOutgoingTransaction && projectedBalance !== null && projectedBalance < 0 && (
                <View
                  style={styles.negativeBalanceWarning}
                  accessibilityRole="alert"
                  testID="bank-negative-balance-warning"
                >
                  <View style={styles.negativeBalanceWarningHeader}>
                    <Feather name="flag" size={15} color="#ef4444" />
                    <Text style={styles.negativeBalanceWarningTitle}>This will take the account below zero.</Text>
                  </View>
                  <Text style={styles.negativeBalanceWarningText}>
                    The projected closing balance is KES {formatKES(projectedBalance)}. Jamvi will still save the record because it tracks what happened.
                  </Text>
                </View>
              )}

              {/* Deposits require a description. Withdrawal details come after the required category. */}
              {isDeposit && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Description
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.muted,
                      },
                    ]}
                    placeholder="e.g. Monthly contribution"
                    placeholderTextColor={colors.mutedForeground}
                    value={description}
                    onChangeText={setDescription}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    testID="bank-description-input"
                  />
                </>
              )}

              {isTransfer && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Transfer direction</Text>
                  <View style={styles.memberRow}>
                    <TouchableOpacity
                      style={[styles.memberPill, { backgroundColor: transferDirection === 'to_savings' ? '#0891b2' : colors.muted, borderColor: transferDirection === 'to_savings' ? '#0891b2' : colors.border }]}
                      onPress={() => setTransferDirection('to_savings')}
                    >
                      <Text style={[styles.memberPillText, { color: transferDirection === 'to_savings' ? '#fff' : colors.foreground }]}>Bank → Savings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.memberPill, { backgroundColor: transferDirection === 'from_savings' ? '#0891b2' : colors.muted, borderColor: transferDirection === 'from_savings' ? '#0891b2' : colors.border }]}
                      onPress={() => setTransferDirection('from_savings')}
                    >
                      <Text style={[styles.memberPillText, { color: transferDirection === 'from_savings' ? '#fff' : colors.foreground }]}>Savings → Bank</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Savings goal</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                    onPress={() => setShowGoalPicker(!showGoalPicker)}
                    testID="bank-transfer-goal"
                  >
                    <Text style={{ flex: 1, color: selectedGoal ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                      {selectedGoal?.name ?? 'Choose a savings goal'}
                    </Text>
                    <Feather name={showGoalPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  {showGoalPicker && (
                    <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                      {savingsGoals.map(goal => (
                        <TouchableOpacity key={goal.id} style={styles.categoryOption} onPress={() => { setWithdrawGoalId(goal.id); setShowGoalPicker(false); }}>
                          <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{goal.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {/* With no goals the picker opened an empty box and the
                      transfer could not be completed at all — no message, no
                      way out. A transfer needs a goal because the money has to
                      land somewhere nameable; the way forward is to make one. */}
                  {/* Made here rather than on the Goals tab. Sending somebody
                      away costs them the posting they were entering, and the
                      moment you notice the goal is missing is the moment you
                      are trying to use it. */}
                  <View style={{ marginTop: 8, gap: 8 }} testID="bank-inline-goal-form">
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                      {savingsGoals.length === 0 ? 'NO GOALS YET — MAKE ONE' : "CAN'T FIND IT? ADD A GOAL"}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={newGoalName}
                        onChangeText={setNewGoalName}
                        editable={!addingGoal}
                        placeholder="e.g. School fees"
                        placeholderTextColor={colors.mutedForeground}
                        style={[styles.input, { flex: 1, marginTop: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                        testID="bank-new-goal-name"
                      />
                      <TextInput
                        value={newGoalTarget}
                        onChangeText={setNewGoalTarget}
                        editable={!addingGoal}
                        placeholder="Target"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                        style={[styles.input, { width: 96, marginTop: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                        testID="bank-new-goal-target"
                      />
                      <TouchableOpacity
                        disabled={addingGoal}
                        onPress={handleCreateGoal}
                        style={{ minWidth: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: addingGoal ? 0.55 : 1 }}
                        testID="bank-add-goal"
                      >
                        {addingGoal ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Add</Text>}
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      Leave the target blank if you are setting money aside without a figure in mind.
                    </Text>
                  </View>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Narration</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                    placeholder="e.g. Set aside for school fees"
                    placeholderTextColor={colors.mutedForeground}
                    value={description}
                    onChangeText={setDescription}
                    testID="bank-transfer-narration"
                  />
                </>
              )}
              {isBankTransfer && (
                <>
                  {/* "From" was a label showing whichever account happened to be
                      selected behind the sheet, with no way to change it here —
                      you had to close the form, pick a different account, and
                      start again. Both ends are chosen in place now. */}
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>From account</Text>
                  <View style={styles.memberRow}>
                    {accounts.map((candidate) => (
                      <TouchableOpacity
                        key={candidate.id}
                        style={[styles.memberPill, { backgroundColor: selectedAccountId === candidate.id ? '#0891b2' : colors.muted, borderColor: selectedAccountId === candidate.id ? '#0891b2' : colors.border }]}
                        onPress={() => {
                          setSelectedAccountId(candidate.id);
                          // Never let both ends be the same account.
                          if (bankTransferDestinationId === candidate.id) setBankTransferDestinationId(null);
                        }}
                        testID={`bank-transfer-source-${candidate.id}`}
                      >
                        <Text style={[styles.memberPillText, { color: selectedAccountId === candidate.id ? '#fff' : colors.foreground }]}>{candidate.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>To account</Text>
                  <View style={styles.memberRow}>
                    {accounts.filter((candidate) => candidate.id !== selectedAccountId).map((candidate) => (
                      <TouchableOpacity key={candidate.id} style={[styles.memberPill, { backgroundColor: bankTransferDestinationId === candidate.id ? '#0891b2' : colors.muted, borderColor: bankTransferDestinationId === candidate.id ? '#0891b2' : colors.border }]} onPress={() => setBankTransferDestinationId(candidate.id)} testID={`bank-transfer-destination-${candidate.id}`}>
                        <Text style={[styles.memberPillText, { color: bankTransferDestinationId === candidate.id ? '#fff' : colors.foreground }]}>{candidate.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {/* Moving money between accounts needs a second one, and
                        with only one there was nothing here and no way to make
                        it without leaving the form. */}
                    {canManageAccount && (
                      <TouchableOpacity
                        style={[styles.memberPill, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                        onPress={() => openAccountEditor()}
                        testID="bank-transfer-new-account"
                      >
                        <Feather name="plus-circle" size={13} color={colors.foreground} />
                        <Text style={[styles.memberPillText, { color: colors.foreground }]}>New account</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {accounts.length < 2 && (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      A transfer needs a second account to move the money into.
                    </Text>
                  )}
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Narration</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} placeholder="e.g. Move operating funds" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} maxLength={200} testID="bank-to-bank-narration" />
                  {selectedAccount && bankTransferDestinationId && parsedOutgoingAmount !== null && parsedOutgoingAmount > 0 && (
                    <Text style={[styles.managerGuidance, { color: colors.mutedForeground }]} testID="bank-transfer-preview">
                      {selectedAccount.name}: KES {formatKES(data?.balance)} → KES {formatKES((data?.balance ?? 0) - parsedOutgoingAmount)}. {accounts.find((candidate) => candidate.id === bankTransferDestinationId)?.name} receives KES {formatKES(parsedOutgoingAmount)}.
                    </Text>
                  )}
                </>
              )}

              {/* ── Deposited by (deposits only) ── */}
              {isDeposit && members.length > 0 && (
                <>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    {isSharedWorkspace ? 'Who is depositing?' : 'Deposited by'}{' '}
                    {canManageShared && <Text style={{ fontWeight: '400', fontSize: 11 }}>(tap multiple to split)</Text>}
                  </Text>
                  {!isSharedWorkspace ? (
                    <View style={[styles.personalAccountNotice, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Feather name="user" size={15} color={colors.primary} />
                      <Text style={[styles.personalAccountNoticeText, { color: colors.mutedForeground }]}>
                        This deposit is recorded in your name and stays in your Personal budget.
                      </Text>
                    </View>
                  ) : <View style={styles.memberRow}>
                    {/* Joint bank chip — selected when no named members chosen */}
                    {canManageShared && <TouchableOpacity
                      testID="bank-deposit-joint-chip"
                      style={[
                        styles.memberPill,
                        {
                          backgroundColor: depositorIds.length === 0 ? '#1a6b3a' : colors.muted,
                          borderColor: depositorIds.length === 0 ? '#4ade80' : colors.border,
                        },
                      ]}
                      onPress={selectJointBank}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name="home"
                        size={13}
                        color={depositorIds.length === 0 ? '#4ade80' : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.memberPillText,
                          { color: depositorIds.length === 0 ? '#4ade80' : colors.foreground },
                        ]}
                      >
                        Joint bank
                      </Text>
                    </TouchableOpacity>}

                    {/* Named member chips */}
                    {selectableDepositors.map((m) => {
                      const selected = depositorIds.includes(m.userId);
                      const name = m.userName?.split(' ')[0] ?? 'Member';
                      return (
                        <TouchableOpacity
                          key={m.userId}
                          testID={`bank-deposit-member-${m.userId}`}
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#4ade80' : colors.muted,
                              borderColor: selected ? '#4ade80' : colors.border,
                            },
                          ]}
                          onPress={() => toggleDepositor(m.userId)}
                          activeOpacity={0.7}
                        >
                          <Feather
                            name="user"
                            size={13}
                            color={selected ? '#0a1a10' : colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.memberPillText,
                              { color: selected ? '#0a1a10' : colors.foreground },
                            ]}
                          >
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>}

                  {/* Per-depositor split rows (multi only) */}
                  {validDepositorIds.length > 1 && (() => {
                    const total = parseFloat(amount.replace(/,/g, '')) || 0;
                    const splitTotal = validDepositorIds.reduce(
                      (s, id) => s + (parseBankAmount(depositorAmounts[id] || '') ?? 0), 0
                    );
                    const diff = total - splitTotal;
                    return (
                      <View style={{ marginTop: 8, gap: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                          How much is each person depositing?
                          {total > 0 ? ` (total: KES ${total.toLocaleString()})` : ''}
                        </Text>
                        {validDepositorIds.map((did) => {
                          const member = members.find(m => m.userId === did);
                          const name = member?.userName?.split(' ')[0] ?? 'Member';
                          return (
                            <View key={did} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: 76 }}>
                                <Feather name="user" size={13} color={colors.mutedForeground} />
                                <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                                  {name}
                                </Text>
                              </View>
                              <TextInput
                                style={{
                                  flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
                                  borderColor: colors.border, backgroundColor: colors.background,
                                  paddingHorizontal: 12, fontSize: 16, color: colors.foreground,
                                  fontFamily: 'Inter_400Regular',
                                }}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor={colors.mutedForeground}
                                value={depositorAmounts[did] || ''}
                                onChangeText={val =>
                                  setDepositorAmounts(prev => ({ ...prev, [did]: val }))
                                }
                                testID={`bank-deposit-split-${did}`}
                              />
                            </View>
                          );
                        })}
                        {Math.abs(diff) >= 1 && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: diff > 0 ? '#f59e0b' : '#f87171',
                              fontFamily: 'Inter_400Regular',
                            }}
                          >
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

              {/* Saved income sources are for one named depositor; Joint bank can choose Other. */}
              {isDeposit && (singleDepositorId || depositorIds.length === 0) && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    {singleDepositorId ? 'Which of their income streams?' : 'Where did this money come from?'}{' '}
                    <Text style={{ fontWeight: '400', fontSize: 11 }}>(optional)</Text>
                  </Text>
                  <View style={styles.memberRow}>
                    {depositSources.map((src) => {
                      const selected = incomeSourceId === src.id;
                      return (
                        <TouchableOpacity
                          key={src.id}
                          testID={`bank-income-source-${src.id}`}
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#6366f1' : colors.muted,
                              borderColor: selected ? '#6366f1' : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setIncomeSourceId(selected ? null : src.id);
                            setDepositSourceKind(selected ? null : 'income_source');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.memberPillText,
                              { color: selected ? '#fff' : colors.foreground },
                            ]}
                          >
                            {src.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      testID="bank-income-source-other"
                      style={[
                        styles.memberPill,
                        {
                          backgroundColor: depositSourceKind === 'other' ? '#64748b' : colors.muted,
                          borderColor: depositSourceKind === 'other' ? '#64748b' : colors.border,
                        },
                      ]}
                      onPress={() => { setDepositSourceKind(depositSourceKind === 'other' ? null : 'other'); setIncomeSourceId(null); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.memberPillText, { color: depositSourceKind === 'other' ? '#fff' : colors.foreground }]}>Other</Text>
                    </TouchableOpacity>
                  </View>
                  {depositSourceKind === 'other' && (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      Use the required description above as the source narration.
                    </Text>
                  )}
                </>
              )}

              {/* ── Withdrawal payer (disbursements only) ── */}
              {isWithdrawal && members.length > 0 && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Who is withdrawing?
                  </Text>
                  <View style={styles.memberRow}>
                    {/* Joint bank chip */}
                    <TouchableOpacity
                      testID="bank-withdraw-joint-chip"
                      style={[
                        styles.memberPill,
                        {
                          backgroundColor: withdrawerId === null ? '#3a1820' : colors.muted,
                          borderColor: withdrawerId === null ? '#f87171' : colors.border,
                        },
                      ]}
                      onPress={() => setWithdrawerId(null)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name="home"
                        size={13}
                        color={withdrawerId === null ? '#f87171' : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.memberPillText,
                          { color: withdrawerId === null ? '#f87171' : colors.foreground },
                        ]}
                      >
                        Joint bank
                      </Text>
                    </TouchableOpacity>

                    {/* Named member chips (one at a time) */}
                    {members.map((m) => {
                      const selected = withdrawerId === m.userId;
                      const name = m.userName?.split(' ')[0] ?? 'Member';
                      return (
                        <TouchableOpacity
                          key={m.userId}
                          testID={`bank-withdraw-member-${m.userId}`}
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#f87171' : colors.muted,
                              borderColor: selected ? '#f87171' : colors.border,
                            },
                          ]}
                          onPress={() => setWithdrawerId(m.userId)}
                          activeOpacity={0.7}
                        >
                          <Feather
                            name="user"
                            size={13}
                            color={selected ? '#fff' : colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.memberPillText,
                              { color: selected ? '#fff' : colors.foreground },
                            ]}
                          >
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* ── Withdrawal destination ────────────────────────────────────── */}
              {isWithdrawal && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Where is this money going?{' '}
                    <Text style={{ fontWeight: '400', fontSize: 11 }}>* required</Text>
                  </Text>
                  <View style={styles.memberRow}>
                    {/* Income source chips for the selected withdrawer */}
                    {withdrawSources.map((src) => {
                      const selected = withdrawDest === 'source' && withdrawSourceName === src.name;
                      return (
                        <TouchableOpacity
                          key={src.id}
                          testID={`bank-withdraw-dest-src-${src.id}`}
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#6366f1' : colors.muted,
                              borderColor: selected ? '#6366f1' : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setWithdrawDest('source');
                            setWithdrawSourceName(src.name);
                            setWithdrawGoalId(null);
                            setShowGoalPicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="briefcase" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                          <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                            {src.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Savings chip. Offered only on a new withdrawal: a
                        savings transfer is a different kind of record, and
                        turning a saved withdrawal into one would mean deleting
                        and rewriting it behind the person's back. An existing
                        savings transfer opens in the Transfer sheet already. */}
                    {(() => {
                      if (editingTransactionId !== null) return null;
                      const selected = withdrawDest === 'savings';
                      return (
                        <TouchableOpacity
                          testID="bank-withdraw-dest-savings"
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#0891b2' : colors.muted,
                              borderColor: selected ? '#0891b2' : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setWithdrawDest('savings');
                            setWithdrawSourceName(null);
                            setShowGoalPicker(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="target" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                          <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                            Savings
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}

                    {/* Other chip */}
                    {(() => {
                      const selected = withdrawDest === 'other';
                      return (
                        <TouchableOpacity
                          testID="bank-withdraw-dest-other"
                          style={[
                            styles.memberPill,
                            {
                              backgroundColor: selected ? '#64748b' : colors.muted,
                              borderColor: selected ? '#64748b' : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setWithdrawDest('other');
                            setWithdrawSourceName(null);
                            setWithdrawGoalId(null);
                            setShowGoalPicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="edit-3" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                          <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                            Other
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>

                  {/* Savings goal dropdown */}
                  {withdrawDest === 'savings' && showGoalPicker && savingsGoals.length > 0 && (
                    <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                      {savingsGoals
                        .filter(g => !g.isCompleted)
                        .map(g => {
                          const pct = g.targetAmount > 0
                            ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                            : 0;
                          return (
                            <TouchableOpacity
                              key={g.id}
                              style={[styles.categoryOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                              onPress={() => {
                                setWithdrawGoalId(g.id);
                                setShowGoalPicker(false);
                              }}
                            >
                              <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{g.name}</Text>
                              <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                                {pct}% funded
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      {savingsGoals.filter(g => !g.isCompleted).length === 0 && (
                        <TouchableOpacity style={styles.categoryOption}>
                          <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular' }}>No active goals</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Selected goal badge */}
                  {withdrawDest === 'savings' && selectedGoal && !showGoalPicker && (
                    <TouchableOpacity
                      onPress={() => setShowGoalPicker(true)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingVertical: 10, paddingHorizontal: 14,
                        borderRadius: 10, borderWidth: 1,
                        borderColor: '#0891b2', backgroundColor: '#0891b222',
                        marginTop: 6,
                      }}
                    >
                      <Feather name="target" size={14} color="#0891b2" />
                      <Text style={{ flex: 1, color: '#0891b2', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                        {selectedGoal.name}
                      </Text>
                      <Feather name="chevron-down" size={14} color="#0891b2" />
                    </TouchableOpacity>
                  )}

                  {/* The same form the Transfer sheet has: a goal is made
                      where it is missed, not on another screen. "No savings
                      goals set up yet" used to be the whole of the help. */}
                  {withdrawDest === 'savings' && !selectedGoal ? (
                    <View style={{ marginTop: 8, gap: 8 }} testID="bank-withdraw-goal-form">
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                        {savingsGoals.length === 0 ? 'NO GOALS YET — MAKE ONE' : "CAN'T FIND IT? ADD A GOAL"}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={newGoalName}
                          onChangeText={setNewGoalName}
                          editable={!addingGoal}
                          placeholder="e.g. School fees"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.input, { flex: 1, marginTop: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                          testID="bank-withdraw-new-goal-name"
                        />
                        <TextInput
                          value={newGoalTarget}
                          onChangeText={setNewGoalTarget}
                          editable={!addingGoal}
                          placeholder="Target"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                          style={[styles.input, { width: 96, marginTop: 0, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                          testID="bank-withdraw-new-goal-target"
                        />
                        <TouchableOpacity
                          disabled={addingGoal}
                          onPress={handleCreateGoal}
                          style={{ minWidth: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: addingGoal ? 0.55 : 1 }}
                          testID="bank-withdraw-add-goal"
                        >
                          {addingGoal ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Add</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              {/* Expense category (disbursements only) */}
              {isWithdrawal && withdrawDest !== 'savings' && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Category <Text style={{ fontWeight: '400', color: '#f87171' }}>* required</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                    onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                    activeOpacity={0.7}
                    testID="bank-category-picker"
                  >
                    <Text
                      style={{
                        color: expenseCategory ? colors.foreground : colors.mutedForeground,
                        fontSize: 16,
                        fontFamily: 'Inter_400Regular',
                        flex: 1,
                      }}
                    >
                      {expenseCategory || 'Choose a category'}
                    </Text>
                    <Feather
                      name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                  {showCategoryPicker && (
                    <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                      {categoryTree.map((group) => (
                        <View key={`withdraw-group-${group.name}`}>
                          {group.children.length > 0 ? (
                            <>
                              <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, paddingHorizontal: 14, paddingTop: 10 }}>
                                {group.name.toUpperCase()}
                              </Text>
                              {group.children.map((child) => (
                                <TouchableOpacity
                                  key={`withdraw-child-${child}`}
                                  style={[styles.categoryOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }]}
                                  onPress={() => { setExpenseCategory(child); setShowCategoryPicker(false); }}
                                >
                                  <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular', flexShrink: 1 }}>{child}</Text>
                                  {owedOn(child) !== null ? (
                                    <Text testID={`withdraw-owed-${child}`} style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                                      owe KES {formatKES(owedOn(child))}
                                    </Text>
                                  ) : null}
                                </TouchableOpacity>
                              ))}
                            </>
                          ) : (
                            <TouchableOpacity
                              style={[styles.categoryOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }]}
                              onPress={() => { setExpenseCategory(group.name); setShowCategoryPicker(false); }}
                            >
                              <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular', flexShrink: 1 }}>{group.name}</Text>
                              {owedOn(group.name) !== null ? (
                                <Text testID={`withdraw-owed-${group.name}`} style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                                  owe KES {formatKES(owedOn(group.name))}
                                </Text>
                              ) : null}
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: 10, gap: 8 }}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                          CAN'T FIND IT? ADD A CATEGORY
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          <Pressable
                            onPress={() => setNewCategoryParentId(null)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: newCategoryParentId === null }}
                            testID="bank-new-category-parent-top-level"
                            style={[styles.parentChoiceChip, {
                              borderColor: newCategoryParentId === null ? colors.primary : colors.dropdownBorder,
                              backgroundColor: newCategoryParentId === null ? colors.primary + '1F' : 'transparent',
                            }]}
                          >
                            <Text style={{ color: newCategoryParentId === null ? colors.primary : colors.dropdownForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                              Its own group
                            </Text>
                          </Pressable>
                          {categoryTree.map((group) => {
                            const parent = categories.find((row) => row.name === group.name);
                            if (!parent) return null;
                            const picked = newCategoryParentId === parent.id;
                            return (
                              <Pressable
                                key={`new-parent-${parent.id}`}
                                onPress={() => setNewCategoryParentId(parent.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: picked }}
                                accessibilityLabel={`Add this category under ${group.name}`}
                                testID={`bank-new-category-parent-${group.name}`}
                                style={[styles.parentChoiceChip, {
                                  borderColor: picked ? colors.primary : colors.dropdownBorder,
                                  backgroundColor: picked ? colors.primary + '1F' : 'transparent',
                                }]}
                              >
                                <Text style={{ color: picked ? colors.primary : colors.dropdownForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                                  Under {group.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            editable={!addingCategory}
                            placeholder="e.g. Transport"
                            placeholderTextColor={colors.mutedForeground}
                            style={{
                              flex: 1, height: 40, borderWidth: 1, borderColor: colors.dropdownBorder,
                              borderRadius: 8, color: colors.foreground, paddingHorizontal: 10,
                              fontFamily: 'Inter_400Regular', backgroundColor: colors.dropdownBackground,
                            }}
                            testID="bank-new-category-input"
                          />
                          <TouchableOpacity
                            disabled={addingCategory}
                            onPress={handleCreateCategory}
                            style={{
                              minWidth: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: colors.primary, opacity: addingCategory ? 0.55 : 1,
                            }}
                            testID="bank-add-category"
                          >
                            {addingCategory ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Add</Text>}
                          </TouchableOpacity>
                        </View>
                        {/* A creditor made where it is paid. Without this the
                            new category was an ordinary one, and saying what
                            was owed meant a trip to the Debt tab — which costs
                            the payment being entered. */}
                        <Pressable
                          onPress={() => setNewCategoryIsDebt((on) => !on)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: newCategoryIsDebt }}
                          accessibilityLabel="Track this as money you owe"
                          testID="bank-new-category-is-debt"
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                        >
                          <Feather
                            name={newCategoryIsDebt ? 'check-square' : 'square'}
                            size={15}
                            color={newCategoryIsDebt ? colors.primary : colors.mutedForeground}
                          />
                          <Text style={{ color: colors.dropdownForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                            This is money I owe
                          </Text>
                        </Pressable>
                        {newCategoryIsDebt ? (
                          <>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TextInput
                                value={newCategoryOwed}
                                onChangeText={setNewCategoryOwed}
                                editable={!addingCategory}
                                placeholder="Owed now (KES)"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="decimal-pad"
                                style={{
                                  flex: 1, height: 40, borderWidth: 1, borderColor: colors.dropdownBorder,
                                  borderRadius: 8, color: colors.foreground, paddingHorizontal: 10,
                                  fontFamily: 'Inter_400Regular', backgroundColor: colors.dropdownBackground,
                                }}
                                testID="bank-new-category-owed"
                              />
                              <TextInput
                                value={newCategoryRate}
                                onChangeText={setNewCategoryRate}
                                editable={!addingCategory}
                                placeholder="Rate %/yr"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="decimal-pad"
                                style={{
                                  width: 96, height: 40, borderWidth: 1, borderColor: colors.dropdownBorder,
                                  borderRadius: 8, color: colors.foreground, paddingHorizontal: 10,
                                  fontFamily: 'Inter_400Regular', backgroundColor: colors.dropdownBackground,
                                }}
                                testID="bank-new-category-rate"
                              />
                            </View>
                            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                              It joins the Debt tab. Once this withdrawal saves, Jamvi offers to take it off the balance.
                              The rate is optional and only shapes the payoff plan.
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Categories drive withdrawal reports; details remain optional context. */}
              {isWithdrawal && (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Details <Text style={{ fontWeight: '400' }}>(optional)</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                    ]}
                    placeholder="e.g. School books for term two"
                    placeholderTextColor={colors.mutedForeground}
                    value={description}
                    onChangeText={setDescription}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    testID="bank-description-input"
                  />
                </>
              )}

              {/* A charge or a transfer has no account card to carry the
                  projection, so the falling balance is shown here instead. */}
              {projectedBalance !== null && !(isDeposit || isWithdrawal) ? (
                <Text
                  style={[styles.sittingNote, { color: colors.mutedForeground }]}
                  testID="bank-projected-balance-compact"
                >
                  Balance after this posting: KES {formatKES(projectedBalance)}
                </Text>
              ) : null}

              {sitting !== null ? (
                <Text
                  style={[styles.sittingNote, { color: colors.mutedForeground }]}
                  testID="bank-sitting-tally"
                >
                  {sitting.count} {sitting.count === 1 ? 'posting' : 'postings'} recorded in this sitting
                  {sitting.outflow > 0 ? ` · KES ${formatKES(sitting.outflow)} out` : ''}
                  {sitting.inflow > 0 ? ` · KES ${formatKES(sitting.inflow)} in` : ''}
                </Text>
              ) : null}

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  isDeposit ? styles.submitDeposit : styles.submitDisburse,
                  submitting && { opacity: 0.6 },
                ]}
                onPress={() => handleSubmit()}
                disabled={submitting}
                activeOpacity={0.85}
                testID="bank-submit-btn"
              >
                {submitting ? (
                  <ActivityIndicator color={isDeposit ? '#0a1a10' : '#fff'} />
                ) : (
                  <Text style={[styles.submitText, !isDeposit && { color: '#fff' }]}>
                    {editingTransactionId !== null ? 'Save Changes' : isDeposit ? 'Add Money' : 'Withdraw'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* An edit is one posting by definition, so it gets no second
                  button. Everything else is likely part of a day's run. */}
              {editingTransactionId === null ? (
                <TouchableOpacity
                  style={[styles.saveAndAddBtn, { borderColor: colors.border }, submitting && { opacity: 0.6 }]}
                  onPress={() => handleSubmit({ keepOpen: true })}
                  disabled={submitting}
                  activeOpacity={0.85}
                  testID="bank-submit-and-add-another"
                >
                  <Feather name="plus" size={15} color={colors.foreground} />
                  <Text style={[styles.saveAndAddText, { color: colors.foreground }]}>Save and add another</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Check against the statement */}
      <Modal
        visible={reconcileVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !reconciling && setReconcileVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => !reconciling && setReconcileVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Check against your statement</Text>
              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 0 }]}>
                Type the closing balance your bank shows for {selectedAccount?.name ?? 'this account'}. Jamvi will
                tell you what it cannot account for.
              </Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                placeholder="e.g. 9400"
                placeholderTextColor={colors.mutedForeground}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                value={statementBalance}
                onChangeText={setStatementBalance}
                autoFocus
                testID="bank-statement-balance-input"
              />

              <View style={[styles.transactionBalanceCard, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <View style={styles.transactionBalanceRow}>
                  <Text style={[styles.transactionBalanceLabel, { color: colors.mutedForeground }]}>Jamvi has</Text>
                  <Text style={[styles.transactionBalanceValue, { color: colors.foreground }]}>
                    KES {formatKES(data?.balance)}
                  </Text>
                </View>
                {reconcileDifference !== null ? (
                  <View style={styles.transactionBalanceRow}>
                    <Text style={[styles.transactionBalanceLabel, { color: colors.mutedForeground }]}>Your statement has</Text>
                    <Text style={[styles.transactionBalanceValue, { color: colors.foreground }]}>
                      KES {formatKES(parsedStatementBalance)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {reconcileDifference === null ? null : reconcileDifference === 0 ? (
                <Text style={[styles.reconcileMessage, { color: '#4ade80' }]} testID="bank-reconcile-matched">
                  They match. Every shilling that left this account is recorded.
                </Text>
              ) : reconcileDifference > 0 ? (
                <>
                  <Text style={[styles.reconcileMessage, { color: colors.foreground }]} testID="bank-reconcile-short">
                    KES {formatKES(reconcileDifference)} left the account with nothing recorded against it — a fee the
                    bank took, or a posting you have not entered yet. Either way it is spending, so give it a category.
                  </Text>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                        Category <Text style={{ fontWeight: '400', color: '#f87171' }}>* required</Text>
                      </Text>
                      <TouchableOpacity
                        style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                        onPress={() => setShowReconcileCategoryPicker((open) => !open)}
                        testID="bank-reconcile-category"
                      >
                        <Text style={{ flex: 1, color: reconcileCategory ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                          {reconcileCategory || 'Choose a category'}
                        </Text>
                        <Feather name={showReconcileCategoryPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      {showReconcileCategoryPicker && (
                        <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                          {categoryTree.map((group) => (
                            <View key={`reconcile-group-${group.name}`}>
                              {group.children.length > 0 ? (
                                <>
                                  <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, paddingHorizontal: 14, paddingTop: 10 }}>
                                    {group.name.toUpperCase()}
                                  </Text>
                                  {group.children.map((child) => (
                                    <TouchableOpacity
                                      key={`reconcile-child-${child}`}
                                      style={styles.categoryOption}
                                      onPress={() => { setReconcileCategory(child); setShowReconcileCategoryPicker(false); }}
                                    >
                                      <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{child}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </>
                              ) : (
                                <TouchableOpacity
                                  style={styles.categoryOption}
                                  onPress={() => { setReconcileCategory(group.name); setShowReconcileCategoryPicker(false); }}
                                >
                                  <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{group.name}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Date of the spending</Text>
                  <Pressable
                    onPress={() => setShowReconcileDatePicker(true)}
                    style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                    testID="bank-reconcile-date"
                  >
                    <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_400Regular', flex: 1 }}>
                      {new Date(reconcileDate + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {showReconcileDatePicker && (
                    <DateTimePicker
                      value={new Date(reconcileDate + 'T00:00:00')}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      maximumDate={new Date()}
                      onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                        setShowReconcileDatePicker(Platform.OS === 'ios');
                        if (selected) {
                          const y = selected.getFullYear();
                          const m = String(selected.getMonth() + 1).padStart(2, '0');
                          const d = String(selected.getDate()).padStart(2, '0');
                          setReconcileDate(`${y}-${m}-${d}`);
                        }
                      }}
                    />
                  )}
                  <TextInput
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                    placeholder="What the statement calls it"
                    placeholderTextColor={colors.mutedForeground}
                    value={reconcileNarration}
                    onChangeText={setReconcileNarration}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    testID="bank-reconcile-narration"
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, styles.submitDisburse, reconciling && { opacity: 0.6 }]}
                    onPress={() => recordDifference(reconcileDifference)}
                    disabled={reconciling}
                    activeOpacity={0.85}
                    testID="bank-reconcile-record-charge"
                  >
                    {reconciling ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.submitText, { color: '#fff' }]}>
                        Record KES {formatKES(reconcileDifference)} as spending
                      </Text>
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.reconcileHelp, { color: colors.mutedForeground }]}>
                    This will count against {reconcileCategory || 'the category you pick'} like any other withdrawal.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.reconcileMessage, { color: colors.foreground }]} testID="bank-reconcile-over">
                    Your statement holds KES {formatKES(Math.abs(reconcileDifference))} more than Jamvi knows about, so
                    this is money that came in without being recorded. A charge would be the wrong answer — record the
                    deposit instead, so it can be attributed to whoever paid it.
                  </Text>
                  <TouchableOpacity
                    style={[styles.submitBtn, styles.submitDeposit]}
                    onPress={() => { setReconcileVisible(false); openModal('deposit'); }}
                    activeOpacity={0.85}
                    testID="bank-reconcile-record-deposit"
                  >
                    <Text style={styles.submitText}>Record a deposit</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual opening balance modal */}
      <Modal
        visible={openingBalanceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOpeningBalanceEditor}
      >
        <TouchableWithoutFeedback onPress={closeOpeningBalanceEditor}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Set starting balance</Text>
              <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
                Enter the money already in this Shared group’s bank account before the transactions shown below.
                This does not create a transaction.
              </Text>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Opening balance (KES)</Text>
              <TextInput
                value={openingBalanceDraft}
                onChangeText={setOpeningBalanceDraft}
                keyboardType="decimal-pad"
                editable={!savingOpeningBalance}
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                ]}
                placeholder="e.g. 25000"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                testID="bank-opening-balance-input"
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Balance date</Text>
              <Pressable
                onPress={() => setShowOpeningBalanceDatePicker(true)}
                style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                testID="bank-opening-balance-date"
              >
                <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_400Regular', flex: 1 }}>
                  {new Date(openingBalanceDate + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
              {showOpeningBalanceDatePicker && (
                <DateTimePicker
                  value={new Date(openingBalanceDate + 'T00:00:00')}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    setShowOpeningBalanceDatePicker(Platform.OS === 'ios');
                    if (selected) {
                      const y = selected.getFullYear();
                      const m = String(selected.getMonth() + 1).padStart(2, '0');
                      const d = String(selected.getDate()).padStart(2, '0');
                      setOpeningBalanceDate(`${y}-${m}-${d}`);
                    }
                  }}
                />
              )}
              <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
                The date marks when this starting amount applied. Current balance = opening balance + deposits − withdrawals.
              </Text>
              <View style={styles.openingBalanceActions}>
                <TouchableOpacity
                  style={[styles.cancelOpeningBalanceBtn, { borderColor: colors.border }]}
                  onPress={closeOpeningBalanceEditor}
                  disabled={savingOpeningBalance}
                >
                  <Text style={[styles.cancelOpeningBalanceText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveOpeningBalanceBtn, savingOpeningBalance && { opacity: 0.6 }]}
                  onPress={handleOpeningBalanceSubmit}
                  disabled={savingOpeningBalance}
                  testID="bank-save-opening-balance"
                >
                  {savingOpeningBalance ? (
                    <ActivityIndicator color="#0a1a10" />
                  ) : (
                    <Text style={styles.saveOpeningBalanceText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balance: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  negativeBalanceWarning: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    gap: 4,
  },
  negativeBalanceWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negativeBalanceWarningTitle: {
    color: '#ef4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  negativeBalanceWarningText: {
    color: '#d6b36a',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  openingBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  openingBalanceLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
  },
  openingBalanceValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  openingBalanceDate: {
    color: '#a7f3d0',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  editOpeningBalanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(209,250,229,0.35)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editOpeningBalanceText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#d1fae5',
    fontFamily: 'Inter_600SemiBold',
  },
  // Five buttons held one row with flex: 1, which on a phone left each about
  // fifty points of content width — so "Deposit" and "Withdraw" broke across
  // two lines mid-word. They now wrap onto a second row instead, each keeping
  // enough width for its whole label.
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  actionBtnDisburse: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#0a1a10',
    // A label that has to break is better shrunk than hyphenated across two
    // lines: "Withdraw" reading as "With / draw" is what this replaces.
    flexShrink: 1,
  },
  actionBtnTextDisburse: {
    color: '#f87171',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  inlineAccountButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inlineAccountButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  transactionBalanceCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  transactionBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  transactionBalanceLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  transactionBalanceValue: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  transactionBalanceHelp: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  firstAccountCta: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  firstAccountCtaTitle: {
    color: '#dcfce7',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_700Bold',
  },
  firstAccountCtaText: {
    color: '#d1fae5',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  managerGuidance: {
    marginTop: 10,
    color: '#d1fae5',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  list: { paddingHorizontal: 16, paddingTop: 16 },
  listHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1 },
  txDesc: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  txMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 8,
  },
  txDate: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 6 },
  emptyActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Modal styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    // The wrapper pins this to the bottom of the screen, so without a ceiling
    // a form taller than the screen grew upwards past the top edge and its
    // first fields — amount, date, the account it applies to — were cut off
    // with no way to reach them. Capped, with the body scrolling inside.
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleActive: {
    backgroundColor: '#4ade80',
  },
  toggleActiveDisburse: {
    backgroundColor: '#ef4444',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  openingBalanceHelp: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  openingBalanceActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelOpeningBalanceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelOpeningBalanceText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  saveOpeningBalanceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#4ade80',
  },
  saveOpeningBalanceText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  calcRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  calcKey: {
    minWidth: 44,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  calcKeyText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  calcResult: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
    marginBottom: 6,
  },
  parentChoiceChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saveAndAddBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveAndAddText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  sittingNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 10,
    marginBottom: 2,
  },
  reconcileMessage: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    marginTop: 14,
    marginBottom: 10,
  },
  reconcileHelp: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 10,
    textAlign: 'center',
  },
  submitDeposit: {
    backgroundColor: '#4ade80',
  },
  submitDisburse: {
    backgroundColor: '#ef4444',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  pickerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  appliesToGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 4 },
  appliesToChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  memberRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
  },
  personalAccountNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  personalAccountNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  memberPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberPillText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden' as const,
  },
  categoryOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
});
