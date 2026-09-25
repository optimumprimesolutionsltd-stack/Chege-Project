import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  customFetch,
  getGetBudgetCategoriesQueryKey,
  useCreateBudgetCategory,
  useCreateDeposit,
  useGetSavingsGoals,
  useTransferBankToBank,
  useTransferBankToSavings,
  useTransferSavingsToBank,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  useGetWorkspaces,
  useSelectWorkspace,
} from '@workspace/api-client-react';
import { buildCategoryTree, filterCategoryTree, type CategoryRow } from '@workspace/category-tree';

import { BankAccountPicker } from '@/components/BankAccountPicker';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { PageScrollView } from '@/components/PageScrollReset';
import { ScreenHint } from '@/components/ScreenHint';
import { useColors } from '@/hooks/useColors';
import { canReceiveShares } from '@/lib/shareIntent';
import {
  balanceChanges,
  canLinkDebt,
  DEBT_LABEL,
  debtKindsFor,
  matchParty,
  suggestDebtKind,
  type DebtKind,
  type PartyLite,
} from '@/lib/mpesaDebts';
import {
  applyNicknames,
  canNickname,
  nicknameStorageKey,
  parseStoredNicknames,
  withNickname,
  type NicknameMap,
} from '@/lib/payeeNicknames';
import { onSharedMessages, takeSharedMessages } from '@/lib/sharedMessages';
import { useAuth } from '@/lib/auth';
import { useDraft } from '@/lib/draft';
import { clearQueryClientCache } from '@/lib/queryPersist';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace';
import { formatExact } from '@/lib/formatExact';
import { StatementReader, type ReaderJob } from '@/components/StatementReader';
import { rememberMpesaCard } from '@/lib/mpesaCard';
import { parseStoredRules, payeeKey, payeeName, rulesStorageKey, withRule, withoutRule, type PayeeRules } from '@/lib/payeeLearning';
import { canReadStatements, chooseStatement, statementBase64, type ChosenStatement } from '@/lib/statementFile';
import { shownFileName } from '@/lib/shownFileName';
import { reconcile, statementLines, type StatementReading } from '@/lib/statementImport';
import { checkRunningBalance, readStatementRows, resolveDirections } from '@/lib/statementTable';
import type { ReaderMessage } from '@/lib/statementReaderHtml';
import {
  buildPostings,
  categoryPath,
  chooseCategory as chooseLineCategory,
  chooseIncomeSource,
  canUseSavings,
  chooseContribution,
  chooseSavings,
  chooseTransfer,
  destinationOf,
  isMove,
  throughMpesaHints,
  initialChoices,
  canReport,
  isRecordable,
  lineLabel,
  messageFor,
  categoryChanges,
  problemWith,
  recategorisable,
  reviewCounts,
  reviewStatus,
  type ReviewView,
  redactForReport,
  refreshSuggestions,
  snippetFor,
  summarise,
  type Choice,
  type PreviewLine,
} from '@/lib/mpesaImport';

// Shared with the day of banking and the Bank form: a fee is the same expense every time.
const CHARGE_CATEGORY_KEY = 'jamvi:last-charge-category';

const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** A statement is kept this long, so it can be worked through over days. */
const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type Outcome = { saved: number; repeats: number; failed: Array<{ what: string; why: string }> };

/**
 * A category picked from the tree, in a sheet with a search box.
 *
 * It loads the budget's categories itself, the same way the day of banking's
 * category field does, and says what it is doing: still loading, could not load
 * (with a retry), or this budget genuinely has none. A picker that only ever
 * says "no category matches that" leaves somebody guessing which of those it is.
 * A category can also be added right here, since a payment with nowhere to go
 * should not send someone away from the messages they have pasted.
 */
