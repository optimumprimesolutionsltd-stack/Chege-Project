/**
 * A day's banking, entered as a list.
 *
 * The posting sheet asks one question at a time, which is right when there is
 * one thing to record and wrong when there are eleven. Somebody working off a
 * statement knows the whole day already; what they want is to write it down
 * and watch the balance come to the figure the bank shows.
 *
 * Rows can be anything the sheet can record — spending, a loan repayment,
 * money borrowed, somebody paying you back — because a real day is a mix, and
 * a screen that only took expenses would send people back to the sheet for
 * the one line that mattered.
 *
 * Nothing is stored about the batch. Each row is saved as an ordinary posting
 * with the same date, and afterwards the day looks exactly as it would had it
 * been typed one at a time. There is no batch to find, undo, or explain.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import { handleLapsedError } from '@/lib/lapsedError';
import { readAmount, toMoney } from '@/lib/bankAmount';
import { AmountCalcRow } from '@/components/AmountCalcRow';
import { balanceAsAt } from '@/lib/balanceAsAt';
import { BankAccountPicker } from '@/components/BankAccountPicker';
import { buildCategoryTree, filterCategoryTree, type CategoryRow } from '@workspace/category-tree';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import {
  customFetch,
  useCreateBudgetCategory,
  useCreateDeposit,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  getGetBudgetCategoriesQueryKey,
} from '@workspace/api-client-react';

type Party = {
  id: number;
  name: string;
  kind?: string | null;
  owedToUs?: number | null;
  owedByUs?: number | null;
};

type Account = { id: number; name: string; accountNumber?: string | null };

/**
 * What a row is, in the words somebody would use for it.
 *
 * Direction is implied by the kind rather than asked separately: nobody
 * thinks "money out, category rent", they think "rent".
 */
type RowKind =
  | 'spend'        // money out, against a category
  | 'pay-party'    // money out, to somebody you owe
  | 'money-in'     // ordinary money in
  | 'repaid'       // money in, somebody paying you back
  | 'borrowed'     // money in, a loan
  | 'lend';        // money out, a loan — the mirror of borrowed

/**
 * One fee on a row, posted separately, exactly as the sheet does.
 *
 * A statement line is often more than one charge — a withdrawal fee and
 * excise duty on the same entry — so a row carries a list rather than one
 * amount. The label is what the posting is called; left blank it falls back
 * to "Bank charge — <what the row was>", which was the only name a charge
 * could ever have before.
 */
type ChargeItem = {
  key: string;
  amount: string;
  category: string;
  label: string;
};

type DayRow = {
  key: string;
  kind: RowKind;
  amount: string;
  /** For spend, and for pay-party, which still needs to say what the cost was. */
  category: string;
  /** For pay-party, repaid, and borrowed-from-a-party. */
  partyId: number | null;
  /** For borrowed against a tracked debt rather than a party. */
  debtName: string | null;
  description: string;
  charges: ChargeItem[];
  /** For ordinary money in: which income stream it came from (optional). */
  incomeSourceId: number | null;
  /** Set once saved, so a retry does not post it twice. */
  saved: boolean;
  error: string | null;
};

/** Shared with the posting sheet: a bank charge is the same expense every time. */
const CHARGE_CATEGORY_KEY = 'jamvi:last-charge-category';

function formatKES(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankRow(): DayRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'spend',
    amount: '',
    category: '',
    partyId: null,
    debtName: null,
    description: '',
    incomeSourceId: null,
    // Always at least one, blank, so the amount beside the main figure has
    // something to bind to from the start — an unused blank charge posts
    // nothing, exactly like an empty charge amount always has.
    charges: [blankCharge('')],
    saved: false,
    error: null,
  };
}

function blankCharge(category: string): ChargeItem {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, amount: '', category, label: '' };
}

const KIND_LABEL: Record<RowKind, string> = {
  spend: 'Spending',
  'pay-party': 'Paying someone I owe',
  'money-in': 'Money in',
  repaid: 'Somebody paying me back',
  borrowed: 'Borrowed',
  lend: 'Lending',
};

/** Which way the money runs. The fee always runs out, whatever the row does. */
function isOutgoing(kind: RowKind): boolean {
  return kind === 'spend' || kind === 'pay-party' || kind === 'lend';
}

