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

import React, { useMemo, useState } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import { handleLapsedError } from '@/lib/lapsedError';
import { readAmount, toMoney } from '@/lib/bankAmount';
import { buildCategoryTree, type CategoryRow } from '@workspace/category-tree';
import {
  customFetch,
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
  | 'borrowed';    // money in, a loan

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
  /** The bank's fee on this row, posted separately, exactly as the sheet does. */
  charge: string;
  chargeCategory: string;
  /** Set once saved, so a retry does not post it twice. */
  saved: boolean;
  error: string | null;
};

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
    charge: '',
    chargeCategory: '',
    saved: false,
    error: null,
  };
}

const KIND_LABEL: Record<RowKind, string> = {
  spend: 'Spending',
  'pay-party': 'Paying someone I owe',
  'money-in': 'Money in',
  repaid: 'Somebody paying me back',
  borrowed: 'Borrowed',
};

/** Which way the money runs. The fee always runs out, whatever the row does. */
function isOutgoing(kind: RowKind): boolean {
  return kind === 'spend' || kind === 'pay-party';
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
  const openingBalance = account?.balance ?? 0;

  /** What each row moves, in the direction it moves it, fee included. */
  const rowEffect = (row: DayRow): number => {
    const amount = row.amount.trim() === '' ? 0 : readAmount(row.amount) ?? 0;
    const fee = row.charge.trim() === '' ? 0 : readAmount(row.charge) ?? 0;
    return (isOutgoing(row.kind) ? -amount : amount) - fee;
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
    const row = blankRow();
    setRows((current) => [...current, row]);
    setOpenRow(row.key);
  };

  const removeRow = (key: string) => {
    setRows((current) => (current.length === 1 ? [blankRow()] : current.filter((row) => row.key !== key)));
  };

  /** What is wrong with a row, in the words somebody can act on. */
  const rowProblem = (row: DayRow): string | null => {
    const amount = readAmount(row.amount);
    if (amount === null || amount <= 0) return 'Give it an amount.';
    if (isOutgoing(row.kind) && !row.category.trim()) return 'Give it a category.';
    if (row.kind === 'pay-party' && row.partyId === null) return 'Say who you are paying.';
    if (row.kind === 'repaid' && row.partyId === null) return 'Say who paid you.';
    if (row.kind === 'borrowed' && row.partyId === null && !row.debtName) {
      return 'Say what it was borrowed against, or from whom.';
    }
    if (row.charge.trim() !== '') {
      const fee = readAmount(row.charge);
      if (fee === null || fee < 0) return 'Check the bank charge.';
      if (fee > 0 && !row.chargeCategory.trim()) return 'Give the bank charge a category.';
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
    const fee = row.charge.trim() === '' ? 0 : readAmount(row.charge) ?? 0;
    const party = row.partyId === null ? null : parties.find((candidate) => candidate.id === row.partyId) ?? null;
    const narration = row.description.trim() || party?.name || row.category.trim() || KIND_LABEL[row.kind];

    if (isOutgoing(row.kind)) {
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
          accountId: activeAccountId ?? undefined,
        },
      });
    }

    // The fee, as its own posting, after the one it belongs to — exactly as
    // the sheet does it, and for the same reason.
    if (fee > 0) {
      await createDisbursement({
        data: {
          amount: fee,
          description: `Bank charge — ${narration}`,
          date,
          expenseCategory: row.chargeCategory.trim(),
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
      <View style={{ gap: 8 }}>
        {accounts.map((candidate) => (
          <TouchableOpacity
            key={candidate.id}
            onPress={() => setSelectedAccountId(candidate.id)}
            testID={`bank-day-account-${candidate.id}`}
            style={[
              styles.field,
              {
                borderColor: activeAccountId === candidate.id ? colors.primary : colors.border,
                backgroundColor: activeAccountId === candidate.id ? `${colors.primary}18` : colors.card,
              },
            ]}
          >
            <Text style={{ color: colors.foreground, fontFamily: activeAccountId === candidate.id ? 'Inter_700Bold' : 'Inter_400Regular' }}>
              {candidate.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* The figure somebody is working towards. */}
      <View style={[styles.balanceCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]} testID="bank-day-balance">
        <View style={styles.balanceRow}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Balance now</Text>
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

                <TextInput
                  value={row.amount}
                  onChangeText={(value) => patchRow(row.key, { amount: value })}
                  placeholder="Amount, or 1200+800"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  testID={`bank-day-amount-${index}`}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                />

                {isOutgoing(row.kind) ? (
                  <CategoryField
                    testID={`bank-day-category-${index}`}
                    value={row.category}
                    tree={categoryTree}
                    onPick={(name) => patchRow(row.key, { category: name })}
                    placeholder="Category"
                  />
                ) : null}

                {row.kind === 'pay-party' || row.kind === 'repaid' ? (
                  <PartyField
                    testID={`bank-day-party-${index}`}
                    parties={parties}
                    value={row.partyId}
                    onPick={(id) => patchRow(row.key, { partyId: id })}
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

                <TextInput
                  value={row.description}
                  onChangeText={(value) => patchRow(row.key, { description: value })}
                  placeholder="What it was (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  testID={`bank-day-description-${index}`}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                />

                <TextInput
                  value={row.charge}
                  onChangeText={(value) => patchRow(row.key, { charge: value })}
                  placeholder="Bank charge on this line (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  testID={`bank-day-charge-${index}`}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                />
                {row.charge.trim() !== '' ? (
                  <CategoryField
                    testID={`bank-day-charge-category-${index}`}
                    value={row.chargeCategory}
                    tree={categoryTree}
                    onPick={(name) => patchRow(row.key, { chargeCategory: name })}
                    placeholder="Charge category"
                  />
                ) : null}
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
  onPick,
  placeholder,
  testID,
}: {
  value: string;
  tree: ReturnType<typeof buildCategoryTree>;
  onPick: (name: string) => void;
  placeholder: string;
  testID: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        testID={testID}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground }}>{value || placeholder}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open ? (
        <View style={[styles.dropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
          {tree.map((group) => (
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
}: {
  parties: Party[];
  value: number | null;
  onPick: (id: number) => void;
  placeholder?: string;
  testID: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const chosen = parties.find((party) => party.id === value) ?? null;
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
          {parties.length === 0 ? (
            <Text style={{ color: colors.dropdownMutedForeground, padding: 14, fontSize: 12 }}>
              Nobody recorded yet. Add them from Deposit or Withdraw, where the balance can be set at the same time.
            </Text>
          ) : (
            parties.map((party) => (
              <TouchableOpacity key={party.id} style={styles.option} onPress={() => { onPick(party.id); setOpen(false); }}>
                <Text style={{ color: colors.dropdownForeground }}>{party.name}</Text>
              </TouchableOpacity>
            ))
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