function CategorySheet({
  visible,
  budgetName,
  onPick,
  onClose,
}: {
  visible: boolean;
  budgetName: string | undefined;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  // The sheet sits at the very bottom of the screen, so without the safe-area
  // inset its last row ("Add a category") slid under the phone's navigation bar.
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: list = [], isLoading, isError, refetch } = useGetBudgetCategories();
  const categories = list as unknown as CategoryRow[];
  const { mutateAsync: createCategory, isPending: creating } = useCreateBudgetCategory();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  // null is a category (or a new group) of its own; a number is the group it goes under.
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const tree = useMemo(() => filterCategoryTree(buildCategoryTree(categories), search), [categories, search]);
  // Only a top-level category can be a group: the app keeps two levels, and the server refuses a third.
  const parentChoices = useMemo(
    () => categories.filter((row) => !row.parentId && row.name.trim().toLocaleLowerCase() !== 'other'),
    [categories],
  );

  const pick = (name: string) => {
    setSearch('');
    setAdding(false);
    setNewName('');
    setNewParentId(null);
    onPick(name);
  };

  const addCategory = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Name it', 'Give this category a clear name, such as Transport or Airtime.');
      return;
    }
    const existing = categories.find((row) => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      pick(existing.name);
      return;
    }
    try {
      const created = await createCategory({
        data: {
          name,
          budgetAmount: 0,
          priority: 3,
          isRecurring: true,
          activeMonth: null,
          activeYear: null,
          ...(newParentId !== null ? { parentId: newParentId } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      pick(created.name);
    } catch (error: unknown) {
      Alert.alert('Could not add it', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const nothingToShow = tree.length === 0;
  const emptyText = isLoading
    ? 'Loading your categories…'
    : isError
      ? 'Could not load your categories.'
      : categories.length === 0
        ? `${budgetName ? `“${budgetName}”` : 'This budget'} has no categories yet. Add one below.`
        : 'No category matches that.';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What was it for?</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <CategorySearchBox value={search} onChange={setSearch} testID="mpesa-category-search" />
          {tree.some((group) => group.children.length > 0) ? (
            <Text style={[styles.hint, { color: colors.mutedForeground, paddingHorizontal: 16 }]} testID="mpesa-category-hint">
              The names in capitals are groups. Pick one of the categories under them.
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }} testID="mpesa-category-list">
            {tree.map((group) => (
              <View key={group.name}>
                {group.children.length > 0 ? (
                  <>
                    <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{group.name.toUpperCase()}</Text>
                    {group.children.map((child) => (
                      <Pressable key={child} style={styles.option} onPress={() => pick(child)}>
                        <Text style={{ color: colors.foreground }}>{child}</Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <Pressable style={styles.option} onPress={() => pick(group.name)}>
                    <Text style={{ color: colors.foreground }}>{group.name}</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {nothingToShow ? (
              <View testID="mpesa-category-empty">
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{emptyText}</Text>
                {isError ? (
                  <Pressable onPress={() => refetch()} accessibilityRole="button" style={styles.secondary} testID="mpesa-category-retry">
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Try again</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
          <View style={[styles.addBox, { borderColor: colors.border }]}>
            {adding ? (
              <>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={search.trim() ? search.trim() : 'Name it, such as Transport'}
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  editable={!creating}
                  style={[styles.pasteBox, { minHeight: 44, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  testID="mpesa-category-new-name"
                />
                <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Put it under</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  testID="mpesa-category-parents"
                >
                  {[{ id: null as number | null, name: 'Its own (or a new group)' }, ...parentChoices].map((choice) => {
                    const on = newParentId === choice.id;
                    return (
                      <Pressable
                        key={choice.id ?? 'own'}
                        onPress={() => setNewParentId(choice.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`mpesa-category-parent-${choice.id ?? 'own'}`}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on ? `${colors.primary}22` : colors.muted,
                        }}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                          {choice.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  onPress={addCategory}
                  disabled={creating}
                  style={[styles.primary, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  testID="mpesa-category-add"
                >
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add and use it</Text>}
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setNewName(search.trim());
                  setAdding(true);
                }}
                accessibilityRole="button"
                testID="mpesa-category-add-open"
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>＋ Add a category</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Paste M-Pesa messages, look over what Jamvi read, and save the lot.
 *
 * Nothing is recorded until the person taps Save, every payment needs a
 * category they have seen, and a message already recorded is skipped, never
 * counted twice. What was pasted is read and forgotten.
 */
export default function MpesaImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const isShared = group?.isPrivate === false;

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string }>;
  const { data: categoryList = [] } = useGetBudgetCategories();
  const categories = categoryList as unknown as CategoryRow[];
  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();
  const { mutateAsync: transferBankToBank } = useTransferBankToBank();
  const { mutateAsync: transferBankToSavings } = useTransferBankToSavings();
  const { mutateAsync: transferSavingsToBank } = useTransferSavingsToBank();
  const { data: savingsGoalList = [] } = useGetSavingsGoals();
  const savingsGoals = savingsGoalList as unknown as Array<{ id: number; name: string; isCompleted?: boolean }>;

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // M-Pesa is usually its own account: start on one that says so.
  const guessedAccount = accounts.find((account) => /m-?pesa/i.test(account.name))?.id ?? accounts[0]?.id ?? null;
  const accountId = selectedAccountId ?? guessedAccount;
  const { data: account } = useGetJointAccount(accountId ? { accountId } : undefined);
  const history = useMemo(
    () => ((account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null }>),
    [account],
  );
  // Where money in can be said to have come from: the person's own sources in a
  // Personal budget, everybody's in a shared group (each names its owner).
  const { data: incomeSources = [] } = useQuery<Array<{ id: number; name: string; userId?: string | null }>>({
    queryKey: ['income-sources', !isShared ? user?.id ?? '__me__' : '__group__'],
    queryFn: () =>
      customFetch<Array<{ id: number; name: string; userId?: string | null }>>(
        !isShared && user?.id ? `/api/income-sources?userId=${user.id}` : '/api/income-sources',
      ),
    staleTime: 30_000,
  });

  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  // A statement PDF: read on this phone, with its password used only here.
  const [statementFile, setStatementFile] = useState<ChosenStatement | null>(null);
  const [statementPassword, setStatementPassword] = useState('');
  const [readerJob, setReaderJob] = useState<ReaderJob | null>(null);
  const [statementNote, setStatementNote] = useState<string | null>(null);
  const [statementReading, setStatementReading] = useState<StatementReading | null>(null);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.
  const [view, setView] = useState<ReviewView>('all');
  const [chargeCategory, setChargeCategory] = useState('');
  // A number is a line being categorised; 'charge' is the M-Pesa charges; 'recat:N' is an already-recorded entry whose category is being changed.
  const [picking, setPicking] = useState<number | 'charge' | `recat:${number}` | null>(null);
  const [recat, setRecat] = useState<Record<number, string>>({});
  const [recategorising, setRecategorising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Unfinished work survives an update restart, a crash, or a switch of budget.
  const pendingChoicesRef = React.useRef<Record<number, Choice> | null>(null);
  const { restored, dismiss: dismissRestored, discard: discardDraft } = useDraft<{
    text: string;
    choices: Record<number, Choice>;
    hasRead: boolean;
    accountId: number | null;
  }>({
    key: 'mpesa-import',
    value: { text, choices, hasRead: lines !== null, accountId: selectedAccountId },
    active: !outcome && text.trim() !== '',
    onRestore: (saved) => {
      setText(saved.text);
      if (saved.accountId) setSelectedAccountId(saved.accountId);
      if (saved.hasRead) {
        pendingChoicesRef.current = saved.choices;
        void readRef.current(saved.text);
      }
    },
  });
  // A statement is worked through at the person's own pace: what is still to do is kept
  // on this phone (never the PDF or its password) and picked up again where it was left.
  const statementLeft = (statementReading?.lines ?? []).filter(isRecordable).length;
  const { discard: discardStatementDraft } = useDraft<{
    reading: StatementReading;
    choices: Record<number, Choice>;
    accountId: number | null;
  }>({
    key: 'mpesa-statement',
    value: { reading: statementReading as StatementReading, choices, accountId: selectedAccountId },
    active: statementReading !== null && statementLeft > 0,
    maxAgeMs: STATEMENT_DRAFT_MAX_AGE_MS,
    onRestore: (saved) => {
      if (!saved.reading?.lines) return;
      if (saved.accountId) setSelectedAccountId(saved.accountId);
      setStatementReading(saved.reading);
      setLines(saved.reading.lines);
      setChoices(saved.choices);
      setStatementNote('Picked up where you left off with your statement. Anything saved since is marked as recorded.');
      // Some may have been saved from another screen since: ask again which are recorded.
      markRecorded(saved.reading.lines)
        .then((checked) => {
          setLines(checked);
          setStatementReading((current) => (current ? { ...current, lines: checked } : current));
        })
        .catch(() => {});
    },
  });

  const startOver = () => {
    discardStatementDraft();
    setStatementNote(null);
    setStatementReading(null);
    discardDraft();
    pendingChoicesRef.current = null;
    setText('');
    setLines(null);
    setChoices({});
  };

  // Which budget these will be saved into, and a way to change it without losing the paste.
  const { data: workspaces = [] } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const [switchingBudget, setSwitchingBudget] = useState(false);
  const [budgetPickerOpen, setBudgetPickerOpen] = useState(false);
  const switchedToRef = React.useRef<number | null>(null);
  const switchBudget = async (groupId: number) => {
    if (groupId === group?.id) {
      setBudgetPickerOpen(false);
      return;
    }
    setSwitchingBudget(true);
    try {
      await selectWorkspace.mutateAsync({ data: { groupId } });
      await AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));
      // Nothing from the old budget may survive the switch, the same as switching in Settings.
      await clearQueryClientCache();
      queryClient.clear();
      switchedToRef.current = groupId;
      setSelectedAccountId(null);
      setChoices({});
      setBudgetPickerOpen(false);
    } catch (error: unknown) {
      Alert.alert('Could not switch budget', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSwitchingBudget(false);
    }
  };
  // Once the new budget has loaded, read the same messages again: duplicates,
  // suggestions and nicknames are all per budget.
  useEffect(() => {
    if (switchedToRef.current === null || group?.id !== switchedToRef.current) return;
    switchedToRef.current = null;
    if (textRef.current.trim()) void readRef.current(textRef.current);
    // Runs when the budget changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  // Names the person gave payees, kept on this device for this budget.
  const [nicknames, setNicknames] = useState<NicknameMap>({});
  const [naming, setNaming] = useState<{ index: number; original: string; text: string } | null>(null);
  // What Jamvi was asked to remember: a payee's category, kept on this phone for this budget.
  const rulesKey = rulesStorageKey(group?.id);
  const [rules, setRules] = useState<PayeeRules>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(rulesKey)
      .then((stored) => {
        if (active) setRules(parseStoredRules(stored));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [rulesKey]);
  const keepRules = (next: PayeeRules) => {
    setRules(next);
    AsyncStorage.setItem(rulesKey, JSON.stringify(next)).catch(() => {});
  };

  const nicknamesKey = nicknameStorageKey(group?.id);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(nicknamesKey)
      .then((stored) => {
        if (active) setNicknames(parseStoredNicknames(stored));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [nicknamesKey]);

  const saveNickname = () => {
    if (!naming || !lines) return;
    const next = withNickname(nicknames, naming.original, naming.text);
    setNicknames(next);
    AsyncStorage.setItem(nicknamesKey, JSON.stringify(next)).catch(() => {});
    const renamed = applyNicknames(lines, next);
    setLines(renamed);
    setChoices((current) => refreshSuggestions(renamed, current, history, categories.map((row) => row.name), chargeCategory, rules));
    setNaming(null);
  };

  // The categories and this account's history can arrive after the messages were
  // read (a Share opens the app cold, and they load in the background). When they
  // do, suggest again for lines still on a suggestion or on nothing; a category
  // the person chose is never touched.
  useEffect(() => {
    if (!lines) return;
    setChoices((current) => refreshSuggestions(lines, current, history, categories.map((row) => row.name), chargeCategory, rules));
    // Runs when the lists load, not on every choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryList, account]);

  // Sending a message Jamvi could not read, so its format can be learned.
  const [reporting, setReporting] = useState<{ index: number; text: string } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reported, setReported] = useState<Set<number>>(new Set());

  const openReport = (index: number) => {
    const message = messageFor(text, index);
    if (message) setReporting({ index, text: redactForReport(message) });
  };

  const sendReport = async () => {
    if (!reporting || sendingReport) return;
    setSendingReport(true);
    try {
      await customFetch('/api/mpesa/report-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reporting.text }),
      });
      setReported((current) => new Set(current).add(reporting.index));
      setReporting(null);
      Alert.alert('Thank you', 'Jamvi will learn this kind of message.');
    } catch (error: unknown) {
      Alert.alert('Could not send it', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSendingReport(false);
    }
  };

  const reportLink = (item: PreviewLine) => {
    if (!canReport(item)) return null;
    return reported.has(item.index) ? (
      <Text style={[styles.hint, { color: colors.success }]}>Sent. Thank you.</Text>
    ) : (
      <Pressable onPress={() => openReport(item.index)} accessibilityRole="button" testID={`mpesa-report-${item.index}`} hitSlop={6}>
        <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
          Send this message so Jamvi can learn it
        </Text>
      </Pressable>
    );
  };

  useEffect(() => {
    AsyncStorage.getItem(CHARGE_CATEGORY_KEY).then((stored) => stored && setChargeCategory(stored)).catch(() => {});
  }, []);

  const readMessages = async (pasted: string = text) => {
    if (!pasted.trim()) {
      Alert.alert('Paste your messages', 'Copy them from your Messages app, then paste them here.');
      return;
    }
    setReading(true);
    try {
      const response = await customFetch<{ lines: PreviewLine[] }>('/api/mpesa/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasted }),
      });
      // Read fresh: a share can be read before the effect above has loaded them.
      const known = parseStoredNicknames(await AsyncStorage.getItem(nicknamesKey).catch(() => null));
      setNicknames(known);
      const shown = applyNicknames(response.lines, known);
      setLines(shown);
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), chargeCategory, rules));
      // A restored draft brings back what was chosen by hand, on top of the fresh reading.
      const restoredChoices = pendingChoicesRef.current;
      if (restoredChoices) {
        pendingChoicesRef.current = null;
        setChoices((current) => ({ ...current, ...restoredChoices }));
      }
    } catch (error: unknown) {
      Alert.alert('Could not read them', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReading(false);
    }
  };

  // Which of a statement's entries this budget already has: asked with the receipt codes only.
  const markRecorded = async (all: PreviewLine[]): Promise<PreviewLine[]> => {
    const codes = [...new Set(all.map((line) => line.receipt).filter((code): code is string => Boolean(code)))];
    if (codes.length === 0) return all;
    const body = await customFetch<{ recorded: Array<{ receipt: string; date: string; description: string; category?: string | null; editable?: boolean }> }>('/api/mpesa/import/check-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipts: codes }),
    });
    const recorded = new Map(body.recorded.map((row) => [row.receipt, { date: row.date, description: row.description, category: row.category ?? null, editable: row.editable === true }]));
    return all.map((line) => {
      const existing = line.receipt ? recorded.get(line.receipt) : undefined;
      return existing ? { ...line, alreadyRecorded: existing } : line;
    });
  };

  const pickStatement = async () => {
    try {
      const chosen = await chooseStatement();
      if (chosen) setStatementFile(chosen);
    } catch (error: unknown) {
      Alert.alert('Could not open that file', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const readStatement = async () => {
    if (!statementFile || readerJob) return;
    setReading(true);
    try {
      setReaderJob({ base64: await statementBase64(statementFile.uri), password: statementPassword });
    } catch (error: unknown) {
      setReading(false);
      Alert.alert('Could not read the statement', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  // The hidden page has read the PDF (or said why it could not): turn it into the same list a paste makes.
  const onStatementRead = async (result: ReaderMessage) => {
    if (result.type === 'ready') return;
    setReaderJob(null);
    try {
      if (result.type === 'error') {
        if (result.name === 'PasswordException') {
          Alert.alert(
            result.code === 2 ? 'Wrong password' : 'Password needed',
            result.code === 2 ? 'That did not open the statement. Try again.' : 'Type the password M-Pesa sent with the statement.',
          );
          return;
        }
        throw new Error('Jamvi could not open this file. Is it the M-Pesa statement PDF?');
      }
      const rows = resolveDirections(readStatementRows(result.pages));
      if (rows.length === 0) throw new Error('Jamvi could not find the payments in this file. Is it the M-Pesa statement PDF?');
      if (!checkRunningBalance(rows).ok) {
        throw new Error('This statement does not add up, so Jamvi will not risk recording wrong amounts. Paste your messages instead.');
      }
      const reading = statementLines(rows);
      const checked = await markRecorded(reading.lines);
      const known = parseStoredNicknames(await AsyncStorage.getItem(nicknamesKey).catch(() => null));
      setNicknames(known);
      const shown = applyNicknames(checked, known);
      const left = [
        reading.loanDraws > 0 ? `${reading.loanDraws} Fuliza loans` : null,
        reading.loanRepayments > 0 ? `${reading.loanRepayments} loan repayments` : null,
      ].filter(Boolean);
      setStatementNote(
        `Read ${shown.length} entries from your statement. It adds up.${left.length > 0 ? ` Left out because they are not spending or income: ${left.join(' and ')}. What a Fuliza loan paid for is recorded as a normal payment.` : ''}`,
      );
      setLines(shown);
      setStatementReading({ ...reading, lines: shown });
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), chargeCategory, rules));
      setStatementPassword('');
    } catch (error: unknown) {
      Alert.alert('Could not read the statement', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReading(false);
    }
  };

  // Messages shared from another app: added to what is here and read at once, whether
  // they arrived as the screen opened or while it was already open.
  const textRef = React.useRef(text);
  textRef.current = text;
  const readRef = React.useRef(readMessages);
  readRef.current = readMessages;
  useEffect(() => {
    const takeShared = () => {
      const shared = takeSharedMessages();
      if (!shared) return;
      const combined = textRef.current.trim() ? `${textRef.current}\n\n${shared}` : shared;
      setText(combined);
      void readRef.current(combined);
    };
    takeShared();
    return onSharedMessages(takeShared);
    // The refs above always hold the latest reader and text; re-subscribing on every change would drop shares.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (index: number, include: boolean) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], include } }));

  const chooseCategory = (name: string) => {
    if (typeof picking === 'string' && picking.startsWith('recat:')) {
      setRecat((current) => ({ ...current, [Number(picking.slice(6))]: name }));
    } else if (picking === 'charge') {
      setChargeCategory(name);
      AsyncStorage.setItem(CHARGE_CATEGORY_KEY, name).catch(() => {});
    } else if (typeof picking === 'number') {
      setChoices((current) => chooseLineCategory(lines ?? [], current, picking, name));
    }
    setPicking(null);
  };

  // Would saving these leave the account moved as far as the statement says M-Pesa moved?
  const balanceCheck = useMemo(
    () => (statementReading && lines ? reconcile({ ...statementReading, lines }, (line) => choices[line.index]?.include === true) : null),
    [statementReading, lines, choices],
  );

  const summary = useMemo(() => (lines ? summarise(lines, choices) : null), [lines, choices]);
  // Which entry the red message is about, so tapping it can take you there.
  const firstProblemIndex = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) if (problemWith(item, choices[item.index])) return item.index;
    return null;
  }, [lines, choices]);
  const scrollRef = React.useRef<ScrollView>(null);
  const lineTops = React.useRef<Record<number, number>>({});
  const showProblem = () => {
    if (firstProblemIndex === null) return;
    // The entry may be hidden by a filter: show everything first, then go to it.
    setView('all');
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (lineTops.current[firstProblemIndex] ?? 0) - 12), animated: true }), 80);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !chargeCategory.trim()) return 'Choose a category for the M-Pesa charges.';
    return null;
  }, [lines, choices, summary, chargeCategory]);

  // Who owes who, and the categories that track a debt: a payment to or from a
  // person can be a debt or a loan, and paying a debt's category pays it down.
  const { data: parties = [] } = useQuery<PartyLite[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<PartyLite[]>('/api/contributors'),
    staleTime: 30_000,
  });
  const transferHints = useMemo(() => throughMpesaHints(lines ?? []), [lines]);
  const otherAccounts = accounts.filter((option) => option.id !== accountId);
  const debtCategories = useMemo(
    () =>
      (categoryList as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
        .filter((row) => row.debtBalance !== null && row.debtBalance !== undefined)
        .map((row) => ({ id: row.id, name: row.name, debtBalance: row.debtBalance })),
    [categoryList],
  );
  const [debtFor, setDebtFor] = useState<{ index: number; partyId: number | null; kind: DebtKind | null } | null>(null);
  const setDebt = (index: number, debt: { kind: DebtKind; partyId: number } | null) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], debt } }));

  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];

  // Changing the category of entries already recorded: nothing else about them is touched.
  const pendingChanges = useMemo(() => categoryChanges(lines ?? [], recat), [lines, recat]);
  const applyRecategorise = () => {
    if (pendingChanges.length === 0 || recategorising) return;
    Alert.alert(
      `Change ${pendingChanges.length} ${pendingChanges.length === 1 ? 'category' : 'categories'}?`,
      'Only the category changes. Their amounts, dates and everything else stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            setRecategorising(true);
            try {
              const result = await customFetch<{ updated: number; skipped: string[] }>('/api/mpesa/import/recategorise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changes: pendingChanges }),
              });
              const done = new Set(pendingChanges.filter((change) => !result.skipped.includes(change.receipt)).map((change) => change.receipt));
              const next = (lines ?? []).map((item) =>
                item.receipt && done.has(item.receipt) && item.alreadyRecorded
                  ? { ...item, alreadyRecorded: { ...item.alreadyRecorded, category: recat[item.index] } }
                  : item,
              );
              setLines(next);
              setStatementReading((current) => (current ? { ...current, lines: next } : current));
              setRecat({});
              void queryClient.invalidateQueries();
              Alert.alert(
                `${result.updated} ${result.updated === 1 ? 'category' : 'categories'} changed`,
                result.skipped.length > 0 ? `${result.skipped.length} could not be changed (they are not plain spending).` : undefined,
              );
            } catch (error: unknown) {
              Alert.alert('Could not change them', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setRecategorising(false);
            }
          },
        },
      ],
    );
  };

  const saveAll = async () => {
    if (!lines || !accountId || saving) return;
    if (firstProblem) {
      Alert.alert('Not quite ready', firstProblem);
      return;
    }
    setSaving(true);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
    const savedIndexes = new Set<number>();
    try {
      for (const item of lines) {
        const choice = choices[item.index];
        if (!choice?.include || !isRecordable(item)) continue;
        const built = buildPostings(item, choice, {
          accountId,
          userId: user?.id,
          isShared,
          today: todayIso(),
          chargeCategory,
          incomeSources,
        });
        if (!built) continue;
        try {
          if (built.kind === 'deposit') {
            await createDeposit({ data: built.main as never });
          } else if (built.kind === 'savings') {
            // Into or out of a savings goal, with any charge on the M-Pesa side.
            const moved = built.direction === 'out'
              ? await transferBankToSavings({ data: built.main as never })
              : await transferSavingsToBank({ data: built.main as never });
            if (built.fee) {
              try {
                await createDisbursement({ data: { ...built.fee, chargeForTransactionId: (moved as { id: number }).id } as never });
              } catch {
                result.failed.push({ what: `${item.description} charge`, why: 'The move saved, but its charge did not.' });
              }
            }
          } else if (built.kind === 'transfer') {
            // Between the person's own accounts: one transfer, and its charge (if any) on the M-Pesa side.
            const moved = await transferBankToBank({ data: built.main as never });
            if (built.fee) {
              const mpesaLeg = built.main.sourceAccountId === accountId ? moved.outgoing : moved.incoming;
              try {
                await createDisbursement({ data: { ...built.fee, chargeForTransactionId: mpesaLeg.id } as never });
              } catch {
                result.failed.push({ what: `${item.description} charge`, why: 'The move saved, but its charge did not.' });
              }
            }
          } else {
            const created = await createDisbursement({ data: built.main as never });
            if (built.fee) {
              try {
                await createDisbursement({ data: { ...built.fee, chargeForTransactionId: created.id } as never });
              } catch {
                result.failed.push({ what: `${item.description} charge`, why: 'The payment saved, but its charge did not.' });
              }
            }
          }
          result.saved += 1;
          savedIndexes.add(item.index);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'It was not saved.';
          if (/already recorded/i.test(message)) result.repeats += 1;
          else result.failed.push({ what: item.description ?? 'A message', why: message });
        }
      }
    } finally {
      setSaving(false);
      if (statementReading) {
        const stamp = { date: todayIso(), description: 'Saved from your statement' };
        const marked = lines.map((item) => (savedIndexes.has(item.index) ? { ...item, alreadyRecorded: stamp } : item));
        setLines(marked);
        setStatementReading((current) => (current ? { ...current, lines: marked } : current));
      }
      setOutcome(result);
      if (result.saved > 0) void rememberMpesaCard('done');
    }
    {
      let kept = rules;
      for (const item of lines) {
        const choice = choices[item.index];
        if (savedIndexes.has(item.index) && choice?.remember && choice.category.trim() && item.description) {
          kept = withRule(kept, item.description, choice.category);
        }
      }
      if (kept !== rules) keepRules(kept);
    }
    offerBalanceChanges(lines.filter((item) => savedIndexes.has(item.index)));
  };

  /**
   * Once, at the end, for everything that was saved. Asked and never applied by
   * itself: the entries can be edited or deleted afterwards, and a balance moved
   * behind somebody's back would be left quietly wrong.
   */
  const offerBalanceChanges = (saved: PreviewLine[]) => {
    const changes = balanceChanges(saved, choices, parties, debtCategories);
    if (changes.length === 0) return;
    Alert.alert(
      changes.length === 1 ? 'Update this balance too?' : `Update ${changes.length} balances too?`,
      `${changes.map((change) => `· ${change.label}`).join('\n')}\n\nThe entries are already saved either way.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              for (const change of changes) {
                await customFetch(change.endpoint, {
                  method: change.method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(change.body),
                });
              }
              await queryClient.invalidateQueries({ queryKey: ['parties'] });
            } catch (error: unknown) {
              Alert.alert('Some balances did not update', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  if (outcome) {
    return (
      <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.body, { paddingTop: insets.top + 24 }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-import-done">
          <Feather name="check-circle" size={34} color={colors.success} />
          <Text style={[styles.title, { color: colors.foreground, marginTop: 10 }]}>
            {outcome.saved} {outcome.saved === 1 ? 'entry' : 'entries'} saved
          </Text>
          {outcome.repeats > 0 ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {outcome.repeats} already recorded, so left out.
            </Text>
          ) : null}
          {outcome.failed.map((failure) => (
            <Text key={`${failure.what}-${failure.why}`} style={[styles.hint, { color: colors.destructive }]}>
              {failure.what}: {failure.why}
            </Text>
          ))}
        </View>
        {statementReading && statementLeft > 0 ? (
          <Pressable
            onPress={() => setOutcome(null)}
            style={[styles.primary, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            testID="mpesa-import-keep-going"
          >
            <Text style={styles.primaryText}>Keep going ({statementLeft} left)</Text>
          </Pressable>
        ) : null}
        {statementReading && statementLeft > 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: 'center' }]} testID="mpesa-import-continue-later">
            Or come back later: the rest of your statement is kept on this phone. Open the M-Pesa screen again and it is here.
          </Text>
        ) : null}
        <Pressable
          onPress={() => router.replace('/(tabs)/bank')}
          style={[styles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          testID="mpesa-import-open-bank"
        >
          <Text style={styles.primaryText}>See my bank</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.secondary} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Done</Text>
        </Pressable>
      </PageScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Paste M-Pesa messages</Text>
          <ScreenHint>Turn your M-Pesa messages into entries, without typing.</ScreenHint>
        </View>
      </View>

      <PageScrollView ref={scrollRef} style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.budgetRow, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-budget-row">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>These will be saved in</Text>
            <Text style={[styles.lineTitle, { color: colors.foreground }]} numberOfLines={1} testID="mpesa-budget-name">
              {group?.name ?? '…'}
            </Text>
          </View>
          {workspaces.length > 1 ? (
            <Pressable
              onPress={() => setBudgetPickerOpen(true)}
              disabled={switchingBudget}
              accessibilityRole="button"
              testID="mpesa-budget-change"
              hitSlop={8}
            >
              {switchingBudget ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Change</Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {restored ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="mpesa-restored">
            <Text style={[styles.lineTitle, { color: colors.foreground }]}>Picked up where you left off</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Your unfinished paste and your choices were kept.
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
              <Pressable onPress={dismissRestored} accessibilityRole="button" testID="mpesa-restored-ok">
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Keep going</Text>
              </Pressable>
              <Pressable onPress={startOver} accessibilityRole="button" testID="mpesa-restored-reset">
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Start over</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {!lines ? (
          <>
            <View style={[styles.steps, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {['Open your Messages app and hold on an M-Pesa message.', 'Select the ones you want (as many as you like), then tap Copy.', 'Come back here and paste them in the box.'].map((step, index) => (
                <View key={step} style={styles.step}>
                  <Text style={[styles.stepNumber, { color: colors.primary }]}>{index + 1}</Text>
                  <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
                </View>
              ))}
            </View>
            {canReceiveShares ? (
              <Text style={[styles.hint, { color: colors.primary }]} testID="mpesa-share-hint">
                Faster: select the messages, tap Share, and choose Jamvi. They arrive here already read.
              </Text>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              placeholder="Paste your M-Pesa messages here"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              style={[styles.pasteBox, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
              testID="mpesa-import-text"
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Jamvi reads your messages to fill in this list. They are not saved.
            </Text>
            <Pressable
              onPress={() => readMessages()}
              disabled={reading}
              style={[styles.primary, { backgroundColor: colors.primary, opacity: reading ? 0.6 : 1 }]}
              accessibilityRole="button"
              testID="mpesa-import-read"
            >
              {reading && !readerJob ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Read my messages</Text>}
            </Pressable>

            {canReadStatements ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-statement">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>Or use your M-Pesa statement</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Choose the statement PDF and type its password. Jamvi reads it here on your phone. The file and the password are not uploaded or saved.
                </Text>
                <Pressable
                  onPress={pickStatement}
                  style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 12 }]}
                  accessibilityRole="button"
                  testID="mpesa-statement-choose"
                >
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                    {statementFile ? shownFileName(statementFile.name) : 'Choose the statement PDF'}
                  </Text>
                </Pressable>
                <TextInput
                  value={statementPassword}
                  onChangeText={setStatementPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Statement password"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.pasteBox, { minHeight: 48, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  testID="mpesa-statement-password"
                />
                <Pressable
                  onPress={readStatement}
                  disabled={!statementFile || reading}
                  style={[styles.primary, { backgroundColor: colors.primary, opacity: !statementFile || reading ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  testID="mpesa-statement-read"
                >
                  {readerJob ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Read my statement</Text>}
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Put them in which account?</Text>
            <BankAccountPicker
              accounts={accounts}
              selectedAccountId={accountId}
              onSelect={(id) => {
                setSelectedAccountId(id);
                // The suggestions come from this account's history, so start them again.
                setChoices(initialChoices(lines, [], categories.map((row) => row.name), chargeCategory, rules));
              }}
              testIDPrefix="mpesa-import-account"
            />

            {statementNote ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-statement-note">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>{statementNote}</Text>
              </View>
            ) : null}

            {balanceCheck ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-statement-balance">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>
                  {Math.abs(balanceCheck.gap) < 0.005 ? 'Matches your statement' : 'Will not match your statement exactly'}
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Your statement went from KES {formatExact(balanceCheck.opening)} to KES {formatExact(balanceCheck.closing)}, a change of KES {formatExact(balanceCheck.statementChange)}. Saving these moves this account by KES {formatExact(balanceCheck.savedChange)}.
                  {balanceCheck.alreadyRecordedChange !== 0 ? ` Entries already recorded account for KES ${formatExact(balanceCheck.alreadyRecordedChange)}.` : ''}
                </Text>
                {Math.abs(balanceCheck.gap) >= 0.005 ? (
                  <>
                    <Text style={[styles.hint, { color: colors.foreground }]}>The difference of KES {formatExact(balanceCheck.gap)} is:</Text>
                    {balanceCheck.parts.map((part) => (
                      <Text key={part.label} style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>
                        • {part.label}: KES {formatExact(part.amount)}
                      </Text>
                    ))}
                  </>
                ) : null}
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Your account also has to start at KES {formatExact(balanceCheck.opening)} for it to end at KES {formatExact(balanceCheck.closing)}.
                </Text>
              </View>
            ) : null}

            {summary ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-import-summary">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>
                  {summary.count} of {recordable.length} ready to save
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Money in KES {formatExact(summary.moneyIn)} · money out KES {formatExact(summary.moneyOut)}
                  {summary.fees > 0 ? ` · M-Pesa charges KES ${formatExact(summary.fees)}` : ''}
                  {summary.moves > 0 ? ` · ${summary.moves} between your own accounts` : ''}
                </Text>
              </View>
            ) : null}

            {Object.keys(rules).length > 0 ? (
              <Pressable onPress={() => setRulesOpen(true)} accessibilityRole="button" testID="mpesa-rules-open" style={{ alignSelf: 'flex-start' }}>
                <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold', marginTop: 0 }]}>
                  What Jamvi remembers ({Object.keys(rules).length})
                </Text>
              </Pressable>
            ) : null}
            {review && review.all > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-review">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]} testID="mpesa-review-counts">
                  {review.changed} changed by you · {review.suggested} still Jamvi's suggestion{review.needs > 0 ? ` · ${review.needs} need${review.needs === 1 ? 's' : ''} you` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {([
                    ['all', 'All'],
                    ['needs', 'Needs you'],
                    ['changed', 'Changed by you'],
                    ['suggested', 'Suggested'],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => {
                    const on = view === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setView(key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`mpesa-review-${key}`}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on ? `${colors.primary}22` : colors.muted,
                        }}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                          {label} ({review[key]})
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {recordable.filter((item) => view === 'all' || reviewStatus(item, choices[item.index]) === view).map((item) => {
              const choice = choices[item.index];
              const out = item.direction === 'out';
              const status = reviewStatus(item, choice);
              return (
                <View key={item.index} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: choice?.include ? 1 : 0.55 }]} testID={`mpesa-line-${item.index}`} onLayout={(event) => { lineTops.current[item.index] = event.nativeEvent.layout.y; }}>
                  {status ? (
                    <Text
                      style={[styles.hint, { marginTop: 0, fontFamily: 'Inter_600SemiBold', color: status === 'needs' ? colors.destructive : status === 'changed' ? colors.primary : colors.mutedForeground }]}
                      testID={`mpesa-line-status-${item.index}`}
                    >
                      {status === 'needs' ? 'Needs you' : status === 'changed' ? 'You changed this' : 'Suggested by Jamvi'}
                    </Text>
                  ) : null}
                  <View style={styles.lineTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable
                        onPress={canNickname(item) ? () => setNaming({ index: item.index, original: item.original ?? item.description ?? '', text: item.description ?? '' }) : undefined}
                        disabled={!canNickname(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.description}. Tap to rename this payee`}
                        testID={`mpesa-line-name-${item.index}`}
                        style={styles.nameRow}
                      >
                        <Text style={[styles.lineTitle, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={2}>{item.description}</Text>
                        {canNickname(item) ? <Feather name="edit-2" size={13} color={colors.mutedForeground} /> : null}
                      </Pressable>
                      {item.original && item.original !== item.description ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Jamvi read: {item.original}</Text>
                      ) : null}
                      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                        {item.date ?? 'No date on it, so today'} · {out ? 'Money out' : 'Money in'}
                      </Text>
                      {item.named === false && snippetFor(text, item.receipt) ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground, fontStyle: 'italic' }]} testID={`mpesa-line-snippet-${item.index}`}>
                          No name in the message: “{snippetFor(text, item.receipt)}…”
                        </Text>
                      ) : null}
                      {reportLink(item)}
                    </View>
                    <Text style={[styles.amount, { color: out ? colors.destructive : colors.success }]}>
                      {out ? '−' : '+'}{formatExact(item.amount ?? 0)}
                    </Text>
                    <Switch value={!!choice?.include} onValueChange={(value) => toggle(item.index, value)} accessibilityLabel={`Save ${item.description}`} />
                  </View>
                  {out && choice?.include && choice.debt?.kind !== 'lend' && !isMove(choice) ? (
                    <Pressable
                      onPress={() => setPicking(item.index)}
                      style={[styles.categoryButton, { borderColor: choice.category ? colors.border : colors.destructive, backgroundColor: colors.muted }]}
                      accessibilityRole="button"
                      testID={`mpesa-line-category-${item.index}`}
                    >
                      <Text style={{ color: choice.category ? colors.foreground : colors.destructive, fontFamily: 'Inter_600SemiBold' }}>
                        {choice.category ? categoryPath(choice.category, categories) : 'Choose what it was for'}
                      </Text>
                      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && item.description && rules[payeeKey(item.description)] !== choice.category ? (
                    <Pressable
                      onPress={() => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], remember: !current[item.index]?.remember } }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: choice.remember === true }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                      testID={`mpesa-line-remember-${item.index}`}
                    >
                      <Feather name={choice.remember ? 'check-square' : 'square'} size={18} color={choice.remember ? colors.primary : colors.mutedForeground} />
                      <Text style={{ color: colors.foreground, fontSize: 13, flexShrink: 1 }}>
                        Remember {choice.category} for {payeeName(item.description)}
                      </Text>
                    </Pressable>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.auto && choice.category ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]} testID={`mpesa-line-suggested-${item.index}`}>
                      Suggested by Jamvi. Tap to choose a different one.
                    </Text>
                  ) : null}
                  {item.direction === 'in' && choice?.include && !choice.debt && !isMove(choice) && !choice.contributorId && incomeSources.length > 0 ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-source-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Where did this come from? (optional)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'Not sure' }, ...incomeSources].map((source) => {
                          const on = (choice.incomeSourceId ?? null) === source.id;
                          return (
                            <Pressable
                              key={source.id ?? 'none'}
                              onPress={() => setChoices((current) => chooseIncomeSource(lines ?? [], current, item.index, source.id))}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              testID={`mpesa-line-source-${item.index}-${source.id ?? 'none'}`}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: on ? colors.primary : colors.border,
                                backgroundColor: on ? `${colors.primary}22` : colors.muted,
                              }}
                            >
                              <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{source.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      {choice.sourceAuto && choice.incomeSourceId ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID={`mpesa-line-source-suggested-${item.index}`}>
                          Suggested by Jamvi. Tap another to change it.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {choice?.include && !choice.debt && !choice.contributorId && otherAccounts.length > 0 ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-move-${item.index}`}>
                      <Text style={[styles.hint, { color: transferHints.has(item.index) ? colors.primary : colors.mutedForeground, marginTop: 0, fontFamily: transferHints.has(item.index) ? 'Inter_600SemiBold' : undefined }]}>
                        {transferHints.has(item.index)
                          ? 'Looks like money passing through M-Pesa between your own accounts. Is it?'
                          : 'Is this money moving between your own accounts?'}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'No' }, ...otherAccounts.map((option) => ({ id: option.id as number | null, name: `${out ? 'To' : 'From'} ${option.name}` }))].map((option) => {
                          const on = (choice.transferTo ?? null) === option.id;
                          return (
                            <Pressable
                              key={option.id ?? 'no'}
                              onPress={() => setChoices((current) => chooseTransfer(current, item.index, option.id))}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              testID={`mpesa-line-move-${item.index}-${option.id ?? 'no'}`}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: on ? colors.primary : colors.border,
                                backgroundColor: on ? `${colors.primary}22` : colors.muted,
                              }}
                            >
                              <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                  {choice?.include && destinationOf(choice) !== 'debt' && destinationOf(choice) !== 'contribution' && canUseSavings(item) && savingsGoals.length > 0 ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-savings-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>
                        {out ? 'Is this going into savings?' : 'Is this coming out of savings?'}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'No' }, ...savingsGoals.map((goal) => ({ id: goal.id as number | null, name: goal.name }))].map((option) => {
                          const on = (choice.savingsGoalId ?? null) === option.id;
                          return (
                            <Pressable
                              key={option.id ?? 'no'}
                              onPress={() => setChoices((current) => chooseSavings(current, item.index, option.id))}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              testID={`mpesa-line-savings-${item.index}-${option.id ?? 'no'}`}
                              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                            >
                              <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                  {isShared && item.direction === 'in' && choice?.include && !isMove(choice) && destinationOf(choice) !== 'debt' && parties.length > 0 ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-contribution-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Is this a member's contribution? Whose?</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'No' }, ...parties.map((person) => ({ id: person.id as number | null, name: person.name }))].map((option) => {
                          const on = (choice.contributorId ?? null) === option.id;
                          return (
                            <Pressable
                              key={option.id ?? 'no'}
                              onPress={() => setChoices((current) => chooseContribution(current, item.index, option.id))}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              testID={`mpesa-line-contribution-${item.index}-${option.id ?? 'no'}`}
                              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                            >
                              <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                  {choice?.include && !isMove(choice) && item.type === 'bank_receipt' && parties.length === 0 ? (
                    <Pressable onPress={() => router.push('/parties' as never)} accessibilityRole="button" testID={`mpesa-line-add-business-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.primary, marginTop: 0, fontFamily: 'Inter_600SemiBold' }]}>
                        Money to or from a company you own? Add it in Who owes who, then come back and choose it here.
                      </Text>
                    </Pressable>
                  ) : null}
                  {choice?.include && !isMove(choice) && !choice.contributorId && canLinkDebt(item, parties) && parties.length > 0 ? (
                    (() => {
                      const linked = choice.debt ? parties.find((party) => party.id === choice.debt!.partyId) : undefined;
                      const guess = !choice.debt && item.direction ? matchParty(item.original ?? item.description, parties) : null;
                      const guessKind = guess && item.direction ? suggestDebtKind(item.direction, guess) : null;
                      return (
                        <>
                          {choice.debt && linked ? (
                            <Pressable
                              onPress={() => setDebtFor({ index: item.index, partyId: linked.id, kind: choice.debt!.kind })}
                              accessibilityRole="button"
                              testID={`mpesa-line-debt-${item.index}`}
                            >
                              <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                                {DEBT_LABEL[choice.debt.kind]}: {linked.name} · tap to change
                              </Text>
                            </Pressable>
                          ) : guess && guessKind ? (
                            <Pressable
                              onPress={() => setDebt(item.index, { kind: guessKind, partyId: guess.id })}
                              accessibilityRole="button"
                              testID={`mpesa-line-debt-guess-${item.index}`}
                            >
                              <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                                Looks like {guess.name}. {DEBT_LABEL[guessKind]}? Tap to set
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => setDebtFor({ index: item.index, partyId: guess?.id ?? null, kind: null })}
                              accessibilityRole="button"
                              testID={`mpesa-line-debt-open-${item.index}`}
                            >
                              <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                                Is this a debt or loan?
                              </Text>
                            </Pressable>
                          )}
                        </>
                      );
                    })()
                  ) : null}
                  {out && item.fee ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>+ KES {formatExact(item.fee)} M-Pesa charge, saved on its own</Text>
                  ) : null}
                </View>
              );
            })}

            {summary && summary.fees > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Where do the M-Pesa charges go?</Text>
                <Pressable
                  onPress={() => setPicking('charge')}
                  style={[styles.categoryButton, { borderColor: chargeCategory ? colors.border : colors.destructive, backgroundColor: colors.muted }]}
                  accessibilityRole="button"
                  testID="mpesa-charge-category"
                >
                  <Text style={{ color: chargeCategory ? colors.foreground : colors.destructive, fontFamily: 'Inter_600SemiBold' }}>
                    {chargeCategory || 'Choose a category for the charges'}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ) : null}

            {notImported.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Not saved ({notImported.length})</Text>
                {notImported.map((item) => (
                  <View key={item.index} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`mpesa-skipped-${item.index}`}>
                    <Text style={[styles.lineTitle, { color: colors.foreground }]}>
                      {item.receipt ? `${item.receipt}${item.amount ? ` · KES ${formatExact(item.amount)}` : ''}` : 'A message'}
                    </Text>
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                      {item.alreadyRecorded
                        ? item.alreadyRecorded.date
                          ? `Already recorded on ${item.alreadyRecorded.date}: ${item.alreadyRecorded.description}`
                          : item.alreadyRecorded.description
                        : item.reason}
                    </Text>
                    {item.alreadyRecorded?.editable && item.direction === 'out' ? (
                      <View style={{ marginTop: 6, gap: 4 }}>
                        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>
                          Now in: {item.alreadyRecorded.category || 'no category'}
                        </Text>
                        <Pressable
                          onPress={() => setPicking(`recat:${item.index}`)}
                          accessibilityRole="button"
                          testID={`mpesa-recat-${item.index}`}
                          style={[styles.categoryButton, { borderColor: recat[item.index] ? colors.primary : colors.border, backgroundColor: colors.muted }]}
                        >
                          <Text style={{ color: recat[item.index] ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', flexShrink: 1 }}>
                            {recat[item.index] ? `Change to: ${recat[item.index]}` : 'Change its category'}
                          </Text>
                          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ) : null}
                    {reportLink(item)}
                  </View>
                ))}
                {pendingChanges.length > 0 ? (
                  <Pressable
                    onPress={applyRecategorise}
                    disabled={recategorising}
                    style={[styles.primary, { backgroundColor: colors.primary, opacity: recategorising ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    testID="mpesa-recat-apply"
                  >
                    {recategorising ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Change {pendingChanges.length} {pendingChanges.length === 1 ? 'category' : 'categories'}</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Pressable onPress={() => { setLines(null); setChoices({}); setStatementNote(null); setStatementReading(null); }} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Start again</Text>
            </Pressable>
          </>
        )}
      </PageScrollView>
      <StatementReader job={readerJob} onDone={onStatementRead} />

      {lines ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderColor: colors.border }]}>
          {firstProblem ? (
            <Pressable onPress={showProblem} accessibilityRole="button" accessibilityHint="Shows the entry that needs attention" testID="mpesa-first-problem">
              <Text style={[styles.hint, { color: colors.destructive, marginBottom: 6 }]}>
                {firstProblem}
                {firstProblemIndex !== null ? '  Tap to see it.' : ''}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={saveAll}
            disabled={saving || !summary || summary.count === 0}
            style={[styles.primary, { backgroundColor: colors.primary, opacity: saving || !summary || summary.count === 0 ? 0.5 : 1 }]}
            accessibilityRole="button"
            testID="mpesa-import-save"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save {summary?.count ?? 0} {summary?.count === 1 ? 'entry' : 'entries'}</Text>}
          </Pressable>
        </View>
      ) : null}

      <Modal visible={budgetPickerOpen} animationType="slide" transparent onRequestClose={() => setBudgetPickerOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, paddingBottom: 16 + Math.max(insets.bottom, 24), gap: 8 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Save them in which budget?</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Your pasted messages stay here. Jamvi reads them again for the budget you choose.
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(workspaces as unknown as Array<{ id: number; name: string }>).map((workspace) => {
                const on = workspace.id === group?.id;
                return (
                  <Pressable
                    key={workspace.id}
                    onPress={() => void switchBudget(workspace.id)}
                    style={[styles.option, on && { backgroundColor: `${colors.primary}18` }]}
                    accessibilityRole="button"
                    testID={`mpesa-budget-${workspace.id}`}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
                      {workspace.name}{on ? '  ✓' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setBudgetPickerOpen(false)} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={debtFor !== null} animationType="slide" transparent onRequestClose={() => setDebtFor(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, paddingBottom: 16 + Math.max(insets.bottom, 24), gap: 10 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Is this a debt or loan?</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Choose who, and what it is. Jamvi will offer to update what you owe or are owed once everything is saved.
            </Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {parties.map((party) => {
                const on = debtFor?.partyId === party.id;
                return (
                  <Pressable
                    key={party.id}
                    onPress={() => setDebtFor((current) => (current ? { ...current, partyId: party.id } : current))}
                    style={[styles.option, on && { backgroundColor: `${colors.primary}18` }]}
                    accessibilityRole="button"
                    testID={`mpesa-debt-party-${party.id}`}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>{party.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {(() => {
              const line = lines?.find((candidate) => candidate.index === debtFor?.index);
              if (!line?.direction) return null;
              return debtKindsFor(line.direction).map((kind) => {
                const on = debtFor?.kind === kind;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setDebtFor((current) => (current ? { ...current, kind } : current))}
                    style={[styles.categoryButton, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : colors.muted }]}
                    accessibilityRole="button"
                    testID={`mpesa-debt-kind-${kind}`}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{DEBT_LABEL[kind]}</Text>
                  </Pressable>
                );
              });
            })()}
            <Pressable
              onPress={() => {
                if (debtFor?.partyId && debtFor.kind) setDebt(debtFor.index, { kind: debtFor.kind, partyId: debtFor.partyId });
                setDebtFor(null);
              }}
              disabled={!debtFor?.partyId || !debtFor.kind}
              style={[styles.primary, { backgroundColor: colors.primary, opacity: debtFor?.partyId && debtFor.kind ? 1 : 0.5 }]}
              accessibilityRole="button"
              testID="mpesa-debt-save"
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (debtFor) setDebt(debtFor.index, null);
                setDebtFor(null);
              }}
              style={styles.secondary}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>No, it is not a debt or loan</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={rulesOpen} animationType="slide" transparent onRequestClose={() => setRulesOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, paddingBottom: 16 + Math.max(insets.bottom, 24), gap: 10 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What Jamvi remembers</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Categories you asked Jamvi to keep for a payee. Forget one and it goes back to being suggested from your history.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {Object.entries(rules).map(([key, category]) => (
                <View key={key} style={[styles.option, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
                  <Text style={{ color: colors.foreground, flexShrink: 1 }}>{key} → {category}</Text>
                  <Pressable onPress={() => keepRules(withoutRule(rules, key))} accessibilityRole="button" accessibilityLabel={`Forget ${key}`} hitSlop={8} testID={`mpesa-rule-forget-${key}`}>
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setRulesOpen(false)} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={naming !== null} animationType="slide" transparent onRequestClose={() => setNaming(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, paddingBottom: 16 + Math.max(insets.bottom, 24), gap: 10 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What do you call this?</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Jamvi read: {naming?.original}. Give it a name that makes sense to you, and Jamvi will use it every time.
            </Text>
            <TextInput
              value={naming?.text ?? ''}
              onChangeText={(value) => setNaming((current) => (current ? { ...current, text: value } : current))}
              autoCorrect={false}
              style={[styles.pasteBox, { minHeight: 48, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
              testID="mpesa-nickname-text"
            />
            <Pressable
              onPress={saveNickname}
              style={[styles.primary, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              testID="mpesa-nickname-save"
            >
              <Text style={styles.primaryText}>Save name</Text>
            </Pressable>
            <Pressable
              onPress={() => setNaming((current) => (current ? { ...current, text: current.original } : current))}
              style={styles.secondary}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Use the name Jamvi read</Text>
            </Pressable>
            <Pressable onPress={() => setNaming(null)} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={reporting !== null} animationType="slide" transparent onRequestClose={() => setReporting(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, paddingBottom: 16 + Math.max(insets.bottom, 24), gap: 10 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Send this message</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              This goes to the Jamvi team so we can teach the app this kind of message. It is not linked to you, and phone
              numbers are hidden. Black out any names or other details you would rather not share, then send.
            </Text>
            <TextInput
              value={reporting?.text ?? ''}
              onChangeText={(value) => setReporting((current) => (current ? { ...current, text: value } : current))}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
              style={[styles.pasteBox, { minHeight: 140, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
              testID="mpesa-report-text"
            />
            <Pressable
              onPress={sendReport}
              disabled={sendingReport || !reporting?.text.trim()}
              style={[styles.primary, { backgroundColor: colors.primary, opacity: sendingReport ? 0.6 : 1 }]}
              accessibilityRole="button"
              testID="mpesa-report-send"
            >
              {sendingReport ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send</Text>}
            </Pressable>
            <Pressable onPress={() => setReporting(null)} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CategorySheet visible={picking !== null} budgetName={group?.name} onPick={chooseCategory} onClose={() => setPicking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  steps: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { fontSize: 16, fontFamily: 'Inter_700Bold', width: 18 },
  stepText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  pasteBox: { minHeight: 170, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  primary: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  secondary: { alignItems: 'center', paddingVertical: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  summaryLine: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  categoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingBottom: 24 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  groupLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 16, paddingTop: 10 },
  option: { paddingHorizontal: 16, paddingVertical: 13 },
  empty: { padding: 16, textAlign: 'center' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addBox: { padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