export default function BankDayScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [rows, setRows] = useState<DayRow[]>([blankRow()]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The category every fee on this day goes to, remembered across sittings so
  // the month's charges total instead of scattering.
  const [chargeCategory, setChargeCategory] = useState('');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CHARGE_CATEGORY_KEY)
      .then((stored) => {
        if (active && stored) setChargeCategory(stored);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const rememberChargeCategory = (rowKey: string, chargeKey: string, name: string) => {
    setChargeCategory(name);
    patchCharge(rowKey, chargeKey, { category: name });
    AsyncStorage.setItem(CHARGE_CATEGORY_KEY, name).catch(() => {});
  };

  const { data: account } = useGetJointAccount(
    selectedAccountId ? { accountId: selectedAccountId } : undefined,
  );
  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Account[];
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Party[]>('/api/contributors'),
    staleTime: 30_000,
  });

  // Whose income streams to offer on money in: the person's own in a Personal
  // budget, the group's in a shared one (deposits there go to the joint bank).
  const { data: incomeSources = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['income-sources', !isSharedWorkspace ? user?.id ?? '__me__' : '__group__'],
    queryFn: () => customFetch<{ id: number; name: string }[]>(
      !isSharedWorkspace && user?.id ? `/api/income-sources?userId=${user.id}` : '/api/income-sources',
    ),
    staleTime: 30_000,
  });

  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();

  const categoryTree = useMemo(
    () => buildCategoryTree(categories as unknown as CategoryRow[]),
    [categories],
  );
  const trackedDebts = useMemo(
    () =>
      (categories as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
        .filter((row) => typeof row.debtBalance === 'number'),
    [categories],
  );

  // The account has to be chosen before anything means anything, so default to
  // the one the balance query came back with rather than making it a step.
  const activeAccountId = selectedAccountId ?? accounts[0]?.id ?? null;
  // The account as it stood at the end of the chosen day, so changing the date
  // changes the figure. Postings already saved on that day are in it.
  const openingBalance = balanceAsAt(account, date);

  /** What one charge amounts to, blank or unparsable read as nothing yet. */
  const chargeAmount = (charge: ChargeItem): number => (charge.amount.trim() === '' ? 0 : readAmount(charge.amount) ?? 0);

  /** What each row moves, in the direction it moves it, every charge included. */
  const rowEffect = (row: DayRow): number => {
    const amount = row.amount.trim() === '' ? 0 : readAmount(row.amount) ?? 0;
    const fees = row.charges.reduce((total, charge) => total + chargeAmount(charge), 0);
    return (isOutgoing(row.kind) ? -amount : amount) - fees;
  };

  const unsavedRows = rows.filter((row) => !row.saved);
  const projected = openingBalance + unsavedRows.reduce((total, row) => total + rowEffect(row), 0);
  const readyCount = unsavedRows.filter((row) => {
    const amount = readAmount(row.amount);
    return amount !== null && amount > 0;
  }).length;

  const patchRow = (key: string, change: Partial<DayRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change, error: null } : row)));
  };

  const addRow = () => {
    const row = { ...blankRow(), charges: [blankCharge(chargeCategory)] };
    setRows((current) => [...current, row]);
    setOpenRow(row.key);
  };

  const removeRow = (key: string) => {
    setRows((current) => (current.length === 1 ? [blankRow()] : current.filter((row) => row.key !== key)));
  };

  const addCharge = (rowKey: string) => {
    setRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, charges: [...row.charges, blankCharge(chargeCategory)] } : row)),
    );
  };

  const removeCharge = (rowKey: string, chargeKey: string) => {
    setRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, charges: row.charges.filter((charge) => charge.key !== chargeKey) } : row)),
    );
  };

  const patchCharge = (rowKey: string, chargeKey: string, change: Partial<ChargeItem>) => {
    setRows((current) =>
      current.map((row) =>
        row.key === rowKey
          ? { ...row, charges: row.charges.map((charge) => (charge.key === chargeKey ? { ...charge, ...change } : charge)), error: null }
          : row,
      ),
    );
  };

  /** What is wrong with a row, in the words somebody can act on. */
  const rowProblem = (row: DayRow): string | null => {
    const amount = readAmount(row.amount);
    if (amount === null || amount <= 0) return 'Give it an amount.';
    // A loan out has no category, because it is not a cost — the same reason
    // (tabs)/bank.tsx leaves it out of expenseCategory entirely.
    if (isOutgoing(row.kind) && row.kind !== 'lend' && !row.category.trim()) return 'Give it a category.';
    if (row.kind === 'pay-party' && row.partyId === null) return 'Say who you are paying.';
    if (row.kind === 'repaid' && row.partyId === null) return 'Say who paid you.';
    if (row.kind === 'lend' && row.partyId === null) return 'Say who you are lending to.';
    if (row.kind === 'borrowed' && row.partyId === null && !row.debtName) {
      return 'Say what it was borrowed against, or from whom.';
    }
    for (const charge of row.charges) {
      if (charge.amount.trim() === '') continue;
      const fee = readAmount(charge.amount);
      if (fee === null || fee < 0) return 'Check the bank charge.';
      if (fee > 0 && !charge.category.trim()) return 'Give the bank charge a category.';
    }
    return null;
  };

  /**
   * Save one row.
   *
   * Each is its own posting, saved in the order they were written, so a
   * failure stops at a known point rather than leaving a hole in the middle.
   */
  const saveRow = async (row: DayRow): Promise<void> => {
    const amount = readAmount(row.amount) as number;
    const party = row.partyId === null ? null : parties.find((candidate) => candidate.id === row.partyId) ?? null;
    const narration = row.description.trim() || party?.name || row.category.trim() || KIND_LABEL[row.kind];

    if (row.kind === 'lend') {
      await createDisbursement({
        data: {
          amount,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          isLending: true,
          settlesContributorId: party?.id,
          accountId: activeAccountId ?? undefined,
        },
      });
    } else if (isOutgoing(row.kind)) {
      await createDisbursement({
        data: {
          amount,
          description: narration,
          date,
          expenseCategory: row.category.trim(),
          madeById: !isSharedWorkspace ? user?.id : null,
          destinationKind: 'category',
          accountId: activeAccountId ?? undefined,
        },
      });
    } else {
      await createDeposit({
        data: {
          amount,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          ...(row.kind === 'repaid' && party ? { settlesContributorId: party.id } : {}),
          ...(row.kind === 'borrowed' ? { isBorrowing: true } : {}),
          ...(row.kind === 'money-in' && row.incomeSourceId ? { incomeSourceId: row.incomeSourceId } : {}),
          accountId: activeAccountId ?? undefined,
        },
      });
    }

    // Every charge, each as its own posting, after the one it belongs to —
    // exactly as the sheet does it, and for the same reason. A statement line
    // can carry more than one (a withdrawal fee and excise duty together), so
    // each gets its own name rather than sharing one "Bank charge" label.
    for (const charge of row.charges) {
      const fee = chargeAmount(charge);
      if (fee <= 0) continue;
      await createDisbursement({
        data: {
          amount: fee,
          description: charge.label.trim() || `Bank charge — ${narration}`,
          date,
          expenseCategory: charge.category.trim(),
          madeById: !isSharedWorkspace ? user?.id : null,
          destinationKind: 'category',
          accountId: activeAccountId ?? undefined,
        },
      });
    }
  };

  /**
   * Offer the balance changes once, at the end.
   *
   * The sheet asks after every posting, which is fine for one and unbearable
   * for eleven. So the whole day's worth is offered together, still asked
   * rather than applied, for the same reason as always: the postings can be
   * edited or deleted afterwards and a balance moved by itself would be left
   * quietly wrong.
   */
  const offerBalanceChanges = async (saved: DayRow[]) => {
    type Change = { label: string; apply: () => Promise<void> };
    const changes: Change[] = [];

    for (const row of saved) {
      const amount = toMoney(readAmount(row.amount) ?? 0);
      if (amount <= 0) continue;
      const party = row.partyId === null ? null : parties.find((candidate) => candidate.id === row.partyId) ?? null;

      if (row.kind === 'pay-party' && party) {
        const owed = typeof party.owedByUs === 'number' ? party.owedByUs : 0;
        const remaining = Math.max(0, owed - amount);
        changes.push({
          label: `${party.name}: owe ${formatKES(owed)} → ${formatKES(remaining)}`,
          apply: async () => {
            await customFetch(`/api/contributors/${party.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owedByUs: remaining }),
            });
          },
        });
      } else if (row.kind === 'repaid' && party) {
        const owed = typeof party.owedToUs === 'number' ? party.owedToUs : 0;
        const remaining = Math.max(0, owed - amount);
        changes.push({
          label: `${party.name}: owes you ${formatKES(owed)} → ${formatKES(remaining)}`,
          apply: async () => {
            await customFetch(`/api/contributors/${party.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owedToUs: remaining }),
            });
          },
        });
      } else if (row.kind === 'lend' && party) {
        const owed = typeof party.owedToUs === 'number' ? party.owedToUs : 0;
        changes.push({
          label: `${party.name}: owes you ${formatKES(owed)} → ${formatKES(owed + amount)}`,
          apply: async () => {
            await customFetch(`/api/contributors/${party.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owedToUs: owed + amount }),
            });
          },
        });
      } else if (row.kind === 'borrowed' && party) {
        const owed = typeof party.owedByUs === 'number' ? party.owedByUs : 0;
        changes.push({
          label: `${party.name}: owe ${formatKES(owed)} → ${formatKES(owed + amount)}`,
          apply: async () => {
            await customFetch(`/api/contributors/${party.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owedByUs: owed + amount }),
            });
          },
        });
      } else if (row.kind === 'borrowed' && row.debtName) {
        const debt = trackedDebts.find((candidate) => candidate.name === row.debtName);
        if (!debt) continue;
        const owed = debt.debtBalance ?? 0;
        changes.push({
          label: `${debt.name}: ${formatKES(owed)} → ${formatKES(owed + amount)}`,
          apply: async () => {
            await customFetch(`/api/budget-categories/${debt.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ debtBalance: owed + amount }),
            });
          },
        });
      } else if (row.kind === 'spend') {
        const debt = trackedDebts.find(
          (candidate) => candidate.name.trim().toLocaleLowerCase() === row.category.trim().toLocaleLowerCase(),
        );
        if (!debt) continue;
        const owed = debt.debtBalance ?? 0;
        if (owed <= 0) continue;
        const remaining = Math.max(0, owed - amount);
        changes.push({
          label: `${debt.name}: ${formatKES(owed)} → ${formatKES(remaining)}`,
          apply: async () => {
            await customFetch(`/api/budget-categories/${debt.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ debtBalance: remaining }),
            });
          },
        });
      }
    }

    if (changes.length === 0) return;
    Alert.alert(
      changes.length === 1 ? 'Update this balance too?' : `Update ${changes.length} balances too?`,
      `${changes.map((change) => `· ${change.label}`).join('\n')}\n\nThe postings are already saved either way.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              for (const change of changes) await change.apply();
              await queryClient.invalidateQueries({ queryKey: ['parties'] });
              await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
            } catch (error: unknown) {
              Alert.alert('Some balances did not update', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleSaveAll = async () => {
    if (!activeAccountId) {
      Alert.alert('Which account?', 'Choose the account this day belongs to.');
      return;
    }
    const pending = rows.filter((row) => !row.saved && row.amount.trim() !== '');
    if (pending.length === 0) {
      Alert.alert('Nothing to save', 'Fill in at least one line.');
      return;
    }
    for (const row of pending) {
      const problem = rowProblem(row);
      if (problem) {
        patchRow(row.key, { error: problem });
        setOpenRow(row.key);
        Alert.alert('One line is not ready', problem);
        return;
      }
    }

    setSaving(true);
    const saved: DayRow[] = [];
    try {
      for (const row of pending) {
        try {
          await saveRow(row);
          saved.push(row);
          // Marked one at a time: a failure half way leaves what was written
          // written, and what was not still on screen to try again.
          setRows((current) => current.map((candidate) => (candidate.key === row.key ? { ...candidate, saved: true } : candidate)));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'It was not recorded.';
          setRows((current) => current.map((candidate) => (candidate.key === row.key ? { ...candidate, error: message } : candidate)));
          if (!handleLapsedError(error)) {
            Alert.alert(
              saved.length === 0 ? 'Nothing was saved' : `${saved.length} saved, then this one stopped`,
              `${message}\n\nWhat saved is saved. The rest is still here.`,
            );
          }
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['joint-account'] });
      await offerBalanceChanges(saved);
    } finally {
      setSaving(false);
    }
  };

  const savedCount = rows.filter((row) => row.saved).length;
  const allDone = savedCount > 0 && rows.every((row) => row.saved || row.amount.trim() === '');

  const partyLabel = (row: DayRow): string => {
    if (row.kind === 'borrowed' && row.debtName) return row.debtName;
    if (row.partyId === null) return 'Choose';
    return parties.find((candidate) => candidate.id === row.partyId)?.name ?? 'Choose';
  };

  return (
    <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} testID="bank-day-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>A day of banking</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Write the day down line by line, then save it in one go. Each line is saved as an ordinary posting — there is
        no batch afterwards, only the day.
      </Text>

      {/* One date for all of it, which is the point: this is a day. */}
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
      <Pressable
        onPress={() => setShowDatePicker(true)}
        testID="bank-day-date"
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}
      >
        <Text style={{ color: colors.foreground }}>{date}</Text>
        <Feather name="calendar" size={16} color={colors.mutedForeground} />
      </Pressable>
      {showDatePicker && (
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            setShowDatePicker(false);
            if (selected) setDate(selected.toISOString().slice(0, 10));
          }}
        />
      )}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Account</Text>
      {/* Listing every account as its own row, all visible at once, read as
          "these are all in play" rather than "pick one" — the choice was easy
          to miss and the rest sat there as noise once it was made. */}
      <BankAccountPicker
        accounts={accounts}
        selectedAccountId={activeAccountId}
        onSelect={setSelectedAccountId}
        testIDPrefix="bank-day-account"
      />

      {/* The figure somebody is working towards. */}
      <View style={[styles.balanceCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]} testID="bank-day-balance">
        <View style={styles.balanceRow}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Balance on {new Date(`${date}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>KES {formatKES(openingBalance)}</Text>
        </View>
        <View style={styles.balanceRow}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>After this day</Text>
          <Text
            testID="bank-day-projected"
            style={{ color: projected < 0 ? '#f87171' : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}
          >
            KES {formatKES(projected)}
          </Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
          Moves as you type, so you can work down to the figure on your statement.
        </Text>
      </View>

      {rows.map((row, index) => {
        const isOpen = openRow === row.key;
        const effect = rowEffect(row);
        return (
          <View
            key={row.key}
            testID={`bank-day-row-${index}`}
            style={[
              styles.rowCard,
              {
                backgroundColor: colors.card,
                borderColor: row.error ? '#f87171' : row.saved ? '#22c55e' : colors.border,
                opacity: row.saved ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.rowHead}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setOpenRow(isOpen ? null : row.key)}
                disabled={row.saved}
                testID={`bank-day-row-toggle-${index}`}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
                  {KIND_LABEL[row.kind].toUpperCase()}
                  {row.saved ? ' · SAVED' : ''}
                </Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                  {row.description.trim() || row.category.trim() || partyLabel(row)}
                </Text>
              </Pressable>
              <Text style={{ color: effect < 0 ? colors.foreground : '#4ade80', fontFamily: 'Inter_700Bold' }}>
                {effect < 0 ? '−' : '+'}KES {formatKES(Math.abs(effect))}
              </Text>
              {!row.saved && (
                <Pressable onPress={() => removeRow(row.key)} testID={`bank-day-remove-${index}`} accessibilityLabel="Remove this line">
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {row.error ? (
              <Text style={{ color: '#f87171', fontSize: 12, marginTop: 6 }} testID={`bank-day-row-error-${index}`}>{row.error}</Text>
            ) : null}

            {isOpen && !row.saved ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <View style={styles.kindRow}>
                  {(Object.keys(KIND_LABEL) as RowKind[]).map((kind) => (
                    <TouchableOpacity
                      key={kind}
                      onPress={() => patchRow(row.key, { kind, partyId: null, debtName: null })}
                      testID={`bank-day-kind-${index}-${kind}`}
                      style={[
                        styles.kindChip,
                        {
                          borderColor: row.kind === kind ? colors.primary : colors.border,
                          backgroundColor: row.kind === kind ? `${colors.primary}18` : 'transparent',
                        },
                      ]}
                    >
                      <Text style={{ color: row.kind === kind ? colors.primary : colors.mutedForeground, fontSize: 12 }}>
                        {KIND_LABEL[kind]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* The figure and its bank charge are one glance on a real
                    statement, so they sit side by side here too — the charge
                    was three fields further down, which read as unrelated to
                    the amount it actually came off. */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={row.amount}
                    onChangeText={(value) => patchRow(row.key, { amount: value })}
                    placeholder="Amount, or 1200+800"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    testID={`bank-day-amount-${index}`}
                    style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  />
                  <TextInput
                    value={row.charges[0]?.amount ?? ''}
                    onChangeText={(value) => patchCharge(row.key, row.charges[0].key, { amount: value })}
                    placeholder="Bank charge"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    testID={`bank-day-charge-${index}-0`}
                    style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  />
                </View>
                {/* decimal-pad has no operators, so the expression readAmount
                    already understands (see lib/bankAmount.ts) had no way to
                    be typed - these put +, -, x, / one tap away. */}
                <AmountCalcRow
                  amount={row.amount}
                  onChangeAmount={(value) => patchRow(row.key, { amount: value })}
                  testIDPrefix={`bank-day-amount-${index}`}
                />

                {isOutgoing(row.kind) && row.kind !== 'lend' ? (
                  <CategoryField
                    testID={`bank-day-category-${index}`}
                    value={row.category}
                    tree={categoryTree}
                    categories={categories as unknown as Array<{ id: number; name: string }>}
                    onPick={(name) => patchRow(row.key, { category: name })}
                    placeholder="Category"
                  />
                ) : null}

                {row.kind === 'pay-party' || row.kind === 'repaid' || row.kind === 'lend' ? (
                  <PartyField
                    testID={`bank-day-party-${index}`}
                    parties={parties}
                    value={row.partyId}
                    onPick={(id) => patchRow(row.key, { partyId: id })}
                    placeholder={row.kind === 'lend' ? 'Who you are lending to' : 'Who'}
                    owedField={row.kind === 'pay-party' ? 'owedByUs' : 'owedToUs'}
                  />
                ) : null}

                {row.kind === 'borrowed' ? (
                  <>
                    <PartyField
                      testID={`bank-day-lender-${index}`}
                      parties={parties}
                      value={row.partyId}
                      onPick={(id) => patchRow(row.key, { partyId: id, debtName: null })}
                      placeholder="Who lent it"
                      owedField="owedByUs"
                    />
                    {trackedDebts.length > 0 ? (
                      <View style={styles.kindRow}>
                        {trackedDebts.map((debt) => (
                          <TouchableOpacity
                            key={debt.id}
                            onPress={() => patchRow(row.key, { debtName: debt.name, partyId: null })}
                            testID={`bank-day-borrow-debt-${index}-${debt.id}`}
                            style={[
                              styles.kindChip,
                              {
                                borderColor: row.debtName === debt.name ? colors.primary : colors.border,
                                backgroundColor: row.debtName === debt.name ? `${colors.primary}18` : 'transparent',
                              },
                            ]}
                          >
                            <Text style={{ color: row.debtName === debt.name ? colors.primary : colors.mutedForeground, fontSize: 12 }}>
                              {debt.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {row.kind === 'money-in' && incomeSources.length > 0 ? (
                  <>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      Where did this money come from? (optional)
                    </Text>
                    <View style={styles.kindRow}>
                      {incomeSources.map((source) => {
                        const selected = row.incomeSourceId === source.id;
                        return (
                          <TouchableOpacity
                            key={source.id}
                            onPress={() => patchRow(row.key, { incomeSourceId: selected ? null : source.id })}
                            testID={`bank-day-income-source-${index}-${source.id}`}
                            style={[
                              styles.kindChip,
                              {
                                borderColor: selected ? colors.primary : colors.border,
                                backgroundColor: selected ? `${colors.primary}18` : 'transparent',
                              },
                            ]}
                          >
                            <Text style={{ color: selected ? colors.primary : colors.mutedForeground, fontSize: 12 }}>
                              {source.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <TextInput
                  value={row.description}
                  onChangeText={(value) => patchRow(row.key, { description: value })}
                  placeholder="What it was (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  testID={`bank-day-description-${index}`}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                />

                {/* The first charge's amount already sits beside the main
                    Amount field above — this is just its name and category.
                    A statement line can carry more than one charge though — a
                    withdrawal fee and a Fuliza access fee together — so
                    anything past the first gets its own full row below,
                    amount included. */}
                {row.charges[0] && row.charges[0].amount.trim() !== '' ? (
                  <>
                    <TextInput
                      value={row.charges[0].label}
                      onChangeText={(value) => patchCharge(row.key, row.charges[0].key, { label: value })}
                      placeholder="Name this charge (optional, e.g. Fuliza)"
                      placeholderTextColor={colors.mutedForeground}
                      testID={`bank-day-charge-label-${index}-0`}
                      style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                    />
                    <CategoryField
                      testID={`bank-day-charge-category-${index}-0`}
                      value={row.charges[0].category}
                      tree={categoryTree}
                      categories={categories as unknown as Array<{ id: number; name: string }>}
                      onPick={(name) => rememberChargeCategory(row.key, row.charges[0].key, name)}
                      placeholder="Charge category"
                    />
                  </>
                ) : null}
                {row.charges.slice(1).map((charge, extraIndex) => {
                  const chargeIndex = extraIndex + 1;
                  return (
                    <View key={charge.key} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          value={charge.amount}
                          onChangeText={(value) => patchCharge(row.key, charge.key, { amount: value })}
                          placeholder={`Bank charge ${chargeIndex + 1}`}
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                          testID={`bank-day-charge-${index}-${chargeIndex}`}
                          style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                        />
                        <Pressable
                          onPress={() => removeCharge(row.key, charge.key)}
                          testID={`bank-day-charge-remove-${index}-${chargeIndex}`}
                          accessibilityLabel="Remove this charge"
                        >
                          <Feather name="x" size={18} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                      <TextInput
                        value={charge.label}
                        onChangeText={(value) => patchCharge(row.key, charge.key, { label: value })}
                        placeholder="Name this charge (optional, e.g. Excise duty)"
                        placeholderTextColor={colors.mutedForeground}
                        testID={`bank-day-charge-label-${index}-${chargeIndex}`}
                        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                      />
                      {charge.amount.trim() !== '' ? (
                        <CategoryField
                          testID={`bank-day-charge-category-${index}-${chargeIndex}`}
                          value={charge.category}
                          tree={categoryTree}
                          categories={categories as unknown as Array<{ id: number; name: string }>}
                          onPick={(name) => rememberChargeCategory(row.key, charge.key, name)}
                          placeholder="Charge category"
                        />
                      ) : null}
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={() => addCharge(row.key)}
                  testID={`bank-day-add-charge-${index}`}
                  style={[styles.addRow, { borderColor: colors.border, height: 40 }]}
                >
                  <Feather name="plus" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Add another bank charge
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      <TouchableOpacity onPress={addRow} testID="bank-day-add-row" style={[styles.addRow, { borderColor: colors.border }]}>
        <Feather name="plus" size={16} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Add a line</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => void handleSaveAll()}
        disabled={saving || readyCount === 0}
        testID="bank-day-save-all"
        style={[styles.saveAll, { backgroundColor: colors.primary, opacity: saving || readyCount === 0 ? 0.55 : 1 }]}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }}>
            Save {readyCount} {readyCount === 1 ? 'line' : 'lines'}
          </Text>
        )}
      </TouchableOpacity>

      {savedCount > 0 ? (
        <Text style={{ color: '#22c55e', fontSize: 12, textAlign: 'center', marginTop: 10 }} testID="bank-day-saved-count">
          {savedCount} saved. {allDone ? 'The day is recorded.' : 'The rest is still here.'}
        </Text>
      ) : null}
    </PageScrollView>
  );
}

/** A category chosen from the tree, in the same shape the sheet uses. */
function CategoryField({
  value,
  tree,
  categories,
  onPick,
  placeholder,
  testID,
}: {
  value: string;
  tree: ReturnType<typeof buildCategoryTree>;
  categories: Array<{ id: number; name: string }>;
  onPick: (name: string) => void;
  placeholder: string;
  testID: string;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { mutateAsync: createCategory, isPending: creating } = useCreateBudgetCategory();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  // null is a top-level category of its own — never a second level, since the
  // server refuses one anyway.
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [newBudget, setNewBudget] = useState('');
  const [search, setSearch] = useState('');
  const visibleTree = filterCategoryTree(tree, search);

  const submitNewCategory = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Name it', 'Give this category a clear name, such as Transport or Childcare.');
      return;
    }
    if (categories.some((candidate) => candidate.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      Alert.alert('Already exists', 'Pick it from the list instead.');
      return;
    }
    const budgetAmount = newBudget.trim() === '' ? 0 : Number(newBudget);
    if (!Number.isInteger(budgetAmount) || budgetAmount < 0) {
      Alert.alert('Enter a valid monthly budget', 'Use a whole number of KES, or leave it blank.');
      return;
    }
    try {
      const created = await createCategory({
        data: {
          name,
          budgetAmount,
          priority: 3,
          isRecurring: true,
          activeMonth: null,
          activeYear: null,
          ...(newParentId !== null ? { parentId: newParentId } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      onPick(created.name);
      setNewName('');
      setNewParentId(null);
      setNewBudget('');
      setAdding(false);
      setOpen(false);
    } catch (error: unknown) {
      Alert.alert('Could not add it', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => { setSearch(''); setOpen((current) => !current); }}
        testID={testID}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground }}>{value || placeholder}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open ? (
        <View style={[styles.dropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
          {!adding ? (
            <>
              <CategorySearchBox value={search} onChange={setSearch} testID={`${testID}-search`} />
              {visibleTree.map((group) => (
                <View key={group.name}>
                  {group.children.length > 0 ? (
                    <>
                      <Text style={{ color: colors.dropdownMutedForeground, fontSize: 11, paddingHorizontal: 14, paddingTop: 10, fontFamily: 'Inter_600SemiBold' }}>
                        {group.name.toUpperCase()}
                      </Text>
                      {group.children.map((child) => (
                        <TouchableOpacity key={child} style={styles.option} onPress={() => { onPick(child); setOpen(false); }}>
                          <Text style={{ color: colors.dropdownForeground }}>{child}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : (
                    <TouchableOpacity style={styles.option} onPress={() => { onPick(group.name); setOpen(false); }}>
                      <Text style={{ color: colors.dropdownForeground }}>{group.name}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.option} onPress={() => setAdding(true)} testID={`${testID}-add-new`}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>+ Add a category or subcategory</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ padding: 12, gap: 8 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Name, such as Transport"
                placeholderTextColor={colors.mutedForeground}
                editable={!creating}
                testID={`${testID}-new-name`}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
              <Text style={{ color: colors.dropdownMutedForeground, fontSize: 12 }}>Where does it go?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setNewParentId(null)}
                  disabled={creating}
                  testID={`${testID}-new-parent-top-level`}
                  style={[
                    styles.kindChip,
                    { borderColor: newParentId === null ? colors.primary : colors.border, backgroundColor: newParentId === null ? colors.primary + '1F' : 'transparent' },
                  ]}
                >
                  <Text style={{ color: newParentId === null ? colors.primary : colors.mutedForeground, fontSize: 12 }}>Its own group</Text>
                </TouchableOpacity>
                {tree.map((group) => {
                  const parent = categories.find((candidate) => candidate.name === group.name);
                  if (!parent) return null;
                  const picked = newParentId === parent.id;
                  return (
                    <TouchableOpacity
                      key={parent.id}
                      onPress={() => setNewParentId(parent.id)}
                      disabled={creating}
                      testID={`${testID}-new-parent-${group.name}`}
                      style={[
                        styles.kindChip,
                        { borderColor: picked ? colors.primary : colors.border, backgroundColor: picked ? colors.primary + '1F' : 'transparent' },
                      ]}
                    >
                      <Text style={{ color: picked ? colors.primary : colors.mutedForeground, fontSize: 12 }}>Under {group.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={newBudget}
                onChangeText={setNewBudget}
                placeholder="Monthly budget, KES (optional)"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                editable={!creating}
                testID={`${testID}-new-budget`}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setAdding(false); setNewName(''); setNewParentId(null); setNewBudget(''); }}
                  disabled={creating}
                  style={[styles.field, { flex: 1, justifyContent: 'center', borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void submitNewCategory()}
                  disabled={creating}
                  testID={`${testID}-new-submit`}
                  style={[styles.field, { flex: 1, justifyContent: 'center', backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ color: colors.primaryForeground, textAlign: 'center', fontFamily: 'Inter_600SemiBold' }}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </>
  );
}

/** Somebody money passes between you and, whichever direction this row runs. */
function PartyField({
  parties,
  value,
  onPick,
  placeholder = 'Who',
  testID,
  owedField,
}: {
  parties: Party[];
  value: number | null;
  onPick: (id: number) => void;
  placeholder?: string;
  testID: string;
  /** Which balance a party created from here starts with — which side of the
   *  ledger they land on depends on why this field is being shown at all. */
  owedField: 'owedByUs' | 'owedToUs';
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  // This field only exists once a line's kind needs a party — Paying someone
  // I owe, Somebody paying me back, Lending, Borrowed. Landing on it with
  // nothing chosen yet is exactly the moment picking or creating a ledger is
  // the next thing to do, so it opens itself rather than waiting for a tap
  // that would otherwise land on "Choose" and nothing else.
  const [open, setOpen] = useState(value === null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOwed, setNewOwed] = useState('');
  const [creating, setCreating] = useState(false);
  const chosen = parties.find((party) => party.id === value) ?? null;

  const submitNewParty = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Who is it?', 'Give the person or institution a name, such as Mwangi or KCB.');
      return;
    }
    const owed = newOwed.trim() === '' ? 0 : readAmount(newOwed);
    if (owed === null || owed < 0) {
      Alert.alert('What is owed?', 'Enter zero or more, with up to two decimal places.');
      return;
    }
    setCreating(true);
    try {
      const created = await customFetch<{ id: number }>('/api/contributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, [owedField]: toMoney(owed) }),
      });
      // Awaited: onPick fires right after, and the picker's own list has to
      // already carry this party by the time anything reads it back.
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      onPick(created.id);
      setNewName('');
      setNewOwed('');
      setAdding(false);
      setOpen(false);
    } catch (error: unknown) {
      Alert.alert('Could not add them', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        testID={testID}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}
      >
        <Text style={{ color: chosen ? colors.foreground : colors.mutedForeground }}>{chosen?.name ?? placeholder}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open ? (
        <View style={[styles.dropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
          {!adding ? (
            <>
              {parties.length === 0 ? (
                <Text style={{ color: colors.dropdownMutedForeground, padding: 14, fontSize: 12 }}>
                  Nobody recorded yet.
                </Text>
              ) : (
                parties.map((party) => (
                  <TouchableOpacity key={party.id} style={styles.option} onPress={() => { onPick(party.id); setOpen(false); }}>
                    <Text style={{ color: colors.dropdownForeground }}>{party.name}</Text>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity style={styles.option} onPress={() => setAdding(true)} testID={`${testID}-add-new`}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>+ Add someone new</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ padding: 12, gap: 8 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Name, such as Mwangi or KCB"
                placeholderTextColor={colors.mutedForeground}
                editable={!creating}
                testID={`${testID}-new-name`}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
              <TextInput
                value={newOwed}
                onChangeText={setNewOwed}
                placeholder={
                  owedField === 'owedByUs' ? 'What you already owe them (optional)' : 'What they already owe you (optional)'
                }
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                editable={!creating}
                testID={`${testID}-new-owed`}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setAdding(false); setNewName(''); setNewOwed(''); }}
                  disabled={creating}
                  style={[styles.field, { flex: 1, justifyContent: 'center', borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void submitNewParty()}
                  disabled={creating}
                  testID={`${testID}-new-submit`}
                  style={[styles.field, { flex: 1, justifyContent: 'center', backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ color: colors.primaryForeground, textAlign: 'center', fontFamily: 'Inter_600SemiBold' }}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 14, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46, fontFamily: 'Inter_400Regular' },
  dropdown: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 11 },
  balanceCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16, gap: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, height: 46, marginTop: 14 },
  saveAll: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, height: 50, marginTop: 16 },
});
