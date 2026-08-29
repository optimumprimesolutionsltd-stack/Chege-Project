import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { PageFlatList } from '@/components/PageScrollReset';
import {
  useGetJointAccount,
  useCreateDeposit,
  useCreateDisbursement,
  useUpdateJointAccountTransaction,
  useDeleteJointAccountTransaction,
  useGetBudgetCategories,
  getGetBudgetCategoriesQueryKey,
  useGetMembers,
  useGetSavingsGoals,
  useTransferBankToSavings,
  useTransferSavingsToBank,
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
  customFetch,
} from '@workspace/api-client-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { WorkspaceIdentityRow } from '@/components/WorkspaceIdentityRow';
import { canManageBankAccount, resolveBankAccountSelection } from '@/lib/bankAccess';

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

type Tx = {
  id: number;
  type: string;
  amount: number;
  description: string;
  madeById?: string | null;
  madeByName?: string | null;
  incomeSourceId?: number | null;
  expenseCategory?: string | null;
  savingsGoalId?: number | null;
  savingsGoalName?: string | null;
  transferDirection?: string | null;
  contributorSplits?: { userId: string; amount: number; incomeSourceId?: number | null }[];
  date: string;
  createdAt?: string | null;
};

type TxType = 'deposit' | 'disbursement' | 'transfer';

type MemberIncomeSource = {
  id: number;
  name: string;
};

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
  const { data, isLoading, refetch } = useGetJointAccount(
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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [openingBalanceModalVisible, setOpeningBalanceModalVisible] = useState(false);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState('');
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
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
  const [transferDirection, setTransferDirection] = useState<'to_savings' | 'from_savings'>('to_savings');

  // Derived: for income sources, only show when exactly one depositor is selected
  const singleDepositorId = depositorIds.length === 1 ? depositorIds[0] : null;

  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();
  const { mutateAsync: deleteTransaction } = useDeleteJointAccountTransaction();
  const { mutateAsync: transferBankToSavings } = useTransferBankToSavings();
  const { mutateAsync: transferSavingsToBank } = useTransferSavingsToBank();
  const { mutateAsync: updateOpeningBalance } = useUpdateJointAccountOpeningBalance();
  const { mutateAsync: createAccount } = useCreateJointAccount();
  const { mutateAsync: updateAccount } = useUpdateJointAccount();
  const { mutateAsync: deleteAccount } = useDeleteJointAccount();
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const isSharedWorkspace = group?.isPrivate === false;
  const canManageAccount = canManageBankAccount(group);
  const canManageShared = isSharedWorkspace && canManageAccount;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
    ?? accounts[0];

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
    canManageAccount || (
      tx.type === 'deposit' &&
      tx.madeById === user?.id &&
      tx.date === todayIso() &&
      !tx.savingsGoalId
    );
  const selectableDepositors = canManageShared
    ? members
    : members.filter((member) => member.userId === user?.id);

  // Fetch income sources for selected depositor (single named only)
  const { data: depositSources = [] } = useQuery<MemberIncomeSource[]>({
    queryKey: ['income-sources', singleDepositorId],
    queryFn: async () => {
      if (!singleDepositorId) return [];
      return customFetch<MemberIncomeSource[]>(`/api/income-sources?userId=${singleDepositorId}`);
    },
    enabled: !!singleDepositorId && txType === 'deposit',
    staleTime: 60_000,
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
    setModalVisible(true);
  };

  useEffect(() => {
    if (shortcut !== 'deposit' || handledShortcut.current === shortcut) return;
    handledShortcut.current = shortcut;
    openModal('deposit');
  }, [shortcut]);

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setNewCategoryName('');
    setEditingTransactionId(null);
  };

  // Invalidate everywhere that displays the joint-account balance so all
  // screens (home card + bank tab) update immediately after any mutation.
  const invalidateBalance = () => {
    queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
  };

  const invalidateAccounts = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
    await invalidateBalance();
  };

  const openAccountEditor = (accountId?: number) => {
    const account = accounts.find((item) => item.id === accountId);
    setEditingAccountId(account?.id ?? null);
    setAccountNameDraft(account?.name ?? '');
    setAccountNumberDraft(account?.accountNumber ?? '');
    setAccountModalVisible(true);
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
    } catch (error: unknown) {
      Alert.alert('Could not save account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingAccount(false);
    }
  };

  const removeAccount = (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    Alert.alert('Remove bank account', `Remove "${account?.name ?? 'this account'}"? Accounts with transactions cannot be removed.`, [
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
    setOpeningBalanceModalVisible(true);
  };

  const closeOpeningBalanceEditor = () => {
    if (!savingOpeningBalance) setOpeningBalanceModalVisible(false);
  };

  const handleOpeningBalanceSubmit = async () => {
    const value = Number(openingBalanceDraft);
    if (!Number.isInteger(value) || value < 0) {
      Alert.alert('Enter a whole KES amount', 'The opening balance must be zero or more whole shillings.');
      return;
    }

    setSavingOpeningBalance(true);
    try {
      await updateOpeningBalance({ data: { openingBalance: value, accountId: selectedAccountId ?? undefined } });
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
      Alert.alert('Admin access required', 'Ask a group owner or admin to delete a shared bank transaction.');
      return;
    }
    Alert.alert(
      'Delete transaction',
      `Delete "${tx.description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteTransaction({ id: tx.id });
              await invalidateBalance();
            } catch {
              Alert.alert('Error', 'Could not delete transaction.');
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
    setShowCategoryPicker(false);
    const splitIds = tx.contributorSplits?.map((split) => split.userId) ?? [];
    setDepositorIds(type === 'deposit'
      ? (splitIds.length > 0 ? splitIds : !isSharedWorkspace && user?.id ? [user.id] : tx.madeById ? [tx.madeById] : [])
      : []);
    setDepositorAmounts(Object.fromEntries(
      (tx.contributorSplits ?? []).map((split) => [split.userId, String(split.amount)]),
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
  };

  // Selecting Joint bank chip explicitly clears all named members
  const selectJointBank = () => {
    if (!canManageShared) {
      Alert.alert('Admin access required', 'Ask a group owner or admin to use Joint bank for this shared transaction.');
      return;
    }
    setDepositorIds([]);
    setDepositorAmounts({});
    setIncomeSourceId(null);
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

    setAddingCategory(true);
    try {
      const category = await customFetch<{ id: number; name: string }>('/api/budget-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budgetAmount: 0, priority: 1, color: '#6B7280' }),
      });
      setExpenseCategory(category.name);
      setNewCategoryName('');
      setShowCategoryPicker(false);
      queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
    } catch {
      Alert.alert('Could not add category', 'Please try again.');
    } finally {
      setAddingCategory(false);
    }
  };

  // ── Validate member IDs against known members ──────────────────────────────
  const knownMemberIds = new Set(members.map(m => m.userId));
  const validDepositorIds = depositorIds.filter(id => knownMemberIds.has(id));

  const handleSubmit = async () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount greater than zero.');
      return;
    }
    if (!Number.isInteger(parsed)) {
      Alert.alert('Whole shillings only', 'Enter the amount in whole KES.');
      return;
    }
    if (txType === 'disbursement' && !expenseCategory.trim()) {
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
        setModalVisible(false);
        await invalidateBalance();
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Could not create transfer.');
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
              amount: parseFloat(depositorAmounts[userId] || '0') || 0,
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
            (s, id) => s + (parseFloat(depositorAmounts[id] || '0') || 0), 0
          );
          const splitAmounts = validDepositorIds.map(
            id => parseFloat(depositorAmounts[id] || '0') || 0,
          );
          if (splitAmounts.some(portion => !Number.isInteger(portion) || portion <= 0)) {
            Alert.alert(
              'Enter every amount',
              'Each depositor portion must be a positive whole-shilling amount.',
            );
            setSubmitting(false);
            return;
          }
          if (splitTotal !== parsed) {
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
                amount: parseFloat(depositorAmounts[userId] || '0') || 0,
              })),
              ...(depositSourceKind ? { sourceKind: depositSourceKind } : {}),
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
      setModalVisible(false);
      setEditingTransactionId(null);
      await invalidateBalance();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const transactions: Tx[] = data?.transactions ?? [];

  const isDeposit = txType === 'deposit';
  const isWithdrawal = txType === 'disbursement';
  const isTransfer = txType === 'transfer';

  // Derive a display label for a transaction in the list
  const txPayerLabel = (tx: Tx): string => {
    if (tx.type === 'deposit') {
      if (tx.madeByName) return tx.madeByName;
       if (tx.madeById === null || tx.madeById === undefined) return isSharedWorkspace ? 'Joint bank' : 'Personal account';
       return isSharedWorkspace ? 'Joint bank' : 'Personal account';
    }
    // disbursement
    if (tx.madeByName) return tx.madeByName;
    if (tx.madeById === null || tx.madeById === undefined) return isSharedWorkspace ? 'Joint bank' : 'Personal account';
    return isSharedWorkspace ? 'Joint bank' : 'Personal account';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky header */}
      <LinearGradient
        colors={['#0a1a10', '#0f2217', '#132a1c']}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <WorkspaceIdentityRow group={group} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={styles.headerTitle}>{isSharedWorkspace ? 'Joint Account' : 'Personal Account'}</Text>
          {canManageAccount && (
            <TouchableOpacity onPress={() => openAccountEditor()} hitSlop={10} testID="bank-add-account">
              <Feather name="plus-circle" size={24} color="#86efac" />
            </TouchableOpacity>
          )}
        </View>
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
            <Text style={styles.balance}>KES {formatKES(data?.balance)}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Feather name="arrow-down-circle" size={14} color="#4ade80" />
                <Text style={styles.statLabel}>Deposits</Text>
                <Text style={styles.statValue}>KES {formatKES(data?.totalDeposits)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Feather name="arrow-up-circle" size={14} color="#f87171" />
                <Text style={styles.statLabel}>Withdrawn</Text>
                <Text style={styles.statValue}>KES {formatKES(data?.totalDisbursements)}</Text>
              </View>
            </View>
            <View style={styles.openingBalanceRow}>
              <View>
                <Text style={styles.openingBalanceLabel}>Opening balance</Text>
                <Text style={styles.openingBalanceValue}>KES {formatKES(data?.openingBalance)}</Text>
              </View>
              {canManageAccount && (
                <TouchableOpacity
                  style={styles.editOpeningBalanceBtn}
                  onPress={openOpeningBalanceEditor}
                  activeOpacity={0.8}
                  testID="bank-edit-opening-balance"
                >
                  <Feather name="edit-2" size={14} color="#d1fae5" />
                  <Text style={styles.editOpeningBalanceText}>Edit starting balance</Text>
                </TouchableOpacity>
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
                <Text style={styles.actionBtnText}>Deposit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDisburse, !canManageAccount && styles.actionBtnDisabled]}
                onPress={() => openModal('disbursement')}
                activeOpacity={0.8}
                disabled={!canManageAccount}
                accessibilityHint={!canManageAccount ? 'Only a Shared budget owner or admin can withdraw money.' : undefined}
                testID="bank-withdraw-action"
              >
                <Feather name="arrow-up-right" size={16} color="#f87171" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextDisburse]}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#164e63' }, !canManageAccount && styles.actionBtnDisabled]}
                onPress={() => openModal('transfer')}
                activeOpacity={0.8}
                disabled={!canManageAccount}
                accessibilityHint={!canManageAccount ? 'Only a Shared budget owner or admin can transfer shared money.' : undefined}
                testID="bank-transfer-action"
              >
                <Feather name="repeat" size={16} color="#67e8f9" />
                <Text style={[styles.actionBtnText, { color: '#67e8f9' }]}>Transfer</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </LinearGradient>

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
          transactions.length > 0 ? (
            <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>TRANSACTIONS</Text>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No transactions yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Money you put in or take out will appear here
              </Text>
              <Pressable
                testID="bank-create-first-deposit"
                accessibilityRole="button"
                accessibilityLabel="Record your first deposit"
                onPress={() => openModal('deposit')}
                style={[styles.emptyAction, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={16} color={colors.primaryForeground} />
                <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Record first deposit</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const dep = item.type === 'deposit';
          const payerLabel = txPayerLabel(item);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.txRow,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.txIcon, { backgroundColor: dep ? '#1a3320' : '#3a1a1a' }]}>
                <Feather
                  name={dep ? 'arrow-down-left' : 'arrow-up-right'}
                  size={18}
                  color={dep ? '#4ade80' : '#f87171'}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                  {item.savingsGoalId
                    ? `${item.transferDirection === 'to_savings' ? 'Bank → Savings' : 'Savings → Bank'}: ${item.savingsGoalName ?? 'Savings goal'}`
                    : !dep && item.expenseCategory ? item.expenseCategory : item.description}
                </Text>
                <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                  {item.savingsGoalId
                    ? `${item.description} · `
                    : dep
                      ? `${payerLabel} · ${item.description} · `
                      : `${payerLabel}${item.expenseCategory && item.description !== item.expenseCategory ? ` · ${item.description}` : ''} · `}
                  {data?.accountName ? `${data.accountName} · ` : ''}
                  {formatDateTime(item.date)}{canManageAccount ? ' · Edit or delete' : canEditTransaction(item) ? ' · Edit today' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Text style={[styles.txAmount, { color: dep ? '#4ade80' : '#f87171' }]}>
                  {dep ? '+' : '-'}KES {formatKES(item.amount)}
                </Text>
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
        onRequestClose={() => !savingAccount && setAccountModalVisible(false)}
      >
        <KeyboardAvoidingView style={[styles.modalOverlay, { justifyContent: 'flex-end' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {editingAccountId ? 'Rename account' : 'Add bank account'}
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
            </View>
            ) : null}

            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {editingTransactionId !== null
                ? `Edit ${isDeposit ? 'Deposit' : isTransfer ? 'Transfer' : 'Withdrawal'}`
                : isDeposit ? 'Add Money to Account' : isTransfer ? 'Move Bank & Savings Funds' : 'Take Money Out'}
            </Text>

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
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              returnKeyType="next"
              testID="bank-amount-input"
            />

            {/* Deposits require a description. Withdrawal details come after the required category. */}
            {isDeposit && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
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

            {/* ── Deposited by (deposits only) ── */}
            {isDeposit && members.length > 0 && (
              <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  {isSharedWorkspace ? 'Who is depositing?' : 'Personal account'}{' '}
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
                    (s, id) => s + (parseFloat(depositorAmounts[id] || '0') || 0), 0
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
                              keyboardType="numeric"
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

            {/* Income source — only when exactly one named depositor is selected */}
            {isDeposit && singleDepositorId && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Where did this money come from?{' '}
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

                  {/* Savings chip */}
                  {(() => {
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

                {/* No goal selected yet hint */}
                {withdrawDest === 'savings' && !selectedGoal && !showGoalPicker && savingsGoals.length === 0 && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                    No savings goals set up yet
                  </Text>
                )}
              </>
            )}

            {/* Expense category (disbursements only) */}
            {isWithdrawal && (
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
                    {categories.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.categoryOption}
                        onPress={() => { setExpenseCategory(c.name); setShowCategoryPicker(false); }}
                      >
                        <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: 10, gap: 8 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                        CAN'T FIND IT? ADD A CATEGORY
                      </Text>
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

            {/* Date */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
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

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                isDeposit ? styles.submitDeposit : styles.submitDisburse,
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleSubmit}
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
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Set starting balance</Text>
            <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
              Enter the money already in this Shared budget’s bank account before the transactions shown below.
              This does not create a transaction.
            </Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Opening balance (KES)</Text>
            <TextInput
              value={openingBalanceDraft}
              onChangeText={setOpeningBalanceDraft}
              keyboardType="number-pad"
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
            <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
              Current balance = opening balance + deposits − withdrawals.
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
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 12,
  },
  actionBtnDisburse: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#0a1a10',
  },
  actionBtnTextDisburse: {
    color: '#f87171',
  },
  actionBtnDisabled: {
    opacity: 0.45,
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
