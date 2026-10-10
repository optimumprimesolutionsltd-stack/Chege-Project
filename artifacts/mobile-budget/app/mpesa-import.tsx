import React, { useEffect, useMemo, useState } from 'react';
import { withoutPersonTag } from '@/lib/personNumber';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createDeposit as createDepositInOtherBudget,
  createDisbursement as createDisbursementInOtherBudget,
  customFetch,
  getGetBudgetCategoriesQueryKey,
  getGetSavingsGoalsQueryKey,
  useCreateBudgetCategory,
  useCreateDeposit,
  useGetSavingsGoals,
  useTransferBankToBank,
  useTransferBankToSavings,
  useTransferSavingsToBank,
  useCreateDisbursement,
  useUpdateJointAccountOpeningBalance,
  autoLinkReversals,
  getGetJointAccountQueryKey,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  useCreateJointAccount,
  useUpdateJointAccount,
  getGetJointAccountsQueryKey,
  useGetMembers,
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from '@workspace/api-client-react';
import { buildCategoryTree, filterCategoryTree, type CategoryRow } from '@workspace/category-tree';

import { BankAccountPicker } from '@/components/BankAccountPicker';
import { NewCategoryOffer } from '@/components/NewCategoryOffer';
import { standardTargetFor, type CategoryLite, type StandardTarget } from '@/lib/standardCategory';
import { setMakesStandardCategories } from '@/lib/knownPayees';
import { ensureCommonCategories } from '@/lib/commonCategories';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { PageScrollView } from '@/components/PageScrollReset';
import { ScreenHint } from '@/components/ScreenHint';
import { useColors } from '@/hooks/useColors';
import { AddIncomeSourceChip } from '@/components/AddIncomeSourceChip';
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
import { findLenderParty, lendersNeeded, withLenderDebts } from '@/lib/mpesaDebts';
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
import { READER_STOPPED, StatementReader, type ReaderJob } from '@/components/StatementReader';
import { rememberMpesaCard } from '@/lib/mpesaCard';
import { keepScreenAwakeWhileSaving, letScreenSleepAgain } from '@/lib/keepAwake';
import { getImportProgress, importSaveStalled, setImportProgress, useImportProgress } from '@/lib/importProgress';
import { clearImportStep, noteImportStep, readUnfinishedImport, type ImportStep } from '@/lib/importBreadcrumb';
import { clearSavePending, hasPendingSave, markSavePending, pendingSaveJob } from '@/lib/importSaveJob';
import { retryWhenCutOff } from '@/lib/saveWhileAway';
import { plainReadFailure, plainSaveError, ReadRequestFailed, retrySave, withRetries } from '@/lib/saveRetry';
import { isNotSure, needsNotSureCategory, NOT_SURE_CATEGORY, notSureableLines, otherBudgetToMark, putUnderNotSure, toMarkAfterSave } from '@/lib/entriesToSort';
import { handleLapsedError } from '@/lib/lapsedError';
import { runPool, savePosting, SAVE_CONCURRENCY, type PostingApi, type Posted } from '@/lib/savePosting';
import { EarlierSaveRunning, followServerSave, isFollowingServerSave, startServerSave, type ServerJob } from '@/lib/serverSave';
import { parseStoredRules, payeeKey, payeeName, referenceOf, ruleLabel, rulesStorageKey, withRule, withSourceRule, withoutRule, type PayeeRules } from '@/lib/payeeLearning';
import { saveDebtLinks } from '@/lib/debtReversal';
import { mpesaNameFor, saveMpesaNames, type MpesaName } from '@/lib/mpesaNames';
import { isLapsedRefusal, lapsedSaveMessage } from '@/lib/lapsedSave';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useUndoHistory } from '@/hooks/useUndoHistory';
import { UndoDeleteBar, useUndoableDelete } from '@/components/UndoDeleteBar';
import { deletedLabel } from '@/lib/undoDelete';
import type { DebtEntryLink } from '@/lib/debtLinks';
import { canReadStatements, chooseStatement, statementBase64, type ChosenStatement } from '@/lib/statementFile';
import { askToReadSms, canNotifySms, canReadSms, newMpesaSms, parseSmsAuto, readMpesaSms, setSmsNotify, SMS_PERIODS, smsAutoKey, smsBatches, smsNotifyOn, smsPeriodRange, smsRefusal, type SmsAuto, type SmsPeriod } from '@/lib/mpesaSms';
import { isoDay, longDay, monthStartIso } from '@/lib/dayRange';
import { MonthStepper } from '@/components/MonthStepper';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MpesaFirstStart } from '@/components/MpesaFirstStart';
import { fromStatementStart, keepUpSince, startPresets } from '@/lib/mpesaFirstStart';
import { shownFileName } from '@/lib/shownFileName';
import { readPercent } from '@/lib/statementProgress';
import { balanceAtEndOf, dayBefore, missingInJamvi, notOnStatement, withoutRecordedFuliza, type RecordedRow, fulizaChargeOverlap, fulizaCharges, fulizaOwedBefore, reconcile, statementLines, type StatementReading } from '@/lib/statementImport';
import { checkRunningBalance, readStatementRows, resolveDirections } from '@/lib/statementTable';
import type { ReaderMessage } from '@/lib/statementReaderHtml';
import { fetchOtherBudgetOptions, type OtherBudgetOptions } from '@/lib/otherBudgetOptions';
import { WhoIsThisFor } from '@/components/WhoIsThisFor';
import { useBusinesses } from '@/hooks/useBusinesses';
import { useBusinessAccounts } from '@/hooks/useBusinessAccounts';
import { saveRules } from '@/lib/rulesStore';
import { saveKnowledge } from '@/lib/knowledgeStore';
import { TeachJamviCard, type OwnAccountAnswer } from '@/components/TeachJamviCard';
import { BusinessSalaryQuestion } from '@/components/BusinessSalaryQuestion';
import { FamilyNamesCard } from '@/components/FamilyNamesCard';
import { FAMILY_CATEGORY, familyCategories, familyNames, fileFamilyLines, relativesBySurname, withFamily, withoutFamily } from '@/lib/family';
import { alreadyKnown, ownByNumber, ownRuleKey, suggestedCategories, teachableGroups, teachCategory, teachOwnAccount, teachSource, withOwnAccounts, type TeachGroup } from '@/lib/teachJamvi';
import { useNamedPayees } from '@/hooks/useNamedPayees';
import { namedKeyFor, ruleKeysFor, withNamed } from '@/lib/namedPayees';
import { businessOfLine, businessPayees, chooseBusiness, chooseNewCost, costOwners, costsOf } from '@/lib/importBusiness';
import { applyOtherBudgetRules, otherBudgetRuleFor, otherBudgetRuleLabel, otherBudgetRulesKey, parseOtherBudgetRules, rememberOtherBudgetLabel, withOtherBudgetRule, withoutOtherBudgetRule, type OtherBudgetRules } from '@/lib/otherBudgetRules';
import {
  buildPostings,
  canAddNote,
  categoryPath,
  chooseCategory as chooseLineCategory,
  carryChoices,
  isConfirmedToSave,
  categorisableLines,
  categoriseLines,
  confirmLines,
  confirmableLines,
  lineMatches,
  monthsOf,
  inMonth,
  streamableLines,
  streamLines,
  chooseIncomeSource,
  canUseSavings,
  chooseContribution,
  chooseOtherBudget,
  sendableLines,
  sendLinesToOtherBudget,
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
  mergeTwins,
  twinNotes,
  twinQuestions,
  untickElsewhere,
  withTwins,
} from '@/lib/mpesaImport';
import { findSavingsGoal, ledgersToMake, loanOf, productNote, productOf, savingsNeeded, savingsOf, withSavingsAccounts, type LenderId, type SavingsAccountId } from '@/lib/mpesaProducts';

// Shared with the day of banking and the Bank form: a fee is the same expense every time.
const CHARGE_CATEGORY_KEY = 'jamvi:last-charge-category';

// Entries drawn at a time on the review screen (see shownCount).
const LINES_PER_PAGE = 100;
// "Put it under" a group that does not exist yet: made, then used.
const NEW_GROUP = -1;
const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** A statement is kept this long, so it can be worked through over days. */
const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How far a finger may drift during a tap on the debt/loan sheet before it
 * stops counting as a press. A real tap is never perfectly still, and this
 * sheet nests a small scrollable party list next to plain buttons — without
 * this, Android's gesture negotiation between the two occasionally reads an
 * ordinary tap as the start of a scroll and drops it, so it takes a few tries.
 */
const PRESS_RETENTION_OFFSET = { top: 20, left: 20, right: 20, bottom: 20 };

/** `lapsed`: the trial or subscription had ended, so the save stopped; `waiting` were left unsaved. */
type Outcome = { saved: number; repeats: number; failed: Array<{ what: string; why: string }>; lapsed?: { waiting: number } };

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
  // null is a category (or a new group) of its own; a number is the group it goes
  // under; NEW_GROUP makes a new group, named below, and puts it under that.
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  // Its monthly budget, set here rather than in a second trip to Budget. Blank is none yet.
  const [newBudget, setNewBudget] = useState('');
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
    setNewGroupName('');
    setNewBudget('');
    onPick(name);
  };
  const budgetOf = (row: CategoryRow) => Number((row as CategoryRow & { budgetAmount?: number | null }).budgetAmount ?? 0);
  // A group's budget is its subcategories added up: the server clears a group's
  // own figure when its first subcategory arrives. Said before it happens.
  const chosenParent = typeof newParentId === 'number' && newParentId !== NEW_GROUP ? categories.find((row) => row.id === newParentId) ?? null : null;
  const parentLosesOwnBudget = chosenParent !== null
    && !categories.some((row) => row.parentId === chosenParent.id)
    && budgetOf(chosenParent) > 0;

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
    const budgetAmount = newBudget.trim() === '' ? 0 : Math.round(Number(newBudget.replace(/[^0-9.]/g, '')));
    if (!Number.isFinite(budgetAmount) || budgetAmount < 0) {
      Alert.alert('Budget not valid', 'Enter a whole number of shillings, or leave it blank to budget it later.');
      return;
    }
    const groupName = newGroupName.trim();
    if (newParentId === NEW_GROUP && !groupName) {
      Alert.alert('Name the group', 'Give the new group a name, such as Children or Household.');
      return;
    }
    try {
      // A new group first, then this category inside it. An existing one of that name is used.
      let parentId: number | null = newParentId;
      if (newParentId === NEW_GROUP) {
        const sameName = categories.find((row) => row.name.trim().toLocaleLowerCase() === groupName.toLocaleLowerCase());
        if (sameName && sameName.parentId) {
          Alert.alert('Already a subcategory', `"${sameName.name}" is inside another group, so it cannot hold categories. Pick another name.`);
          return;
        }
        parentId = sameName
          ? sameName.id
          : (await createCategory({
              data: { name: groupName, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null },
            })).id;
      }
      const created = await createCategory({
        data: {
          name,
          budgetAmount,
          priority: 3,
          isRecurring: true,
          activeMonth: null,
          activeYear: null,
          ...(parentId !== null ? { parentId } : {}),
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
      <KeyboardAvoidingView
        style={styles.sheetBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
                <TextInput
                  value={newBudget}
                  onChangeText={setNewBudget}
                  placeholder="Monthly budget, KES (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  editable={!creating}
                  style={[styles.pasteBox, { minHeight: 44, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  testID="mpesa-category-new-budget"
                />
                <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Put it under</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  testID="mpesa-category-parents"
                >
                  {[{ id: null as number | null, name: 'Its own' }, { id: NEW_GROUP as number | null, name: '＋ New group' }, ...parentChoices].map((choice) => {
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
                {newParentId === NEW_GROUP ? (
                  <TextInput
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    placeholder="Name the new group, such as Children"
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                    editable={!creating}
                    style={[styles.pasteBox, { minHeight: 44, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                    testID="mpesa-category-new-group"
                  />
                ) : null}
                {parentLosesOwnBudget && chosenParent ? (
                  <Text style={[styles.hint, { color: colors.destructive, marginTop: 0 }]} testID="mpesa-category-parent-budget-note">
                    {chosenParent.name} has a budget of KES {budgetOf(chosenParent).toLocaleString('en-KE')} of its own. A group's budget is its subcategories added up, so it will become what you give this one.
                  </Text>
                ) : null}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The server checks and changes at most 2,000 receipts per request.
const RECEIPT_BATCH = 1_000;

/**
 * Paste M-Pesa messages, look over what Jamvi read, and save the lot.
 *
 * Nothing is recorded until the person taps Save, every payment needs a
 * category they have seen, and a message already recorded is skipped, never
 * counted twice. What was pasted is read and forgotten.
 */

export default function MpesaImportScreen() {
  // Payees Jamvi knows may go under a common category the budget does not have
  // yet: it is made just before saving (lib/commonCategories).
  useState(() => { setMakesStandardCategories(true); return null; });
  useEffect(() => () => setMakesStandardCategories(false), []);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const isShared = group?.isPrivate === false;
  const { data: entitlements } = useEntitlements();
  // In a shared group only an owner or admin can record payments out, moves between accounts and savings.
  const canManageBudget = !isShared || group?.role === 'owner' || group?.role === 'admin';

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string; accountNumber?: string | null }>;
  const { data: categoryList = [] } = useGetBudgetCategories();
  const categories = categoryList as unknown as CategoryRow[];
  const { mutateAsync: createNotSureCategory } = useCreateBudgetCategory();
  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();
  const { mutateAsync: transferBankToBank } = useTransferBankToBank();
  const { mutateAsync: transferBankToSavings } = useTransferBankToSavings();
  const { mutateAsync: transferSavingsToBank } = useTransferSavingsToBank();
  const { data: savingsGoalList = [] } = useGetSavingsGoals();
  const savingsGoals = savingsGoalList as unknown as Array<{ id: number; name: string; isCompleted?: boolean }>;
  // "Who is this for?" on a line: you, or one of My businesses (lib/importBusiness).
  const businesses = useBusinesses();
  const namedPayees = useNamedPayees();
  // Businesses added from a line, shown before My businesses has caught up.
  const [addedBusinesses, setAddedBusinesses] = useState<Array<{ id: number; name: string }>>([]);
  const businessIds = useMemo(() => new Set([...businesses.ids, ...addedBusinesses.map((one) => one.id)]), [businesses.ids, addedBusinesses]);
  const whoForBusinesses = useMemo(
    () => [...businesses.list, ...addedBusinesses.filter((one) => !businesses.ids.has(one.id))],
    [businesses.list, businesses.ids, addedBusinesses],
  );
  const owners = useMemo(
    () => costOwners(categories as unknown as Array<{ name: string; reducesIncomeSourceId?: number | null }>, businessIds),
    [categories, businessIds],
  );

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // M-Pesa is usually its own account: start on one that says so.
  const guessedAccount = accounts.find((account) => /m-?pesa/i.test(account.name))?.id ?? accounts[0]?.id ?? null;
  const accountId = selectedAccountId ?? guessedAccount;
  // The person's other accounts, known by number: lines to or from them start as
  // moves, not spending (lib/teachJamvi). Never the account being imported into.
  const ownAccounts = useMemo(() => accounts.filter((account) => account.id !== accountId), [accounts, accountId]);
  const startChoices = (shown: readonly PreviewLine[], fresh: Record<number, Choice>) => withOwnAccounts(shown, fresh, ownAccounts, rules);
  const { data: account } = useGetJointAccount(accountId ? { accountId } : undefined);
  const history = useMemo(
    () => ((account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null; chargeForTransactionId?: number | null }>),
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
  // A source can outlive the member it once belonged to (removed from the
  // budget, or a data problem never quite cleaned up) - checked against this
  // so a deposit still saves, attributed to whoever is doing the import now,
  // instead of failing outright over an attribution nobody asked for.
  const { data: members = [] } = useGetMembers();
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);

  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  // How far a statement has got, so a long one does not look frozen: opening
  // the file, reading page by page, then checking what is already recorded.
  const [readProgress, setReadProgress] = useState<{ stage: 'opening' | 'reading' | 'checking'; page?: number; of?: number } | null>(null);
  // Reading is noted on the phone as it goes; a read that ends - in a review
  // or a message on screen - leaves nothing behind.
  // Only a read this screen ran is cleared when it ends: on opening, the step
  // an earlier run left must survive long enough to be read below.
  const readThisRun = React.useRef(false);
  useEffect(() => {
    if (readProgress) {
      readThisRun.current = true;
      noteImportStep(
        readProgress.stage === 'reading' && readProgress.page ? `reading page ${readProgress.page} of ${readProgress.of ?? '?'}` : readProgress.stage === 'checking' ? 'checking what is already recorded' : 'opening the statement',
        readProgress.stage,
      );
    } else if (readThisRun.current && getImportProgress()?.stage !== 'saving') {
      clearImportStep();
    }
  }, [readProgress]);
  // The app was closed in the middle of an import the last time: said here,
  // with where it had got to, rather than leaving an empty screen to explain.
  const [unfinished, setUnfinished] = useState<ImportStep | null>(null);
  useEffect(() => {
    void readUnfinishedImport().then((step) => {
      if (step) setUnfinished(step);
    });
  }, []);
  // A read that stops moving is given up on, so the buttons are not left
  // spinning for ever. Restarted on every page, so a long statement that is
  // still going is never cut off - only one that has gone quiet.
  const readStallTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const READ_STALL_MS = 90_000;
  const clearReadStall = () => {
    if (readStallTimer.current) clearTimeout(readStallTimer.current);
    readStallTimer.current = null;
  };
  const armReadStall = () => {
    clearReadStall();
    readStallTimer.current = setTimeout(() => {
      readStallTimer.current = null;
      setReaderJob(null);
      setReading(false);
      setReadProgress(null);
      Alert.alert('The statement stopped loading', 'Nothing happened for a minute and a half, so Jamvi stopped. Try again, or paste your messages instead.');
    }, READ_STALL_MS);
  };
  useEffect(() => clearReadStall, []);
  // A statement PDF: read on this phone, with its password used only here.
  const [statementFile, setStatementFile] = useState<ChosenStatement | null>(null);
  const [statementPassword, setStatementPassword] = useState('');
  // Shown on request: a statement password is long and typed blind, and one
  // wrong digit only shows up as "Wrong password" after the file is read.
  const [showStatementPassword, setShowStatementPassword] = useState(false);
  const [readerJob, setReaderJob] = useState<ReaderJob | null>(null);
  const [statementNote, setStatementNote] = useState<string | null>(null);
  const [statementReading, setStatementReading] = useState<StatementReading | null>(null);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  // Undo for every change to the list - a chip, Not sure, Confirm, a bulk
  // button, an untick - most recent first. Cleared for a new list or after a
  // save (when the lines change); a save itself is not undone here.
  const { canUndo, steps: undoSteps, undo } = useUndoHistory(choices, setChoices, lines, {
    skip: (previous) => Object.keys(previous).length === 0,
  });
  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.
  const [view, setView] = useState<ReviewView>('all');
  // How many entries are drawn. A full year's statement is thousands of
  // entries, each a card with rows of buttons, and drawing them all at once
  // ran the phone out of memory: Android closed Jamvi with no message. The
  // list is drawn a page at a time; saving still covers every entry.
  const [shownCount, setShownCount] = useState(LINES_PER_PAGE);
  const [shownSkipped, setShownSkipped] = useState(LINES_PER_PAGE);
  // Lines whose extra questions (debt, move, savings...) are open. Each closed line is a few native views instead of a dozen, which is what kept toggling snappy with 200 of them.
  const [openMore, setOpenMore] = useState<Set<number>>(new Set());
  // "Record it in a separate budget instead" opened on these lines: a business's money
  // is asked under Who is this for?, so the other-budget question waits to be asked for.
  const [otherBudgetOpen, setOtherBudgetOpen] = useState<Set<number>>(new Set());
  const [chargeCategory, setChargeCategory] = useState('');
  // A number is a line being categorised; 'charge' is the M-Pesa charges; 'recat:N' is an already-recorded entry whose category is being changed.
  const [picking, setPicking] = useState<number | 'charge' | 'bulk' | `recat:${number}` | `teach:${string}` | null>(null);
  // Search over the review ("bundle", "KPLC", a till): what is found can be
  // confirmed, or given one category, all together.
  const [find, setFind] = useState('');
  const [recat, setRecat] = useState<Record<number, string>>({});
  const [recategorising, setRecategorising] = useState(false);
  const [saving, setSaving] = useState(false);
  // How far a save has got, so two hundred entries travelling to the server together does
  // not just sit behind a spinner with no sign of life.
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // How the last save of part of a statement went, shown on the review itself:
  // the whole-screen result is only for when nothing is left to save.
  const [lastSave, setLastSave] = useState<Outcome | null>(null);
  // Seen here, the result needs no bar elsewhere: cleared on leaving once it
  // is done. Left while still saving, it stays for the bar to report.
  useEffect(() => () => {
    if (getImportProgress()?.stage === 'done') setImportProgress(null);
  }, []);
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

  // One plain message when the trial or subscription has ended, with the way
  // to pay, in place of the same 402 listed under every entry.
  const lapsedCard = (waiting: number) => {
    const words = lapsedSaveMessage(entitlements?.status, waiting, isShared);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="mpesa-save-lapsed">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="lock" size={18} color={colors.primary} />
          <Text style={[styles.lineTitle, { color: colors.foreground, flex: 1 }]}>{words.title}</Text>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{words.body}</Text>
        <Pressable
          onPress={() => router.push('/subscription')}
          style={[styles.primary, { backgroundColor: colors.primary, marginTop: 10 }]}
          accessibilityRole="button"
          testID="mpesa-save-lapsed-pay"
        >
          <Text style={styles.primaryText}>{words.action}</Text>
        </Pressable>
      </View>
    );
  };
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
      // What the person chose comes back as it was; what Jamvi files itself is filed again (lib/mpesaProducts).
      setChoices(refreshSuggestions(saved.reading.lines, saved.choices, history, categories.map((row) => row.name), effectiveChargeCategory, rules));
      setStatementNote('Picked up where you left off with your statement. Anything saved since is marked as recorded.');
      // Some may have been saved from another screen since: ask again which are recorded.
      markRecorded(saved.reading.lines)
        .then(async (checked) => {
          setLines(checked);
          setStatementReading((current) => (current ? { ...current, lines: checked } : current));
          // A save started before is either still running (left this screen,
          // came back) or was cut short (the app was closed): wait for the
          // first, finish the second. Either way nothing has to be redone.
          // A save on the server (lib/serverSave) went on while Jamvi was closed:
          // it is followed to its end here, unless this run of the app already is.
          const serverJob = await pendingSaveJob(group?.id);
          if (getImportProgress()?.stage === 'saving' && (!serverJob || isFollowingServerSave(serverJob))) {
            setWaitingForSave(true);
          } else if (serverJob) {
            setStatementNote('Your save carried on while Jamvi was closed. Showing how it went.');
            setResumeJob(serverJob);
            setResumeSave(true);
          } else if (await hasPendingSave(group?.id)) {
            setStatementNote('Carrying on with the save you started. Entries already saved are skipped.');
            setResumeSave(true);
          }
        })
        .catch(() => {});
    },
  });
  // A save still running from before this screen opened: shown, not started twice,
  // and the list brought up to date when it ends.
  const [waitingForSave, setWaitingForSave] = useState(false);
  const [resumeSave, setResumeSave] = useState(false);
  const [resumeJob, setResumeJob] = useState<number | null>(null);
  const liveProgress = useImportProgress();
  // A save from an earlier visit to this screen, still running: its progress
  // is shown here, since the bar the rest of Jamvi shows is off on this screen.
  const backgroundSave = !saving && liveProgress?.stage === 'saving' ? liveProgress : null;
  useEffect(() => {
    if (!waitingForSave || liveProgress?.stage === 'saving' || !lines) return;
    setWaitingForSave(false);
    markRecorded(lines)
      .then(async (checked) => {
        setLines(checked);
        setStatementReading((current) => (current ? { ...current, lines: checked } : current));
        // Followed by the bar, not this screen: what each entry became is read
        // back here, so the rest (remembered payees, debts, names) is done too.
        const serverJob = await pendingSaveJob(group?.id);
        if (serverJob && !isFollowingServerSave(serverJob)) {
          setResumeJob(serverJob);
          setResumeSave(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForSave, liveProgress?.stage]);

  // Reading the same statement PDF again (an update reads it better) shows the
  // picker over the entries without clearing them: the work in progress and its
  // copy on this phone stay exactly as they are until the new reading arrives,
  // and that reading keeps every choice (carryChoices).
  const [rereading, setRereading] = useState(false);

  const startOver = () => {
    setRereading(false);
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

  // Recording a line in a different budget entirely — a side hustle run as its own project,
  // say. Only a budget this person actually manages, so recording in it is always allowed.
  // Its accounts, categories and income sources are read without ever switching to it, then
  // kept for the rest of this review so picking it on a second line costs nothing further.
  const otherManagedBudgets = (workspaces as Workspace[]).filter(
    (workspace) => workspace.id !== group?.id && (workspace.role === 'owner' || workspace.role === 'admin'),
  );
  const [otherBudgetOptions, setOtherBudgetOptions] = useState<Record<number, OtherBudgetOptions>>({});
  const [loadingOtherBudget, setLoadingOtherBudget] = useState<number | null>(null);
  const loadOtherBudgetOptions = async (groupId: number): Promise<OtherBudgetOptions | null> => {
    const cached = otherBudgetOptions[groupId];
    if (cached) return cached;
    setLoadingOtherBudget(groupId);
    try {
      const options = await fetchOtherBudgetOptions(groupId);
      setOtherBudgetOptions((current) => ({ ...current, [groupId]: options }));
      return options;
    } catch (error: unknown) {
      Alert.alert('Could not read that budget', error instanceof Error ? error.message : 'Please try again.');
      return null;
    } finally {
      setLoadingOtherBudget(null);
    }
  };
  // Once the new budget has loaded, read the same messages again: duplicates,
  // suggestions and nicknames are all per budget. A statement is not read again from a
  // file (the file is gone), so its entries are kept and checked against the new budget:
  // which of them it already has, and fresh suggestions. Switching used to clear the
  // choices and leave every entry unticked and greyed out.
  const statementReadingRef = React.useRef<StatementReading | null>(null);
  statementReadingRef.current = statementReading;
  useEffect(() => {
    if (switchedToRef.current === null || group?.id !== switchedToRef.current) return;
    switchedToRef.current = null;
    if (textRef.current.trim()) {
      void readRef.current(textRef.current);
      return;
    }
    const kept = statementReadingRef.current;
    if (!kept) return;
    // What the old budget had recorded says nothing about the new one.
    const fresh = kept.lines.map((item) => ({ ...item, alreadyRecorded: null }));
    void markRecorded(fresh)
      .catch(() => fresh)
      .then((checked) => {
        setLines(checked);
        setStatementReading({ ...kept, lines: checked });
        setChoices(startChoices(checked, initialChoices(checked, [], [], effectiveChargeCategory, {}, canManageBudget)));
      });
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
    // On the server too, for every phone and the web (lib/rulesStore).
    void saveRules(group?.id, next, rules);
  };
  // Payees remembered as another budget's - the chama's paybill, say - kept the
  // same way, so the next statement suggests that budget for them.
  const otherRulesKey = otherBudgetRulesKey(group?.id);
  const [otherRules, setOtherRules] = useState<OtherBudgetRules>({});
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(otherRulesKey)
      .then((stored) => {
        if (active) setOtherRules(parseOtherBudgetRules(stored));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [otherRulesKey]);
  const keepOtherRules = (next: OtherBudgetRules) => {
    setOtherRules(next);
    void saveKnowledge(group?.id, 'other-budget-rules', next);
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
    void saveKnowledge(group?.id, 'payee-nicknames', next);
    const renamed = applyNicknames(lines, next);
    setLines(renamed);
    setChoices((current) => refreshSuggestions(renamed, current, history, categories.map((row) => row.name), effectiveChargeCategory, rules));
    setNaming(null);
  };

  // The categories and this account's history can arrive after the messages were
  // read (a Share opens the app cold, and they load in the background). When they
  // do, suggest again for lines still on a suggestion or on nothing; a category
  // the person chose is never touched.
  useEffect(() => {
    if (!lines) return;
    setChoices((current) => refreshSuggestions(lines, current, history, categories.map((row) => row.name), effectiveChargeCategory, rules));
    // Runs when the lists load, not on every choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryList, account]);

  // Sending a message Jamvi could not read, so its format can be learned.
  const [reporting, setReporting] = useState<{ index: number; text: string } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reported, setReported] = useState<Set<number>>(new Set());

  const openReport = (index: number) => {
    const message = smsMessages ? smsMessages[index] ?? null : messageFor(text, index);
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

  // Every budget has built-in charge categories (the server makes sure). When
  // they are there, fees go to them without asking, the same every time; a
  // budget without them yet keeps the picker, so an import never stalls.
  const builtInCharge = useMemo(
    () => categories.find((row) => row.name.trim().toLowerCase() === 'm-pesa charges')?.name ?? null,
    [categories],
  );
  const fulizaCategory = useMemo(
    () => categories.find((row) => row.name.trim().toLowerCase() === 'fuliza charges')?.name ?? null,
    [categories],
  );
  useEffect(() => {
    if (builtInCharge) setChargeCategory(builtInCharge);
  }, [builtInCharge]);
  // Charges go to the budget's built-in M-Pesa charges whenever it has one.
  // The last category picked for charges is remembered across budgets, and
  // when it loaded after the categories it quietly won - filing every charge
  // under School fees. It now only stands in where there is no built-in one.
  const effectiveChargeCategory = builtInCharge ?? chargeCategory;

  // Reading messages, pasted or from the phone. It saves nothing, so a server
  // that is briefly not there (a restart, a dropped connection) is waited out
  // and asked again, the same as a save is, before the reading gives up.
  const readPreview = (pasted: string) =>
    retrySave(() =>
      customFetch<{ lines: PreviewLine[] }>('/api/mpesa/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasted }),
      }),
    ).catch((error: unknown) => {
      throw new ReadRequestFailed(error);
    });

  const readMessages = async (pasted: string = text) => {
    if (!pasted.trim()) {
      Alert.alert('Paste your messages', 'Copy them from your Messages app, then paste them here.');
      return;
    }
    setReading(true);
    setSmsMessages(null);
    try {
      const response = await readPreview(pasted);
      // Read fresh: a share can be read before the effect above has loaded them.
      const known = parseStoredNicknames(await AsyncStorage.getItem(nicknamesKey).catch(() => null));
      setNicknames(known);
      const shown = applyNicknames(response.lines, known);
      setLines(shown);
      setChoices(startChoices(shown, initialChoices(shown, history, categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget)));
      // Then: another of the person's budgets that has these codes, and entries typed by hand that look the same.
      void markRecorded(shown)
        .then((checked) => {
          setLines((current) => mergeTwins(current, checked));
          setChoices((current) => untickElsewhere(checked, current));
        })
        .catch(() => {});
      // A restored draft brings back what was chosen by hand, on top of the fresh reading.
      const restoredChoices = pendingChoicesRef.current;
      if (restoredChoices) {
        pendingChoicesRef.current = null;
        setChoices((current) => refreshSuggestions(shown, { ...current, ...restoredChoices }, history, categories.map((row) => row.name), effectiveChargeCategory, rules));
      }
    } catch (error: unknown) {
      Alert.alert('Could not read them', plainReadFailure(error));
    } finally {
      setReading(false);
    }
  };


  // Reading M-Pesa's messages straight from the phone (lib/mpesaSms): Android,
  // in a build that carries it. The texts are kept here only so a line can be
  // matched back to its message; they are never saved.
  const smsReadable = canReadSms();
  // The first time - nothing brought in from M-Pesa in this budget yet - the
  // screen leads with one statement from a day the person chooses, and the
  // other ways in wait one tap away (lib/mpesaFirstStart).
  const { data: mpesaSummary } = useQuery<{ imported: boolean }>({
    queryKey: ['mpesa-summary', group?.id ?? null],
    queryFn: () => customFetch<{ imported: boolean }>('/api/mpesa/summary'),
    enabled: group?.id != null,
    staleTime: 60_000,
  });
  const firstRun = mpesaSummary?.imported === false && !rereading;
  const [startFrom, setStartFrom] = useState(() => startPresets()[0].from);
  const [otherWays, setOtherWays] = useState(false);
  // Read the first time, so what the statement left out is said and reading new messages starts after it.
  const firstStatementRef = React.useRef<{ from: string } | null>(null);
  const [smsMessages, setSmsMessages] = useState<string[] | null>(null);
  const [smsFrom, setSmsFrom] = useState<string>(monthStartIso);
  const [smsTo, setSmsTo] = useState<string>(() => isoDay(new Date()));
  // A month with the arrows, or a period ending today (lib/mpesaSms).
  const [smsPeriod, setSmsPeriod] = useState<SmsPeriod>('month');
  const chooseSmsPeriod = (period: SmsPeriod) => {
    setSmsPeriod(period);
    // Picking dates starts from whatever was showing, to adjust from there.
    if (period === 'dates') return;
    const range = smsPeriodRange(period);
    setSmsFrom(range.from);
    setSmsTo(range.to);
  };
  const [smsPicker, setSmsPicker] = useState<null | 'from' | 'to'>(null);
  const [smsAuto, setSmsAuto] = useState<SmsAuto>({ on: false, since: 0 });
  // The newest message taken in by "new since you last looked", so a save moves the mark on.
  const smsNewestRef = React.useRef<number | null>(null);
  const autoKey = smsAutoKey(user?.id);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(autoKey).then((raw) => { if (active) setSmsAuto(parseSmsAuto(raw)); }).catch(() => {});
    return () => { active = false; };
  }, [autoKey]);
  // Resolves once the mark is stored. Home's count reads it back from storage, so
  // asking Home to count again before then counted the same messages as new until
  // the next refresh (5 Oct 2026): wait for this before invalidating 'new-mpesa-sms'.
  const keepSmsAuto = (next: SmsAuto): Promise<void> => {
    setSmsAuto(next);
    // The notification opens "new since you last looked", so it goes off with it.
    if (!next.on && smsNotify) void setSmsNotify(false).then((result) => setSmsNotifyState(result.on));
    return AsyncStorage.setItem(autoKey, JSON.stringify(next)).catch(() => {});
  };
  // A notification the moment M-Pesa texts, from a build that carries it.
  const smsNotifiable = canNotifySms();
  const [smsNotify, setSmsNotifyState] = useState<boolean>(() => smsNotifyOn());
  const toggleSmsNotify = async () => {
    const result = await setSmsNotify(!smsNotify);
    setSmsNotifyState(result.on);
    if (result.reason) Alert.alert('Could not turn it on', smsRefusal(result.reason));
    // Tapping the notification opens the messages since Jamvi last looked, so that is on too.
    else if (result.on && !smsAuto.on) void keepSmsAuto({ on: true, since: smsAuto.since || Date.now() });
  };
  // The messages read through the same reader as pasted ones, a batch at a time.
  const readSmsMessages = async (messages: string[]): Promise<PreviewLine[] | null> => {
    if (messages.length === 0) {
      Alert.alert('No M-Pesa messages', 'There are no M-Pesa messages on this phone for those dates.');
      return null;
    }
    setReading(true);
    try {
      const all: PreviewLine[] = [];
      for (const batch of smsBatches(messages)) {
        const response = await readPreview(batch.join('\n\n'));
        const offset = all.length;
        all.push(...response.lines.map((line) => ({ ...line, index: line.index + offset })));
      }
      const known = parseStoredNicknames(await AsyncStorage.getItem(nicknamesKey).catch(() => null));
      setNicknames(known);
      const shown = applyNicknames(all, known);
      setText('');
      setSmsMessages(messages);
      setLines(shown);
      setChoices(startChoices(shown, initialChoices(shown, history, categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget)));
      // Then: another of the person's budgets that has these codes, and entries typed by hand that look the same.
      void markRecorded(shown)
        .then((checked) => {
          setLines((current) => mergeTwins(current, checked));
          setChoices((current) => untickElsewhere(checked, current));
        })
        .catch(() => {});
      return shown;
    } catch (error: unknown) {
      Alert.alert('Could not read them', plainReadFailure(error));
      return null;
    } finally {
      setReading(false);
    }
  };
  const readSmsRange = async () => {
    try {
      const result = await readMpesaSms(smsFrom, smsTo);
      if (!result.ok) {
        Alert.alert('Could not read your messages', smsRefusal(result.reason));
        return;
      }
      // The first time it is allowed, new messages are looked for from now on.
      if (!smsAuto.on && smsAuto.since === 0) void keepSmsAuto({ on: true, since: Date.now() });
      smsNewestRef.current = null;
      await readSmsMessages(result.messages);
    } catch (error: unknown) {
      Alert.alert('Could not read your messages', plainSaveError(error));
    }
  };
  // Opened from Home's "new M-Pesa messages": everything since Jamvi last looked.
  const params = useLocalSearchParams<{ fromSms?: string; smsFrom?: string; smsTo?: string; notSure?: string }>();
  // Opened by "Fix all" on Find the difference: what is read is put under Not
  // sure yet and saved straight away - the person confirmed it there.
  const [autoSaveNotSure, setAutoSaveNotSure] = useState(false);
  // Opened from "Find the difference" for the days where Jamvi and M-Pesa parted:
  // those days' messages, read straight away, with what is already saved marked.
  const openedForRange = React.useRef(false);
  useEffect(() => {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (openedForRange.current || lines || !params.smsFrom || !params.smsTo || !day.test(params.smsFrom) || !day.test(params.smsTo)) return;
    openedForRange.current = true;
    setSmsFrom(params.smsFrom);
    setSmsTo(params.smsTo);
    void readMpesaSms(params.smsFrom, params.smsTo).then((result) => {
      if (!result.ok) {
        Alert.alert('Could not read your messages', smsRefusal(result.reason));
        return;
      }
      return readSmsMessages(result.messages).then((shown) => {
        if (!shown || params.notSure !== '1') return;
        // Nothing on these days is Jamvi's to save by itself: said so, rather
        // than a save of nothing ("0 entries saved").
        if (!shown.some(isRecordable)) {
          Alert.alert('Nothing to bring in', 'Every message on these days is already saved, or is one Jamvi does not save by itself (each says why below). Go back and tap Check again.');
          return;
        }
        setChoices((current) => putUnderNotSure(notSureableLines(shown, current), current));
        setAutoSaveNotSure(true);
      });
    }).catch((error: unknown) => Alert.alert('Could not read your messages', plainSaveError(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.smsFrom, params.smsTo]);
  const openedForNew = React.useRef(false);
  useEffect(() => {
    if (params.fromSms !== 'new' || openedForNew.current || !smsAuto.on || lines) return;
    openedForNew.current = true;
    void newMpesaSms(smsAuto.since).then(async (found) => {
      if (!found) return;
      smsNewestRef.current = found.newest;
      const shown = await readSmsMessages(found.messages);
      // Every one already recorded (or none a payment): there is nothing to
      // save, so Save can never move the mark on. Moved on here instead, or
      // the same messages counted as new on Home's badge for ever.
      if (shown && !shown.some(isRecordable)) {
        await keepSmsAuto({ on: true, since: found.newest });
        smsNewestRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.fromSms, smsAuto.on, smsAuto.since]);

  // Which of a statement's entries this budget already has: asked with the receipt codes only.
  const markRecorded = async (all: PreviewLine[]): Promise<PreviewLine[]> => {
    const codes = [...new Set(all.map((line) => line.receipt).filter((code): code is string => Boolean(code)))];
    if (codes.length === 0) return all;
    // A year's statement holds thousands of codes; the server takes 2,000 at a time.
    const found: Array<{ receipt: string; date: string; description: string; category?: string | null; editable?: boolean }> = [];
    const elsewhere: Array<{ receipt: string; budget: string }> = [];
    for (let start = 0; start < codes.length; start += RECEIPT_BATCH) {
      const body = await customFetch<{ recorded: typeof found }>('/api/mpesa/import/check-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts: codes.slice(start, start + RECEIPT_BATCH) }),
      });
      found.push(...body.recorded);
      // Codes already in another of the person's budgets. Only a warning: a failure is passed over.
      const other = await customFetch<{ elsewhere: typeof elsewhere }>('/api/possible-duplicates/elsewhere', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts: codes.slice(start, start + RECEIPT_BATCH) }),
      }).catch(() => ({ elsewhere: [] }));
      elsewhere.push(...other.elsewhere);
    }
    const body = { recorded: found };
    const recorded = new Map(body.recorded.map((row) => [row.receipt, { date: row.date, description: row.description, category: row.category ?? null, editable: row.editable === true }]));
    const marked = all.map((line) => {
      const existing = line.receipt ? recorded.get(line.receipt) : undefined;
      return existing ? { ...line, alreadyRecorded: existing } : line;
    });
    // Entries typed by hand that look like the same payment (lib/mpesaImport withTwins).
    // Only a warning: a failed check never stops the reading.
    const matches: Array<{ key: string; entries: Array<{ description: string; date: string; amount: number }> }> = [];
    const questions = twinQuestions(marked);
    for (let start = 0; start < questions.length; start += RECEIPT_BATCH) {
      try {
        const body = await customFetch<{ matches: typeof matches }>('/api/possible-duplicates/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ against: 'typed', items: questions.slice(start, start + RECEIPT_BATCH) }),
        });
        matches.push(...body.matches);
      } catch {
        break;
      }
    }
    return withTwins(marked, matches, elsewhere);
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
    // The progress shows under the button, which the keyboard would cover.
    Keyboard.dismiss();
    setReading(true);
    setReadProgress({ stage: 'opening' });
    armReadStall();
    try {
      setReaderJob({ base64: await statementBase64(statementFile.uri), password: statementPassword });
    } catch (error: unknown) {
      clearReadStall();
      setReading(false);
      setReadProgress(null);
      Alert.alert('Could not read the statement', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  // The hidden page has read the PDF (or said why it could not): turn it into the same list a paste makes.
  const onStatementRead = async (result: ReaderMessage) => {
    if (result.type === 'ready') return;
    if (result.type === 'progress') {
      setReadProgress({ stage: 'reading', page: result.page, of: result.of });
      armReadStall();
      return;
    }
    clearReadStall();
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
        if (result.message === READER_STOPPED) throw new Error(READER_STOPPED);
        throw new Error('Jamvi could not open this file. Is it the M-Pesa statement PDF?');
      }
      const allRows = resolveDirections(readStatementRows(result.pages));
      if (allRows.length === 0) throw new Error('Jamvi could not find the payments in this file. Is it the M-Pesa statement PDF?');
      // The first time, only from the day chosen (lib/mpesaFirstStart).
      const rows = firstRun ? fromStatementStart(allRows, startFrom) : allRows;
      if (rows.length === 0) throw new Error(`Nothing on this statement is from ${longDay(startFrom)} or later. Choose an earlier day, or a statement that reaches it.`);
      firstStatementRef.current = firstRun ? { from: startFrom } : null;
      if (!checkRunningBalance(rows).ok) {
        throw new Error('This statement does not add up, so Jamvi will not risk recording wrong amounts. Paste your messages instead.');
      }
      // Fuliza an earlier statement left owed is repaid first in this one, not charged as fees.
      const recordedRows = (account?.transactions ?? []) as Array<{ mpesaReceipt?: string | null; amount?: number | string | null }>;
      // Less what an overlapping statement already recorded of its Fuliza lines.
      const reading = withoutRecordedFuliza(
        statementLines(rows, fulizaOwedBefore(statementLines(rows).firstDate, recordedRows)),
        recordedRows as unknown as RecordedRow[],
      );
      setReadProgress({ stage: 'checking' });
      const checked = await markRecorded(reading.lines);
      const known = parseStoredNicknames(await AsyncStorage.getItem(nicknamesKey).catch(() => null));
      setNicknames(known);
      const shown = applyNicknames(checked, known);
      const left = [
        reading.loanDraws > 0 ? `${reading.loanDraws} Fuliza loans` : null,
        reading.loanRepayments > 0 ? `${reading.loanRepayments} loan repayments` : null,
      ].filter(Boolean);
      setStatementNote(
        `Read ${shown.length} entries from your statement. It adds up.${left.length > 0 ? ` Left out because they are not spending or income: ${left.join(' and ')}. What a Fuliza loan paid for is recorded as a normal payment${reading.loanOwedAtEnd ? ', and Fuliza still owed at the end is listed as borrowed' : ''}.` : ''}`,
      );
      setLines(shown);
      setStatementReading({ ...reading, lines: shown });
      const fresh = startChoices(shown, initialChoices(shown, history, categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget));
      // Reading the same statement again keeps what was already worked through.
      const built = lines ? carryChoices(lines, choices, shown, fresh) : fresh;
      setChoices(built);
      setRereading(false);
      setStatementPassword('');
      setShowStatementPassword(false);
    } catch (error: unknown) {
      Alert.alert('Could not read the statement', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReading(false);
      setReadProgress(null);
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
  // Keeps Jamvi's suggestion as checked, or takes that back.
  // Confirming keeps Jamvi's suggestion - and remembers it, unless unticked.
  const confirm = (index: number, confirmed: boolean) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], confirmed, ...(confirmed ? { remember: current[index]?.remember ?? true } : {}) } }));

  const chooseCategory = (name: string) => {
    if (typeof picking === 'string' && picking.startsWith('teach:')) {
      const taught = teachGroups.find((one) => one.key === picking.slice(6));
      if (taught) teachAsCategory(taught, name);
    } else if (typeof picking === 'string' && picking.startsWith('recat:')) {
      setRecat((current) => ({ ...current, [Number(picking.slice(6))]: name }));
    } else if (picking === 'charge') {
      setChargeCategory(name);
      AsyncStorage.setItem(CHARGE_CATEGORY_KEY, name).catch(() => {});
    } else if (typeof picking === 'number') {
      setChoices((current) => chooseLineCategory(lines ?? [], current, picking, name));
    } else if (picking === 'bulk') {
      const targets = categorisableLines(inView, choices);
      setPicking(null);
      Alert.alert(
        `Put ${targets.length} ${targets.length === 1 ? 'entry' : 'entries'} under ${name}?`,
        `Every entry found for ${foundFor} that is money out, including any not shown yet below. They count as confirmed, and nothing is saved until you tap Save.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: `Put under ${name}`, onPress: () => setChoices((current) => categoriseLines(targets, current, name)) },
        ],
      );
      return;
    }
    setPicking(null);
  };

  // Fuliza's fees: repayments above draws, which nothing else records. Offered
  // as one charge for the statement, once, and not over days already covered.
  const fuliza = useMemo(() => (statementReading ? fulizaCharges(statementReading) : null), [statementReading]);
  const fulizaCheck = useMemo(() => {
    if (!fuliza) return null;
    const receipts = ((account?.transactions ?? []) as Array<{ mpesaReceipt?: string | null }>).map((row) => row.mpesaReceipt);
    return fulizaChargeOverlap(fuliza, receipts);
  }, [fuliza, account]);
  // Setting the account's opening balance to the statement's, when nothing is
  // recorded in it before the statement starts - the one case where that is
  // certainly right. Anything recorded earlier and the difference is only shown.
  const { mutateAsync: updateOpeningBalance } = useUpdateJointAccountOpeningBalance();
  const [openingSaving, setOpeningSaving] = useState(false);
  const openingFix = useMemo(() => {
    const first = statementReading?.firstDate;
    const opening = statementReading?.opening;
    if (!first || opening == null || !account || !accountId) return null;
    const rows = (account.transactions ?? []) as Array<{ date: string }>;
    if (rows.some((row) => String(row.date).slice(0, 10) < first)) return null;
    const current = Number((account as { openingBalance?: number | null }).openingBalance ?? 0);
    if (Math.abs(current - opening) < 0.005) return null;
    const before = new Date(`${first}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    return { current, to: opening, date: before.toISOString().slice(0, 10) };
  }, [statementReading, account, accountId]);
  // Jamvi's own balance for this account the day before the statement starts
  // and on its last day, beside M-Pesa's. A difference at the start is from
  // before the statement, and nothing in it will close it.
  const balanceSides = useMemo(() => {
    const first = statementReading?.firstDate;
    const last = statementReading?.lastDate;
    if (!first || !last || statementReading?.opening == null || statementReading?.closing == null || !account) return null;
    const rows = (account.transactions ?? []) as Array<{ date: string; type: string; amount: number }>;
    const opening = Number((account as { openingBalance?: number | null }).openingBalance ?? 0);
    const startDay = dayBefore(first);
    return {
      startDay,
      jamviStart: balanceAtEndOf(startDay, opening, rows),
      mpesaStart: statementReading.opening,
      endDay: last,
      jamviEnd: balanceAtEndOf(last, opening, rows),
      mpesaEnd: statementReading.closing,
    };
  }, [statementReading, account]);
  // Removing an entry the statement does not have waits a few seconds for Undo.
  const undoable = useUndoableDelete();
  // Removed, and kept out of the list while the account reloads: once Undo
  // had passed, the entry came back until everything was fetched again - "the
  // remove button is taking too long to respond" (6 Oct 2026).
  const [removedIds, setRemovedIds] = useState<ReadonlySet<number>>(() => new Set());
  // What this account has for the statement's days that the statement does not.
  const extras = useMemo(() => {
    const found = statementReading && account ? notOnStatement(statementReading, (account.transactions ?? []) as unknown as RecordedRow[]) : null;
    if (!found) return null;
    const rows = found.rows.filter((row) => !undoable.isHidden(`extra:${row.id}`) && !removedIds.has(row.id));
    return { rows, net: Math.round(rows.reduce((sum, row) => sum + row.effect, 0) * 100) / 100 };
  }, [statementReading, account, undoable.isHidden, removedIds]);
  // Sorting a difference out where it is shown (asked for 3 Oct 2026), rather
  // than "open Bank and fix it": an entry M-Pesa never had can be removed, and
  // one saved for a different amount set to the statement's.
  const removeExtra = (row: { id: number; date: string; description?: string | null; effect: number; why: string }) => {
    Alert.alert(
      'Remove it from Jamvi?',
      `${String(row.date).slice(0, 10)} · ${row.description ?? ''} · KES ${formatExact(Math.abs(row.effect))}\n\nYour M-Pesa statement has no record of it (${row.why}). Remove it if it did not happen, or was recorded twice.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => undoable.schedule(`extra:${row.id}`, deletedLabel(row.description, Math.abs(row.effect)), async () => {
            setRemovedIds((ids) => new Set(ids).add(row.id));
            try {
              await customFetch(`/api/joint-account/${row.id}`, { method: 'DELETE' });
            } catch (error: unknown) {
              setRemovedIds((ids) => {
                const next = new Set(ids);
                next.delete(row.id);
                return next;
              });
              Alert.alert('Could not remove it', plainSaveError(error));
            }
            await queryClient.invalidateQueries();
          }),
        },
      ],
    );
  };
  const [correcting, setCorrecting] = useState<number | null>(null);
  const applyStatementAmount = (row: { id: number; date: string; description: string; recorded: number; statement: number }) => {
    Alert.alert(
      `Change it to KES ${formatExact(row.statement)}?`,
      `${row.date} · ${row.description}\n\nSaved as KES ${formatExact(row.recorded)}; your M-Pesa statement says KES ${formatExact(row.statement)}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Use the statement',
          onPress: async () => {
            setCorrecting(row.id);
            try {
              await customFetch(`/api/joint-account/${row.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: row.statement, date: row.date }),
              });
              await queryClient.invalidateQueries();
            } catch (error: unknown) {
              Alert.alert('Could not change it', plainSaveError(error));
            } finally {
              setCorrecting(null);
            }
          },
        },
      ],
    );
  };
  // "Fix these for me": the entries the check can prove are duplicates of this
  // statement - a pasted Fuliza fee its Fuliza charges already hold, an
  // earlier statement's Fuliza line it replaces, a charge kept twice - removed
  // after one confirmation. Anything it cannot prove stays listed to decide.
  const [fixingExtras, setFixingExtras] = useState(false);
  const fixableExtras = (extras?.rows ?? []).filter((row) => row.fixable);
  const fixExtras = () => {
    if (fixableExtras.length === 0 || fixingExtras) return;
    const total = Math.round(fixableExtras.reduce((sum, row) => sum + row.effect, 0) * 100) / 100;
    Alert.alert(
      `Remove ${fixableExtras.length} ${fixableExtras.length === 1 ? 'duplicate' : 'duplicates'}?`,
      `${fixableExtras.map((row) => `· ${String(row.date).slice(0, 10)} · ${row.description ?? ''} · KES ${formatExact(Math.abs(row.effect))}`).join('\n')}\n\nThese are already counted by this statement. Removing them moves the balance by KES ${formatExact(-total)}.`,
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Remove them',
          style: 'destructive',
          onPress: async () => {
            setFixingExtras(true);
            let failed = 0;
            for (const row of fixableExtras) {
              try {
                await customFetch(`/api/joint-account/${row.id}`, { method: 'DELETE' });
              } catch {
                failed += 1;
              }
            }
            await queryClient.invalidateQueries();
            setFixingExtras(false);
            if (failed > 0) Alert.alert('Some were not removed', `${failed} could not be removed. Open Bank to delete them by hand.`);
          },
        },
      ],
    );
  };
  // And the other way: what the statement has that this account does not, among
  // entries it already holds - chiefly a payment saved without its charge.
  const missing = useMemo(
    () => (statementReading && account ? missingInJamvi(statementReading, (account.transactions ?? []) as unknown as RecordedRow[]) : null),
    [statementReading, account],
  );
  const [addingMissing, setAddingMissing] = useState(false);
  const addMissingCharges = () => {
    if (!missing || missing.charges.length === 0 || addingMissing || !accountId) return;
    const total = missing.charges.reduce((sum, charge) => sum + charge.amount, 0);
    Alert.alert(
      `Add ${missing.charges.length} missing ${missing.charges.length === 1 ? 'charge' : 'charges'}?`,
      `${missing.charges.map((charge) => `· ${charge.date} · ${charge.description} · KES ${formatExact(charge.amount)}`).join('\n')}\n\nOn the statement, but never saved here. They go under ${effectiveChargeCategory || 'the charges category'}, each beside its payment, and move the balance by KES ${formatExact(-total)}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Add them',
          onPress: async () => {
            setAddingMissing(true);
            let failed = 0;
            for (const charge of missing.charges) {
              try {
                await createDisbursement({
                  data: {
                    amount: charge.amount,
                    description: charge.description,
                    date: charge.date,
                    madeById: user?.id ?? null,
                    expenseCategory: effectiveChargeCategory,
                    destinationKind: 'category',
                    accountId,
                    chargeForTransactionId: charge.parentId,
                  } as never,
                });
              } catch {
                failed += 1;
              }
            }
            await queryClient.invalidateQueries();
            setAddingMissing(false);
            if (failed > 0) Alert.alert('Some were not added', `${failed} could not be added. Record them on Bank by hand.`);
          },
        },
      ],
    );
  };
  // This statement's own Fuliza lines saved from an earlier download of the
  // same days: brought up to what this statement says, after one tap.
  const fulizaUpdates = (missing?.amounts ?? []).filter((row) => row.fixable);
  const [updatingFuliza, setUpdatingFuliza] = useState(false);
  const updateFuliza = () => {
    if (fulizaUpdates.length === 0 || updatingFuliza) return;
    Alert.alert(
      'Update to this statement?',
      `${fulizaUpdates.map((row) => `· ${row.description}: KES ${formatExact(row.recorded)} → ${formatExact(row.statement)}`).join('\n')}\n\nThis statement covers more of the same days, so its Fuliza figures are the ones to keep.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setUpdatingFuliza(true);
            let failed = 0;
            for (const row of fulizaUpdates) {
              try {
                await customFetch(`/api/joint-account/${row.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount: row.statement, date: row.date }),
                });
              } catch {
                failed += 1;
              }
            }
            await queryClient.invalidateQueries();
            setUpdatingFuliza(false);
            if (failed > 0) Alert.alert('Some were not updated', `${failed} could not be updated. Edit them on Bank.`);
          },
        },
      ],
    );
  };
  const fixOpeningBalance = async () => {
    if (!openingFix || !accountId || openingSaving) return;
    setOpeningSaving(true);
    try {
      await updateOpeningBalance({ data: { openingBalance: openingFix.to, openingBalanceDate: openingFix.date, accountId } as never });
      await queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey({ accountId }) });
    } catch (error: unknown) {
      Alert.alert('Could not set the opening balance', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setOpeningSaving(false);
    }
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
    // The entry may be hidden by a filter, or not drawn yet: show everything
    // as far as it, then go to it.
    setView('all');
    setFind('');
    const at = (lines ?? []).filter(isRecordable).findIndex((item) => item.index === firstProblemIndex);
    const drawing = at >= shownCount;
    if (drawing) setShownCount(Math.ceil((at + 1) / LINES_PER_PAGE) * LINES_PER_PAGE);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (lineTops.current[firstProblemIndex] ?? 0) - 12), animated: true }), drawing ? 400 : 80);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);

  // Teach Jamvi your M-Pesa (lib/teachJamvi): the regulars only the person can
  // name, asked once at the top of the review. Each answer files every line of
  // that payee now, and is kept where the next statement and the daily SMS
  // reading look: a payee rule, a source rule, or the account's own number.
  const [teachSkipped, setTeachSkipped] = useState<ReadonlySet<string>>(new Set());
  const [teachAnswered, setTeachAnswered] = useState(0);
  const [teachClosed, setTeachClosed] = useState(false);
  const teachGroups = useMemo(
    () => (lines && canManageBudget ? teachableGroups(lines, choices, rules, { skipped: teachSkipped }) : []),
    [lines, choices, rules, teachSkipped, canManageBudget],
  );
  const known = useMemo(() => (lines ? alreadyKnown(lines, choices, rules) : null), [lines, choices, rules]);
  const categoryNames = useMemo(() => categories.map((row) => row.name), [categories]);
  const { mutateAsync: createAccount } = useCreateJointAccount();
  const { mutateAsync: updateAccount } = useUpdateJointAccount();
  const businessAccounts = useBusinessAccounts();
  // Your family, once (lib/family): their payments are family support, never a shop.
  const familyLeaves = useMemo(() => familyCategories(categories as unknown as Array<{ id: number; name: string; parentId?: number | null }>), [categories]);
  const leafNames = useMemo(() => {
    const parents = new Set(categories.map((row) => row.parentId).filter((id): id is number => id != null));
    return categories.filter((row) => !parents.has(row.id)).map((row) => row.name);
  }, [categories]);
  const keptFamily = useMemo(() => familyNames(rules, familyLeaves.length > 0 ? familyLeaves : [FAMILY_CATEGORY]), [rules, familyLeaves]);
  const familySuggestions = useMemo(
    () => relativesBySurname((lines ?? []).filter((line) => line.direction === 'out').map((line) => line.description ?? ''), user?.lastName, keptFamily.map((one) => one.key)),
    [lines, user?.lastName, keptFamily],
  );
  // A family category the budget lacks is made first, as onboarding names it.
  const ensureCategory = async (name: string) => {
    if (categories.some((row) => row.name === name)) return;
    await createNotSureCategory({ data: { name, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } });
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
  };
  const addFamily = async (name: string, category: string) => {
    await ensureCategory(category);
    keepRules(withFamily(rules, name, category));
    setChoices((current) => fileFamilyLines(lines ?? [], current, name, category));
  };
  const teachAsCategory = (taught: TeachGroup, category: string) => {
    if (category === FAMILY_CATEGORY) void ensureCategory(category);
    setChoices((current) => teachCategory(current, taught, category));
    // A bank account paid through a paybill is remembered by its account number,
    // never by the bank's paybill, which every customer of that bank shares.
    keepRules(taught.key.startsWith('#ref:')
      ? { ...rules, [taught.key]: category }
      : withRule(rules, taught.sample.description ?? '', category, taught.sample.payeeNumber));
    setTeachAnswered((count) => count + 1);
  };
  const teachAsSource = (taught: TeachGroup, incomeSourceId: number) => {
    setChoices((current) => teachSource(current, taught, incomeSourceId));
    keepRules(withSourceRule(rules, taught.sample.description ?? '', incomeSourceId));
    setTeachAnswered((count) => count + 1);
  };
  const teachAsOwnAccount = async (taught: TeachGroup, answer: OwnAccountAnswer) => {
    // The number lives on the account itself, on the server: every phone, the
    // web and the next reinstall all know payments to it are the person's own.
    // A bank paying in names no number ("KCB 1 501901"): remembered by a rule
    // on its name instead, kept with the payee rules on the server.
    const byNumber = ownByNumber(taught);
    let targetId: number;
    if ('accountId' in answer) {
      const existing = accounts.find((account) => account.id === answer.accountId);
      if (byNumber) await updateAccount({ id: answer.accountId, data: { name: existing?.name ?? taught.label, accountNumber: taught.reference } });
      targetId = answer.accountId;
    } else {
      const created = await createAccount({ data: { name: answer.name, ...(byNumber ? { accountNumber: taught.reference } : {}) } });
      targetId = created.id;
      let businessId = answer.businessId;
      if (answer.newBusinessName) {
        const made = await businesses.create(answer.newBusinessName).catch(() => null);
        businessId = made?.id ?? null;
        if (made?.id) setAddedBusinesses((current) => [...current, { id: made.id, name: answer.newBusinessName ?? '' }]);
      }
      if (businessId !== null) {
        await businessAccounts.setBusiness(targetId, true, businessId).catch(() =>
          Alert.alert('Account added', "It could not be set as the business's yet. Open it on Bank and choose Business."));
      }
    }
    if (!byNumber) keepRules({ ...rules, [ownRuleKey(taught.key)]: String(targetId) });
    await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
    setChoices((current) => teachOwnAccount(current, taught, targetId));
    setTeachAnswered((count) => count + 1);
  };
  // Money in that is a loan, or a debt paid back: linked to them in Who owes who,
  // found by name or added (as the line's own debt sheet does).
  const teachAsDebt = async (taught: TeachGroup, kind: 'borrowed' | 'repaid') => {
    const same = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');
    const addParty = async (): Promise<number> => {
      const added = await customFetch<PartyLite>('/api/contributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: taught.label, kind: taught.kind === 'person' ? 'person' : 'institution' }),
      });
      queryClient.setQueryData<PartyLite[]>(['parties'], (current) => [...(current ?? []), added]);
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      return added.id;
    };
    const debtPartyId = parties.find((one) => same(one.name) === same(taught.label))?.id ?? (await addParty());
    setChoices((current) => {
      const next = { ...current };
      for (const index of taught.indexes) {
        if (next[index]) next[index] = { ...next[index], debt: { kind, partyId: debtPartyId }, incomeSourceId: null, sourceAuto: false, confirmed: true };
      }
      return next;
    });
    setTeachAnswered((count) => count + 1);
  };
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !effectiveChargeCategory.trim()) return 'Choose a category for the M-Pesa charges.';
    return null;
  }, [lines, choices, summary, effectiveChargeCategory]);

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
  // Lines whose optional note box is open (canAddNote); a line with a note shows it anyway.
  const [noteOpen, setNoteOpen] = useState<Set<number>>(() => new Set());
  const [debtFor, setDebtFor] = useState<{ index: number; partyId: number | null; kind: DebtKind | null } | null>(null);
  // Somebody not yet in Who owes who, added from the debt sheet itself.
  const [newParty, setNewParty] = useState<{ name: string; kind: 'person' | 'institution' } | null>(null);
  const [addingParty, setAddingParty] = useState(false);
  // A name half-typed for one line is not carried to the next one opened.
  useEffect(() => {
    if (debtFor === null) setNewParty(null);
  }, [debtFor === null]);
  const addParty = async () => {
    const name = newParty?.name.trim() ?? '';
    if (!newParty || name.length < 2 || addingParty) return;
    setAddingParty(true);
    try {
      const created = await customFetch<PartyLite>('/api/contributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind: newParty.kind }),
      });
      queryClient.setQueryData<PartyLite[]>(['parties'], (current) => [...(current ?? []), created]);
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      setDebtFor((current) => (current ? { ...current, partyId: created.id } : current));
      setNewParty(null);
    } catch (error: unknown) {
      if (!handleLapsedError(error)) Alert.alert('Could not add them', plainSaveError(error));
    } finally {
      setAddingParty(false);
    }
  };
  const setDebt = (index: number, debt: { kind: DebtKind; partyId: number } | null) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], debt } }));

  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];
  const confirmedLines = recordable.filter((item) => isConfirmedToSave(item, choices[item.index]));
  const confirmedCount = confirmedLines.length;
  const confirmedFees = confirmedLines.some((item) => (item.fee ?? 0) > 0);
  // A month at a time, for a statement that runs January to September.
  const [month, setMonth] = useState<string | null>(null);
  const months = useMemo(() => monthsOf(recordable), [lines]);
  const monthLabel = months.find((option) => option.key === month)?.label;
  const filtering = Boolean(find.trim()) || month !== null;
  const foundFor = [monthLabel ? `in ${monthLabel}` : '', find.trim() ? `for '${find.trim()}'` : ''].filter(Boolean).join(' ') || 'here';
  const inView = recordable.filter((item) => (view === 'all' || reviewStatus(item, choices[item.index]) === view) && lineMatches(item, find, choices[item.index]?.category) && inMonth(item, month));
  const toConfirm = filtering ? confirmableLines(inView, choices) : [];
  const toCategorise = filtering ? categorisableLines(inView, choices) : [];
  // Money in that was found: one income stream for all of it ("in 50,000" is salary).
  const toStream = filtering ? streamableLines(inView, choices) : [];
  // Found entries that can go to another budget together: "Umoja" finds the chama's.
  const toSend = filtering ? sendableLines(inView, choices) : [];
  // Everything still on Jamvi's suggestion (or needing a choice) under Not sure,
  // so a long statement can be saved now and sorted out slowly from Home.
  const toNotSure = notSureableLines(filtering ? inView : recordable, choices);
  const allUnderNotSure = () => {
    Alert.alert(
      `Put ${toNotSure.length} ${toNotSure.length === 1 ? 'entry' : 'entries'} under Not sure?`,
      `Every entry ${filtering ? `found ${foundFor}` : 'in this statement'} that is still Jamvi's suggestion or still needs you, including any not shown yet. Money out goes to Not sure yet and money in to no income source; anything you chose yourself stays as it is. They count as confirmed, so Save takes them all, and Home's "to sort out" brings each one back to you.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Put them under Not sure', onPress: () => setChoices((current) => putUnderNotSure(toNotSure, current)) },
      ],
    );
  };
  const [sendFound, setSendFound] = useState<{ groupId: number | null; accountId: number; category: string; incomeSourceId: number | null } | null>(null);
  const sendFoundTo = (groupName: string, accountName: string) => {
    if (!sendFound || sendFound.groupId === null) return;
    const target = { groupId: sendFound.groupId, groupName, accountId: sendFound.accountId, accountName, category: sendFound.category, incomeSourceId: sendFound.incomeSourceId };
    Alert.alert(
      `Send ${toSend.length} ${toSend.length === 1 ? 'entry' : 'entries'} to ${groupName}?`,
      `Every entry found for ${foundFor}, including any not shown yet below, is recorded in ${groupName}'s ${accountName} instead of here. They count as confirmed, and Jamvi remembers these payees go there unless you untick it. Nothing is saved until you tap Save.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: `Send to ${groupName}`, onPress: () => { setChoices((current) => sendLinesToOtherBudget(toSend, current, target)); setSendFound(null); } },
      ],
    );
  };
  // A payee remembered as another budget's is suggested there, waiting to be
  // confirmed. Only lines still on Jamvi's suggestion; returns the same choices
  // when nothing changes, so this settles at once.
  const managedIds = useMemo(() => otherManagedBudgets.map((option) => option.id), [otherManagedBudgets]);
  useEffect(() => {
    if (!lines || Object.keys(otherRules).length === 0) return;
    setChoices((current) => applyOtherBudgetRules(lines, current, otherRules, managedIds));
    // Read what each remembered budget offers, so its account and category show on the line.
    for (const groupId of new Set(lines.map((item) => otherBudgetRuleFor(item, otherRules)?.rule.groupId).filter((id): id is number => id != null && managedIds.includes(id)))) {
      if (!otherBudgetOptions[groupId]) void fetchOtherBudgetOptions(groupId).then((options) => setOtherBudgetOptions((current) => ({ ...current, [groupId]: options }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, otherRules, managedIds.join(',')]);
  const [streamPickerOpen, setStreamPickerOpen] = useState(false);
  const streamFound = (source: { id: number; name: string }) => {
    setStreamPickerOpen(false);
    Alert.alert(
      `Put ${toStream.length} ${toStream.length === 1 ? 'entry' : 'entries'} under ${source.name}?`,
      `Every entry of money in found for ${foundFor}, including any not shown yet below. They count as confirmed, and nothing is saved until you tap Save.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: `Put under ${source.name}`, onPress: () => setChoices((current) => streamLines(toStream, current, source.id)) },
      ],
    );
  };
  const confirmFound = () => {
    Alert.alert(
      `Confirm ${toConfirm.length} ${toConfirm.length === 1 ? 'entry' : 'entries'}?`,
      `Every suggestion found for ${foundFor}, including any not shown yet below, is kept as Jamvi suggested. Nothing is saved until you tap Save.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Confirm them', onPress: () => setChoices((current) => confirmLines(toConfirm, current)) },
      ],
    );
  };
  // A new statement, or another view of it, starts again from the first page.
  // A new statement starts again from the first page. Changing the view or
  // the search does too - in their handlers, not here, so that going to a
  // problem can draw further after switching to All.
  useEffect(() => {
    setShownCount(LINES_PER_PAGE);
    setShownSkipped(LINES_PER_PAGE);
  }, [lines?.length]);

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
              const result = { updated: 0, skipped: [] as string[] };
              for (let start = 0; start < pendingChanges.length; start += RECEIPT_BATCH) {
                const part = await customFetch<{ updated: number; skipped: string[] }>('/api/mpesa/import/recategorise', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ changes: pendingChanges.slice(start, start + RECEIPT_BATCH) }),
                });
                result.updated += part.updated;
                result.skipped.push(...part.skipped);
              }
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

  // The calls that record things, handed to the one function that saves a line.
  const rawPostingApi: PostingApi = {
    deposit: (data) => createDeposit({ data: data as never }) as Promise<{ id: number }>,
    disbursement: (data) => createDisbursement({ data: data as never }) as Promise<{ id: number }>,
    bankToBank: (data) => transferBankToBank({ data: data as never }) as Promise<{ outgoing: { id: number }; incoming: { id: number } }>,
    toSavings: (data) => transferBankToSavings({ data: data as never }) as Promise<{ id: number }>,
    fromSavings: (data) => transferSavingsToBank({ data: data as never }) as Promise<{ id: number }>,
    // Named explicitly, on the plain client rather than a mutation hook: this never belongs to
    // the current budget's own cache, and its own membership check is verified again server side.
    otherBudget: async (groupId, direction, data) => {
      const options = { headers: { 'x-jamvi-workspace': String(groupId) } };
      return direction === 'in'
        ? createDepositInOtherBudget(data as never, options)
        : createDisbursementInOtherBudget(data as never, options);
    },
  };
  // Each request tried again through a server restart or a cut - the M-Pesa
  // charge as much as the entry it came with (lib/saveRetry).
  const postingApi: PostingApi = withRetries(rawPostingApi, (task) => retryWhenCutOff(task));

  // Throwing a statement away loses days of choices, so it is asked first -
  // from the top of the screen or the bottom. What is already saved stays.
  // Asked first, like Start over, so a stray tap does not leave the entries.
  const confirmReadAgain = () => {
    Alert.alert(
      'Read this statement again?',
      'Choose the same statement PDF and type its password. Everything you have confirmed or changed is kept, and nothing is saved or removed. You can go back to your entries until it is read.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Read it again', onPress: () => setRereading(true) },
      ],
    );
  };

  const confirmStartOver = () => {
    const worked = confirmedCount;
    Alert.alert(
      'Start over with this statement?',
      `${worked > 0 ? `The ${worked} ${worked === 1 ? 'entry' : 'entries'} you have confirmed or changed but not saved will be lost. ` : ''}Anything already saved stays in your budget. Then read a statement from the beginning.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Start over', style: 'destructive', onPress: startOver },
      ],
    );
  };

  /** Which business a line is for, or null for Personal (lib/importBusiness). */
  const businessFor = (item: PreviewLine): number | null => businessOfLine(item, choices[item.index], owners, businessIds);
  const chooseLineBusiness = (index: number, businessId: number | null) =>
    setChoices((current) => chooseBusiness(lines ?? [], current, index, businessId, owners, businessIds));
  /** A cost added for the line's business, linked to it as Bank's are, then used on the line. */
  const addLineCost = async (index: number, name: string) => {
    const businessId = businessOfLine(lines?.find((line) => line.index === index) ?? { direction: 'out' }, choices[index], owners, businessIds);
    if (businessId === null) return;
    try {
      await customFetch('/api/budget-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budgetAmount: 0, priority: 3, parentId: null, reducesIncomeSourceId: businessId, costKind: 'cogs', isRecurring: true, activeMonth: null, activeYear: null }),
      });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      setChoices((current) => chooseNewCost(lines ?? [], { ...current, [index]: { ...current[index], businessId } }, index, name));
    } catch (error) {
      Alert.alert('Could not add that cost', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const addLineBusiness = async (index: number, name: string) => {
    try {
      // A business, named as one (My businesses), not just another income stream.
      const created = await businesses.create(name);
      if (!created) return;
      setAddedBusinesses((current) => [...current.filter((one) => one.id !== created.id), { id: created.id, name: created.name }]);
      const ids = new Set([...businessIds, created.id]);
      setChoices((current) => chooseBusiness(lines ?? [], current, index, created.id, owners, ids));
    } catch (error) {
      Alert.alert('Could not add that business', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const saveAll = () => {
    if (!lines || saving) return;
    // Said, never silent: a new person's Save did nothing at all, because their
    // budget had no account to save into (5 Oct 2026).
    if (!accountId) {
      Alert.alert('No account to save into', 'This budget has no account for M-Pesa yet. Close this screen and open it again - Jamvi adds one - or add an account on the Bank tab.');
      return;
    }
    const running = getImportProgress();
    if (running?.stage === 'saving') {
      // Stopped, not slow: let the rest be saved now. What the stopped save did
      // reach the server is refused as already recorded, so nothing doubles.
      if (importSaveStalled()) {
        Alert.alert(
          'Your earlier save stopped',
          `It stopped at ${running.done} of ${running.total}. Save the rest now? Anything it already saved is recognised and skipped.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Save the rest now', onPress: () => { setImportProgress(null); setTimeout(() => saveAll(), 0); } },
          ],
        );
        return;
      }
      Alert.alert('Still saving', `Your earlier save is still going: ${running.done} of ${running.total} done. It carries on in the background, and this list updates when it finishes.`);
      return;
    }
    if (!statementReading) {
      if (firstProblem) {
        Alert.alert('Not quite ready', firstProblem);
        return;
      }
      void saveLines();
      return;
    }
    // A statement is worked through over days: only what has been confirmed
    // goes, and only after saying so - one stray tap must not save it all.
    if (confirmedCount === 0) {
      Alert.alert('Nothing confirmed yet', 'Tick Confirm on the entries you have checked, or change them, and they are saved. The rest stay here for later.');
      return;
    }
    if (confirmedFees && !effectiveChargeCategory.trim()) {
      Alert.alert('Not quite ready', 'Choose a category for the M-Pesa charges.');
      return;
    }
    const left = recordable.length - confirmedCount;
    Alert.alert(
      `Save ${confirmedCount} ${confirmedCount === 1 ? 'entry' : 'entries'}?`,
      `Only the ${confirmedCount === 1 ? 'entry' : 'entries'} you have confirmed or changed.${left > 0 ? ` The other ${left} stay here for later.` : ''}`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Save', onPress: () => void saveLines() },
      ],
    );
  };

  // Finishes a save that was cut short, once the entries and the account are back.
  useEffect(() => {
    if (!resumeSave || !lines || !accountId || saving) return;
    setResumeSave(false);
    if (resumeJob) {
      setResumeJob(null);
      void saveLines(resumeJob);
      return;
    }
    // Cut short after the last entry went: nothing is left, so only the note goes.
    if (!lines.some((item) => isConfirmedToSave(item, choices[item.index]))) {
      void clearSavePending(group?.id);
      setStatementNote(null);
      return;
    }
    void saveLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSave, lines, accountId, saving]);

  // "Fix all": once the lines are under Not sure yet, saved without another
  // tap. Something that still needs a choice (the charges' category, say) stops
  // it and says so, and the list stays here to finish by hand.
  useEffect(() => {
    if (!autoSaveNotSure || !lines || !accountId || saving) return;
    setAutoSaveNotSure(false);
    if (firstProblem) {
      Alert.alert('Almost there', `${firstProblem} Then tap Save.`);
      return;
    }
    void saveLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveNotSure, lines, accountId, saving, choices]);

  // `resumeJob`: a save already running on the server, from before Jamvi was
  // closed, followed to its end instead of being started again.
  const saveLines = async (resumeJob?: number) => {
    if (!lines || !accountId || saving) return;
    const onlyConfirmed = statementReading !== null;
    setSaving(true);
    void keepScreenAwakeWhileSaving();
    // Remembered until it finishes: closed part way, it is carried on next time.
    const savingFor = group?.id;
    if (!resumeJob) void markSavePending(savingFor);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
    const savedIndexes = new Set<number>();
    // What each saved line became, for marking money in left on "Not sure".
    const depositIds = new Map<number, number>();
    // And what each line sent to another budget became there.
    const otherBudgetMade = new Map<number, { groupId: number; id: number }>();
    // Who each debt entry was for, kept so deleting it can offer to put that person's balance back.
    const debtLinks: DebtEntryLink[] = [];
    // M-Pesa's own name for each entry saved under a nickname, for Search.
    const mpesaNames: MpesaName[] = [];
    // A loan still owed, or repaid - Fuliza, M-Shwari, KCB M-PESA, Hustler Fund - is a
    // debt to that lender in Who owes who: found there, or added once, and its lines linked to it.
    let saveChoices = choices;
    let saveParties = parties;
    // Payees Jamvi knows filed under a common category the budget has not got yet -
    // Food > Eating out, Utilities > Electricity - have it made first, or found
    // under the name the person gave it, and are saved under that (lib/commonCategories).
    if (!resumeJob) {
      const names = new Set(categories.map((row) => row.name));
      const needed = new Map<number, StandardTarget>();
      for (const line of lines) {
        const choice = saveChoices[line.index];
        if (line.direction !== 'out' || !choice?.include || !choice.category || names.has(choice.category)) continue;
        const target = standardTargetFor(line.description ?? '');
        if (target && target.name === choice.category) needed.set(line.index, target);
      }
      if (needed.size > 0) {
        const made = await ensureCommonCategories([...needed.values()]);
        const next = { ...saveChoices };
        for (const [index, target] of needed) {
          next[index] = { ...next[index], category: made.get(target.key) ?? NOT_SURE_CATEGORY };
        }
        saveChoices = next;
        setChoices(saveChoices);
        void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      }
    }
    if (!resumeJob) {
      const partyIds: Partial<Record<LenderId, number>> = {};
      for (const lender of lendersNeeded(lines, choices)) {
        try {
          const found = findLenderParty(lender, saveParties);
          const party: PartyLite = found ?? await customFetch<PartyLite>('/api/contributors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: lender.name, kind: 'institution' }),
            });
          if (!found) saveParties = [...saveParties, party];
          partyIds[lender.id] = party.id;
        } catch {
          // Saved unlinked: the borrowing still is not income; a repayment says why it failed.
        }
      }
      if (Object.keys(partyIds).length > 0) {
        saveChoices = withLenderDebts(lines, choices, partyIds);
        setChoices(saveChoices);
      }
    }
    // Money into or out of M-Shwari, KCB M-PESA, Ziidi or Mali moves between M-Pesa and that
    // account in Savings: found there, or made once with no target, and its lines linked to it (lib/mpesaProducts).
    if (!resumeJob) {
      const goalIds: Partial<Record<SavingsAccountId, number>> = {};
      let madeOne = false;
      for (const account of savingsNeeded(lines, saveChoices)) {
        try {
          const found = findSavingsGoal(account, savingsGoals);
          const goal = found ?? await customFetch<{ id: number; name: string }>('/api/savings-goals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: account.name, targetAmount: 0 }),
            });
          if (!found) madeOne = true;
          goalIds[account.id] = goal.id;
        } catch {
          // Left unlinked: it fails with a reason of its own, to be sorted by hand.
        }
      }
      if (Object.keys(goalIds).length > 0) {
        saveChoices = withSavingsAccounts(lines, saveChoices, goalIds);
        setChoices(saveChoices);
      }
      if (madeOne) void queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
    }
    // "Not sure yet" is a real category, made the first time it is needed, so
    // the entry still counts as spending (lib/entriesToSort).
    if (!resumeJob && needsNotSureCategory(lines, choices, categories.map((row) => row.name))) {
      try {
        await createNotSureCategory({ data: { name: NOT_SURE_CATEGORY, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } });
        void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      } catch {
        // Already there, or it fails each entry with a reason of its own.
      }
    }
    // Airtime, Data bundles and Home Fibre are built-in ledgers under M-Pesa, made by the
    // server whenever categories are listed; one still missing is made here (lib/mpesaProducts).
    for (const ledger of resumeJob ? [] : ledgersToMake(lines, saveChoices, categories.map((row) => row.name))) {
      try {
        await createNotSureCategory({ data: { name: ledger, budgetAmount: 0, priority: 4, isRecurring: true, activeMonth: null, activeYear: null } });
        void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      } catch {
        // Already there, or it fails each entry with a reason of its own.
      }
    }
    // Worked out once, so a handful of these can travel to the server together instead of
    // waiting for each round trip before starting the next.
    const toSave = lines.flatMap((item) => {
      const choice = saveChoices[item.index];
      if (!choice?.include || !isRecordable(item)) return [];
      if (onlyConfirmed && !isConfirmedToSave(item, choice)) return [];
      const built = buildPostings(item, choice, {
        accountId,
        userId: user?.id,
        isShared,
        today: todayIso(),
        chargeCategory: effectiveChargeCategory,
        incomeSources,
        memberIds,
      });
      return built ? [{ item, choice, built }] : [];
    });
    setSaveProgress({ done: 0, total: toSave.length });
    // The same count for the bar the rest of the app shows, so the person can
    // leave this screen while it saves and still see how it went.
    let doneCount = 0;
    // Set by the first refusal for a lapsed trial or subscription: the rest
    // would be refused the same way, so they are not sent.
    let lapsed = false;
    setImportProgress({ stage: 'saving', done: 0, total: toSave.length });
    // What one line became, the same whether the server or this phone saved it.
    const onSaved = (item: PreviewLine, choice: Choice | undefined, posted: Omit<Posted, 'feeFailed'> & { feeFailed?: boolean }) => {
      if (choice?.debt && posted.id) debtLinks.push({ transactionId: posted.id, partyId: choice.debt.partyId, kind: choice.debt.kind });
      const named = mpesaNameFor(posted.id, item.original, item.description);
      if (named) mpesaNames.push(named);
      if (posted.feeFailed) result.failed.push({ what: `${item.description} charge`, why: `The entry saved, but its M-Pesa charge${item.fee ? ` of KES ${item.fee}` : ''} did not. Add it on the Bank tab as money out.` });
      result.saved += 1;
      savedIndexes.add(item.index);
      if (posted.id !== undefined && item.direction === 'in') depositIds.set(item.index, posted.id);
      if (posted.otherBudget) otherBudgetMade.set(item.index, posted.otherBudget);
    };
    const onRepeat = (item: PreviewLine) => {
      result.repeats += 1;
      // Already on the server: shown as recorded, not left looking unsaved.
      savedIndexes.add(item.index);
    };
    const onFailed = (item: PreviewLine, why: string) => result.failed.push({ what: item.description ?? 'A message', why });
    const showProgress = (done: number, total: number) => {
      doneCount = done;
      setSaveProgress({ done, total });
      setImportProgress({ stage: 'saving', done, total });
    };
    // Set when this phone could not hear how the server's save ended: it is still pending.
    let lostTouch = false;
    try {
      // The whole list handed to the server, which saves it whether or not Jamvi
      // stays open (lib/serverSave). This phone only asks how far it has got.
      let job: ServerJob | null = null;
      let serverFailed: unknown = null;
      try {
        job = resumeJob
          ? { id: resumeJob, status: 'running', total: toSave.length, done: 0 }
          : await startServerSave(toSave.map(({ item, choice, built }) => ({ key: item.index, built, ...(choice.debt ? { debt: { partyId: choice.debt.partyId, kind: choice.debt.kind } } : {}) })), accountId);
      } catch (error: unknown) {
        serverFailed = error;
      }
      if (job) {
        void markSavePending(savingFor, job.id);
        let finished: ServerJob | null = null;
        try {
          finished = await followServerSave(job.id, showProgress);
        } catch {
          // The save goes on on the server; this phone just could not ask. Kept
          // pending, so opening the import again shows how it ended.
          lostTouch = true;
        }
        const byIndex = new Map(lines.map((item) => [item.index, item]));
        for (const done of finished?.results ?? []) {
          const item = byIndex.get(done.key);
          if (!item) continue;
          if (done.outcome === 'saved') onSaved(item, saveChoices[item.index], { id: done.id, otherBudget: done.otherBudget, feeFailed: done.feeFailed });
          else if (done.outcome === 'repeat') onRepeat(item);
          else if (done.outcome === 'lapsed') lapsed = true;
          else onFailed(item, done.why);
        }
        if (lostTouch) result.failed.push({ what: 'Still saving', why: 'Your entries are still being saved on Jamvi\'s server, but this phone lost touch with it. Open the M-Pesa import again later to see how it went.' });
        else if (!finished) result.failed.push({ what: 'This save', why: 'Jamvi could not find how it went. Open Bank to see what was saved, or save again - anything saved already is skipped.' });
      } else if (serverFailed) {
        if (isLapsedRefusal(serverFailed)) lapsed = true;
        else if (serverFailed instanceof EarlierSaveRunning) result.failed.push({ what: 'Not saved yet', why: serverFailed.message });
        else result.failed.push({ what: `${toSave.length} ${toSave.length === 1 ? 'entry' : 'entries'}`, why: plainSaveError(serverFailed) });
      } else if (!resumeJob) {
        // A server that cannot save them itself yet: sent from this phone, as before.
        await runPool(toSave, SAVE_CONCURRENCY, async ({ item, choice, built }) => {
          if (lapsed) return;
          try {
            // Waits while Jamvi is behind another app, and tries again an entry whose
            // request the phone cut off (lib/saveWhileAway).
            onSaved(item, choice, await savePosting(built, postingApi, accountId));
          } catch (error: unknown) {
            if (isLapsedRefusal(error)) {
              lapsed = true;
              return;
            }
            const message = plainSaveError(error);
            if (/already recorded/i.test(message)) onRepeat(item);
            else onFailed(item, message);
          } finally {
            showProgress(doneCount + 1, toSave.length);
          }
        });
      }
    } finally {
      setSaveProgress(null);
      setSaving(false);
      letScreenSleepAgain();
      // Before the bar says it is done, so this screen opened again does not take it up a second time.
      if (!lostTouch) await clearSavePending(savingFor);
      // New messages taken in and saved: the next check starts after them.
      if (smsNewestRef.current !== null && result.saved + result.repeats > 0) {
        await keepSmsAuto({ on: true, since: smsNewestRef.current });
        smsNewestRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });
      }
      if (lapsed) result.lapsed = { waiting: toSave.length - result.saved - result.repeats };
      let leftToSave = 0;
      if (statementReading) {
        const stamp = { date: todayIso(), description: 'Saved from your statement' };
        const marked = lines.map((item) => (savedIndexes.has(item.index) ? { ...item, alreadyRecorded: stamp } : item));
        setLines(marked);
        setStatementReading((current) => (current ? { ...current, lines: marked } : current));
        leftToSave = marked.filter(isRecordable).length;
      }
      // Part of a statement saved: stay on it, with how it went at the top.
      if (leftToSave > 0) {
        setLastSave(result);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        setOutcome(result);
      }
      setImportProgress({ stage: 'done', saved: result.saved, repeats: result.repeats, failed: result.failed.length });
      if (result.saved > 0) void rememberMpesaCard('done', group?.id);
      // A reversal just saved is matched to the payment it undid when only one
      // could be it, so it never counts as income. Quietly: the rest are left
      // for Bank's "Match them", and a failure here costs nothing.
      if (result.saved > 0 && canManageBudget && lines.some((line) => line.type === 'reversal' && savedIndexes.has(line.index))) {
        void autoLinkReversals()
          .then(() => queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }))
          .catch(() => {});
      }
    }
    {
      let kept = rules;
      let keptOther = otherRules;
      for (const item of lines) {
        const choice = choices[item.index];
        if (!savedIndexes.has(item.index) || !choice?.remember) continue;
        if (choice.otherBudget) {
          // This payee belongs to that budget: remembered there, not as a category here.
          keptOther = withOtherBudgetRule(keptOther, item, choice.otherBudget);
          continue;
        }
        // Kept here this time: a budget remembered for it before no longer applies.
        keptOther = withoutOtherBudgetRule(keptOther, item);
        if (choice.category.trim() && item.description && !isNotSure(choice.category)) {
          kept = withRule(kept, item.description, choice.category, item.payeeNumber);
        }
      }
      // A business's payees, as Bank keeps them (lib/importBusiness): money in from
      // the payer is that business's sales next time; a payment becomes a named
      // account filed under the business's cost.
      let named = namedPayees.named;
      for (const payee of businessPayees(lines, choices, savedIndexes, owners, businessIds)) {
        if (payee.direction === 'in') {
          kept = withSourceRule(kept, payee.description, payee.business);
          continue;
        }
        const label = payeeName(payee.description) || payee.description;
        const key = namedKeyFor(referenceOf(payee.description) || label);
        named = withNamed(named, { key, name: payee.name || namedPayees.nameFor(payee.description) || label, category: payee.category, incomeSourceId: payee.business });
        for (const ruleKey of ruleKeysFor(key)) kept = { ...kept, [ruleKey]: payee.category };
      }
      if (named !== namedPayees.named) void namedPayees.replaceAll(named);
      if (kept !== rules) keepRules(kept);
      if (keptOther !== otherRules) keepOtherRules(keptOther);
    }
    void saveDebtLinks(debtLinks);
    // Money in left on "Not sure" is kept to sort out later; Home says so.
    {
      const toMark = toMarkAfterSave(lines, choices, depositIds);
      if (toMark.length > 0) {
        void customFetch('/api/entries-to-sort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionIds: toMark }),
        }).then(() => queryClient.invalidateQueries({ queryKey: ['entries-to-sort'] })).catch(() => {});
      }
      void queryClient.invalidateQueries({ queryKey: ['entries-to-sort'] });
      // Sent to another budget on "Not sure": kept to sort out there, on its own Home.
      for (const [groupId, ids] of otherBudgetToMark(lines, choices, otherBudgetMade)) {
        void customFetch('/api/entries-to-sort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-jamvi-workspace': String(groupId) },
          body: JSON.stringify({ transactionIds: ids }),
        }).catch(() => {});
      }
    }
    void saveMpesaNames(mpesaNames);
    offerBalanceChanges(lines.filter((item) => savedIndexes.has(item.index)), saveChoices, saveParties);
  };

  /**
   * Once, at the end, for everything that was saved. Asked and never applied by
   * itself: the entries can be edited or deleted afterwards, and a balance moved
   * behind somebody's back would be left quietly wrong.
   */
  const offerBalanceChanges = (saved: PreviewLine[], savedChoices = choices, knownParties = parties) => {
    const changes = balanceChanges(saved, savedChoices, knownParties, debtCategories);
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
        {outcome.lapsed ? lapsedCard(outcome.lapsed.waiting) : null}
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
        {firstStatementRef.current && statementReading && statementLeft === 0 && outcome.saved > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary, gap: 8 }]} testID="mpesa-keep-up">
            <Text style={[styles.summaryLine, { color: colors.foreground }]}>From here, Jamvi keeps up</Text>
            {smsReadable ? (
              smsAuto.on ? (
                <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID="mpesa-keep-up-on">
                  Each time you open Jamvi it reads M-Pesa's new messages and shows them on Home for you to save. Nothing is saved without you.
                </Text>
              ) : (
                <>
                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>
                    Let Jamvi read M-Pesa's new messages each time you open it - only M-Pesa's, only new ones after your statement. Nothing is saved without you.
                  </Text>
                  <Pressable
                    onPress={() => void (async () => {
                      const asked = await askToReadSms();
                      if (!asked.ok) {
                        if (asked.reason !== 'unavailable') Alert.alert('Not turned on', smsRefusal(asked.reason));
                        return;
                      }
                      await keepSmsAuto({ on: true, since: keepUpSince(statementReading?.lastDate) });
                      void queryClient.invalidateQueries({ queryKey: ['new-mpesa-sms'] });
                    })()}
                    style={[styles.primary, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                    testID="mpesa-keep-up-turn-on"
                  >
                    <Text style={styles.primaryText}>Read new M-Pesa messages for me</Text>
                  </Pressable>
                </>
              )
            ) : (
              <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID="mpesa-keep-up-share">
                When M-Pesa texts you, select the messages in your Messages app, tap Share and choose Jamvi - they arrive here already read. Or copy and paste them on this screen.
              </Text>
            )}
          </View>
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

  // Step 3 of the first time, and one way in among the others after it.
  const statementCard = (
    <>
            {canReadStatements ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-statement">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>{firstRun ? 'Your statement' : 'Or use your M-Pesa statement'}</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Choose the statement PDF and type its password. Jamvi reads it here on your phone. The file and the password are not uploaded or saved.
                </Text>
                <Pressable
                  onPress={pickStatement}
                  style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                  accessibilityRole="button"
                  testID="mpesa-statement-choose"
                >
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                    {statementFile ? shownFileName(statementFile.name) : 'Choose the statement PDF'}
                  </Text>
                </Pressable>
                <View style={{ justifyContent: 'center' }}>
                  <TextInput
                    value={statementPassword}
                    onChangeText={setStatementPassword}
                    secureTextEntry={!showStatementPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Statement password"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.pasteBox, { minHeight: 48, paddingRight: 48, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                    testID="mpesa-statement-password"
                  />
                  <Pressable
                    onPress={() => setShowStatementPassword((shown) => !shown)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showStatementPassword ? 'Hide the password' : 'Show the password'}
                    testID="mpesa-statement-password-toggle"
                    style={{ position: 'absolute', right: 14 }}
                  >
                    <Feather name={showStatementPassword ? 'eye-off' : 'eye'} size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={readStatement}
                  disabled={!statementFile || reading}
                  style={[styles.primary, { backgroundColor: colors.primary, opacity: !statementFile || reading ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  testID="mpesa-statement-read"
                >
                  {reading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Read my statement</Text>}
                </Pressable>
                {readProgress ? (
                  <View style={{ gap: 6 }} testID="mpesa-read-progress" accessibilityLiveRegion="polite">
                    <Text style={[styles.hint, { color: colors.foreground }]}>
                      {readProgress.stage === 'opening'
                        ? 'Opening your statement…'
                        : readProgress.stage === 'reading'
                          ? `Reading page ${readProgress.page} of ${readProgress.of}…`
                          : 'Checking which of these are already recorded…'}
                      {` ${readPercent(readProgress)}%`}
                    </Text>
                    <ProgressBar fraction={readPercent(readProgress) / 100} color={colors.primary} track={colors.muted} />
                  </View>
                ) : null}
              </View>
            ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.primary }]}>M-PESA · BRING IT IN</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Import M-Pesa</Text>
          <ScreenHint>Read your M-Pesa statement, or paste messages, into entries - without typing.</ScreenHint>
        </View>
      </View>

      <PageScrollView scroller={{ top: 8, bottom: insets.bottom + 120 }} ref={scrollRef} style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
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
        {unfinished ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.destructive }]} testID="mpesa-unfinished">
            <Text style={[styles.lineTitle, { color: colors.foreground }]}>Jamvi closed during your last import</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {`It stopped while ${unfinished.step}, on ${new Date(unfinished.at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} at ${new Date(unfinished.at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}. Read the statement again: everything already saved is recognised and skipped.`}
            </Text>
            <Pressable onPress={() => { setUnfinished(null); clearImportStep(); }} hitSlop={8} accessibilityRole="button" testID="mpesa-unfinished-dismiss">
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', marginTop: 6 }}>OK</Text>
            </Pressable>
          </View>
        ) : null}
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
        {!lines || rereading ? (
          <>
            {rereading ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]} testID="mpesa-rereading">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>
                  Choose the same statement PDF and read it again. Everything you have confirmed or changed is kept.
                </Text>
                <Pressable onPress={() => setRereading(false)} accessibilityRole="button" testID="mpesa-rereading-back">
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Back to my entries</Text>
                </Pressable>
              </View>
            ) : null}
            {firstRun ? (
              <>
                <MpesaFirstStart from={startFrom} onFrom={setStartFrom} keepsUp={smsReadable} />
                {statementCard}
                <Pressable onPress={() => setOtherWays((open) => !open)} accessibilityRole="button" hitSlop={8} testID="mpesa-other-ways"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 }}>
                  <Feather name={otherWays ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>{otherWays ? 'Hide other ways' : 'No statement? Other ways to bring in M-Pesa'}</Text>
                </Pressable>
              </>
            ) : null}
            {firstRun && !otherWays ? null : (<>
            {/* The easiest way in, so it leads when this phone can do it. */}
            {smsReadable ? (
              <View style={[styles.card, styles.leadCard, { backgroundColor: colors.card, borderColor: colors.foreground }]} testID="mpesa-sms">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>Read my M-Pesa messages</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Only M-Pesa's messages, only for the period you choose, only when you ask. They are read into the list below and not kept.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} testID="mpesa-sms-periods">
                  {SMS_PERIODS.map((option) => {
                    const on = smsPeriod === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => chooseSmsPeriod(option.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`mpesa-sms-period-${option.key}`}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {smsPeriod === 'month' ? (
                  <MonthStepper from={smsFrom} to={smsTo} onChange={(nextFrom, nextTo) => { setSmsFrom(nextFrom); setSmsTo(nextTo); }} testID="mpesa-sms-month" />
                ) : smsPeriod === 'dates' ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['from', 'to'] as const).map((which) => (
                        <Pressable
                          key={which}
                          onPress={() => setSmsPicker(which)}
                          accessibilityRole="button"
                          accessibilityLabel={`${which === 'from' ? 'From' : 'To'} ${longDay(which === 'from' ? smsFrom : smsTo)}. Change`}
                          testID={`mpesa-sms-date-${which}`}
                          style={[styles.categoryButton, { flex: 1, borderColor: colors.border, backgroundColor: colors.muted }]}
                        >
                          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{which === 'from' ? 'From' : 'To'}</Text>
                          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{longDay(which === 'from' ? smsFrom : smsTo)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {smsPicker ? (
                      <DateTimePicker
                        value={new Date(`${smsPicker === 'from' ? smsFrom : smsTo}T00:00:00`)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                        maximumDate={new Date()}
                        onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                          const which = smsPicker;
                          setSmsPicker(Platform.OS === 'ios' ? which : null);
                          if (selected && which) {
                            if (which === 'from') setSmsFrom(isoDay(selected));
                            else setSmsTo(isoDay(selected));
                          }
                        }}
                      />
                    ) : null}
                  </View>
                ) : (
                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID="mpesa-sms-period-range">
                    {longDay(smsFrom)} to {longDay(smsTo)}
                  </Text>
                )}
                <Pressable
                  onPress={() => void readSmsRange()}
                  disabled={reading}
                  style={[styles.primary, { backgroundColor: colors.primary, opacity: reading ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  testID="mpesa-sms-read"
                >
                  {reading && !readerJob ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Read M-Pesa messages for this period</Text>}
                </Pressable>
                {smsAuto.since > 0 ? (
                  <Pressable
                    onPress={() => keepSmsAuto({ ...smsAuto, on: !smsAuto.on })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: smsAuto.on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                    testID="mpesa-sms-auto"
                  >
                    <Feather name={smsAuto.on ? 'check-square' : 'square'} size={18} color={smsAuto.on ? colors.primary : colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontSize: 13, flexShrink: 1 }}>Look for new M-Pesa messages each time I open Jamvi</Text>
                  </Pressable>
                ) : null}
                {smsNotifiable ? (
                  <Pressable
                    onPress={() => void toggleSmsNotify()}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: smsNotify }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                    testID="mpesa-sms-notify"
                  >
                    <Feather name={smsNotify ? 'check-square' : 'square'} size={18} color={smsNotify ? colors.primary : colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontSize: 13, flexShrink: 1 }}>Tell me when an M-Pesa message arrives, even when Jamvi is closed</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {smsReadable ? (
              <Text style={[styles.orLine, { color: colors.mutedForeground }]}>Or paste your messages</Text>
            ) : null}
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

            </>)}
            {firstRun ? null : statementCard}
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
                setChoices(startChoices(lines, initialChoices(lines, [], categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget)));
              }}
              testIDPrefix="mpesa-import-account"
            />

            {!canManageBudget ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.destructive }]} testID="mpesa-member-warning">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>
                  You are a member of this group, so you can record money that came in, but not payments out, moves between accounts or savings. Those are left unticked. A group owner or admin can record them.
                </Text>
              </View>
            ) : null}
            {statementNote ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-statement-note">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>{statementNote}</Text>
              </View>
            ) : null}
            {lastSave?.lapsed ? lapsedCard(confirmedCount) : null}
            {lastSave && !(lastSave.lapsed && lastSave.saved === 0 && lastSave.failed.length === 0) ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: lastSave.failed.length > 0 ? colors.destructive : colors.success }]} testID="mpesa-last-save">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name={lastSave.failed.length > 0 ? 'alert-circle' : 'check-circle'} size={18} color={lastSave.failed.length > 0 ? colors.destructive : colors.success} />
                  <Text style={[styles.lineTitle, { color: colors.foreground, flex: 1 }]}>
                    Saved {lastSave.saved}{lastSave.repeats > 0 ? ` · ${lastSave.repeats} already recorded` : ''}{lastSave.failed.length > 0 ? ` · ${lastSave.failed.length} not saved` : ''}
                  </Text>
                  <Pressable onPress={() => setLastSave(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" testID="mpesa-last-save-dismiss">
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                {lastSave.failed.slice(0, 10).map((failure, index) => (
                  <Text key={`${failure.what}-${index}`} style={[styles.hint, { color: colors.destructive, marginTop: 2 }]}>
                    {failure.what}: {failure.why}
                  </Text>
                ))}
                {lastSave.failed.length > 10 ? (
                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>and {lastSave.failed.length - 10} more. Save again to try them.</Text>
                ) : null}
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>The rest of your statement is below, as you left it.</Text>
              </View>
            ) : null}
            {waitingForSave && liveProgress?.stage === 'saving' ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="mpesa-save-still-running">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>
                  Your save is still going: {liveProgress.done} of {liveProgress.total}. It carries on while you move around Jamvi, and this list updates when it finishes.
                </Text>
              </View>
            ) : null}
            {statementReading ? (
              <Pressable onPress={confirmStartOver} accessibilityRole="button" style={{ alignSelf: 'flex-start' }} hitSlop={8} testID="mpesa-statement-start-over">
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold' }}>Start over with this statement</Text>
              </Pressable>
            ) : null}

            {statementReading && !balanceCheck ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]} testID="mpesa-balance-missing">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>
                  Jamvi could not work out this statement's starting and closing balance, so it cannot check them or set this account's starting balance. Reading it again with the latest Jamvi fixes that, and keeps your choices.
                </Text>
                <Pressable onPress={confirmReadAgain} accessibilityRole="button" testID="mpesa-balance-missing-read-again">
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Read my statement again</Text>
                </Pressable>
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
                {fuliza && fulizaCheck?.overlapsFrom && !statementReading?.fulizaAlreadyRecorded ? (
                  <Text style={[styles.hint, { color: colors.destructive, marginTop: 4 }]} testID="mpesa-fuliza-overlap">
                    Fuliza charges are already recorded for {fulizaCheck.overlapsFrom} to {fulizaCheck.overlapsTo}, which overlaps this
                    statement, so its Fuliza charges line starts unticked: ticking it would count the shared days' fees twice.
                  </Text>
                ) : null}
                {openingFix && canManageBudget ? (
                  <View style={{ gap: 6, marginTop: 4 }} testID="mpesa-opening-fix">
                    <Text style={[styles.hint, { color: colors.foreground }]}>
                      Your statement starts at KES {formatExact(openingFix.to)}, but this account starts at KES {formatExact(openingFix.current)}.
                      Nothing is recorded in it before the statement, so its starting balance can simply be set to match.
                    </Text>
                    <Pressable
                      onPress={fixOpeningBalance}
                      disabled={openingSaving}
                      style={[styles.primary, { backgroundColor: colors.primary, opacity: openingSaving ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      testID="mpesa-opening-fix-button"
                    >
                      {openingSaving
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryText}>Start this account at KES {formatExact(openingFix.to)}</Text>}
                    </Pressable>
                  </View>
                ) : null}
                {balanceSides && !openingFix ? (
                  <View style={{ gap: 2, marginTop: 4 }} testID="mpesa-balance-sides">
                    <Text style={[styles.hint, { color: colors.foreground }]}>
                      On {balanceSides.startDay}: Jamvi KES {formatExact(balanceSides.jamviStart)} · M-Pesa KES {formatExact(balanceSides.mpesaStart)}
                    </Text>
                    <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]}>
                      On {balanceSides.endDay}: Jamvi KES {formatExact(balanceSides.jamviEnd)} · M-Pesa KES {formatExact(balanceSides.mpesaEnd)}
                    </Text>
                    {Math.abs(balanceSides.jamviStart - balanceSides.mpesaStart) >= 0.005 ? (
                      <Text style={[styles.hint, { color: colors.destructive }]} testID="mpesa-balance-before">
                        KES {formatExact(Math.round((balanceSides.mpesaStart - balanceSides.jamviStart) * 100) / 100)} of the difference is from before {balanceSides.startDay}: this account's starting balance, or entries before then, do not match M-Pesa. Import the statement for the month before to find them.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {extras && extras.rows.length > 0 ? (
                  <View style={{ gap: 3, marginTop: 6 }} testID="mpesa-not-on-statement">
                    <Text style={[styles.hint, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                      In Jamvi but not on this statement: {extras.rows.length} {extras.rows.length === 1 ? 'entry' : 'entries'}, KES {formatExact(extras.net)}
                    </Text>
                    <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>
                      These move the balance but M-Pesa has no record of them. Remove any that did not happen, or were recorded twice.
                    </Text>
                    {fixableExtras.length > 0 && canManageBudget ? (
                      <Pressable
                        onPress={fixExtras}
                        disabled={fixingExtras}
                        style={[styles.primary, { backgroundColor: colors.primary, opacity: fixingExtras ? 0.6 : 1, marginVertical: 6 }]}
                        accessibilityRole="button"
                        testID="mpesa-fix-extras"
                      >
                        {fixingExtras
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.primaryText}>Fix {fixableExtras.length} for me</Text>}
                      </Pressable>
                    ) : null}
                    {extras.rows.slice(0, 20).map((row) => (
                      <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.hint, { color: colors.foreground, marginTop: 0, flex: 1 }]} numberOfLines={2}>
                          • {String(row.date).slice(0, 10)} · {row.description ?? ''} · {row.effect < 0 ? '−' : '+'}KES {formatExact(Math.abs(row.effect))} ({row.why})
                        </Text>
                        {canManageBudget ? (
                          <Pressable onPress={() => removeExtra(row)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${row.description ?? 'this entry'}`} testID={`mpesa-extra-remove-${row.id}`}>
                            <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Remove</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    {extras.rows.length > 20 ? (
                      <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>and {extras.rows.length - 20} more</Text>
                    ) : null}
                  </View>
                ) : null}
                {missing && (missing.charges.length > 0 || missing.amounts.length > 0) ? (
                  <View style={{ gap: 3, marginTop: 6 }} testID="mpesa-missing-in-jamvi">
                    <Text style={[styles.hint, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                      On the statement but missing here{missing.charges.length > 0 ? `: ${missing.charges.length} ${missing.charges.length === 1 ? 'charge' : 'charges'}, KES ${formatExact(Math.abs(missing.net))}` : ''}
                    </Text>
                    {missing.charges.length > 0 && canManageBudget ? (
                      <Pressable
                        onPress={addMissingCharges}
                        disabled={addingMissing}
                        style={[styles.primary, { backgroundColor: colors.primary, opacity: addingMissing ? 0.6 : 1, marginVertical: 6 }]}
                        accessibilityRole="button"
                        testID="mpesa-add-missing"
                      >
                        {addingMissing
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.primaryText}>Add {missing.charges.length} missing {missing.charges.length === 1 ? 'charge' : 'charges'}</Text>}
                      </Pressable>
                    ) : null}
                    {missing.charges.slice(0, 20).map((charge) => (
                      <Text key={`c-${charge.parentId}`} style={[styles.hint, { color: colors.foreground, marginTop: 0 }]} numberOfLines={2}>
                        • {charge.date} · {charge.description} · −KES {formatExact(charge.amount)} (the payment is saved, its charge is not)
                      </Text>
                    ))}
                    {fulizaUpdates.length > 0 && canManageBudget ? (
                      <Pressable
                        onPress={updateFuliza}
                        disabled={updatingFuliza}
                        style={[styles.primary, { backgroundColor: colors.primary, opacity: updatingFuliza ? 0.6 : 1, marginVertical: 6 }]}
                        accessibilityRole="button"
                        testID="mpesa-update-fuliza"
                      >
                        {updatingFuliza
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.primaryText}>Update {fulizaUpdates.length} Fuliza {fulizaUpdates.length === 1 ? 'line' : 'lines'} to this statement</Text>}
                      </Pressable>
                    ) : null}
                    {missing.amounts.slice(0, 20).map((row) => (
                      <View key={`a-${row.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.hint, { color: colors.destructive, marginTop: 0, flex: 1 }]} numberOfLines={2}>
                          • {row.date} · {row.description}: saved as KES {formatExact(row.recorded)}, the statement says KES {formatExact(row.statement)}.
                        </Text>
                        {canManageBudget ? (
                          <Pressable onPress={() => applyStatementAmount(row)} disabled={correcting !== null} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Change ${row.description} to KES ${formatExact(row.statement)}`} testID={`mpesa-amount-fix-${row.id}`}>
                            {correcting === row.id
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Use KES {formatExact(row.statement)}</Text>}
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
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
                  {summary.toOtherBudgets > 0 ? ` · ${summary.toOtherBudgets} in another budget` : ''}
                </Text>
              </View>
            ) : null}

            {Object.keys(rules).length + Object.keys(otherRules).length > 0 ? (
              <Pressable onPress={() => setRulesOpen(true)} accessibilityRole="button" testID="mpesa-rules-open" style={{ alignSelf: 'flex-start' }}>
                <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold', marginTop: 0 }]}>
                  What Jamvi remembers ({Object.keys(rules).length + Object.keys(otherRules).length})
                </Text>
              </Pressable>
            ) : null}
            {/* Each business asked once: a salary from it, or its profit is your income (lib/businessSalary). */}
            {lines && canManageBudget ? <BusinessSalaryQuestion /> : null}
            {lines && canManageBudget && !teachClosed ? (
              <FamilyNamesCard
                kept={keptFamily}
                categories={familyLeaves}
                suggestions={familySuggestions}
                onAdd={addFamily}
                onRemove={(key) => keepRules(withoutFamily(rules, key))}
              />
            ) : null}
            {known && !teachClosed && (teachGroups.length > 0 || teachAnswered > 0) ? (
              <TeachJamviCard
                groups={teachGroups}
                known={known}
                answered={teachAnswered}
                suggestions={(taught) => suggestedCategories(taught, [...(familyLeaves.length > 0 ? familyLeaves : [FAMILY_CATEGORY]), ...leafNames], choices[taught.indexes[0]]?.category)}
                incomeSources={incomeSources}
                accounts={ownAccounts}
                businesses={whoForBusinesses}
                onCategory={teachAsCategory}
                onPickCategory={(taught) => setPicking(`teach:${taught.key}`)}
                onSource={teachAsSource}
                onOwnAccount={teachAsOwnAccount}
                onDebt={teachAsDebt}
                guess={(taught) => {
                  const first = choices[taught.indexes[0]];
                  return first?.sourceAuto ? first.incomeSourceId ?? null : null;
                }}
                onSkip={(taught) => setTeachSkipped((current) => new Set([...current, taught.key]))}
                onClose={() => setTeachClosed(true)}
              />
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
                    ['changed', statementReading ? 'Confirmed by you' : 'Changed by you'],
                    ['suggested', 'Suggested'],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => {
                    const on = view === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => { setView(key); setShownCount(LINES_PER_PAGE); }}
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
                {toNotSure.length > 0 && canManageBudget ? (
                  <Pressable
                    onPress={allUnderNotSure}
                    style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8, marginTop: 10 }]}
                    accessibilityRole="button"
                    testID="mpesa-review-all-not-sure"
                  >
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
                      Put {filtering ? `all ${toNotSure.length} found` : `the other ${toNotSure.length}`} under Not sure - sort them out later
                    </Text>
                  </Pressable>
                ) : null}
                {months.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2, marginTop: 10 }} testID="mpesa-review-months">
                    {[{ key: null as string | null, label: 'All months', count: recordable.length }, ...months].map((option) => {
                      const on = month === option.key;
                      return (
                        <Pressable
                          key={option.key ?? 'all'}
                          onPress={() => { setMonth(option.key); setShownCount(LINES_PER_PAGE); }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          testID={`mpesa-review-month-${option.key ?? 'all'}`}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                        >
                          <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.label} ({option.count})</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                <TextInput
                  value={find}
                  onChangeText={(value) => { setFind(value); setShownCount(LINES_PER_PAGE); }}
                  placeholder="Find a name, amount or category, e.g. naivas, in 50,000"
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[styles.pasteBox, { minHeight: 44, marginTop: 10, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  testID="mpesa-review-find"
                />
                {filtering ? (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID="mpesa-review-find-count">
                      {inView.length} found
                    </Text>
                    {toConfirm.length > 0 ? (
                      <Pressable
                        onPress={confirmFound}
                        style={[styles.secondary, { borderColor: colors.primary, borderWidth: 1, borderRadius: 8 }]}
                        accessibilityRole="button"
                        testID="mpesa-review-confirm-found"
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Confirm all {toConfirm.length} suggestions found</Text>
                      </Pressable>
                    ) : null}
                    {toCategorise.length > 0 ? (
                      <Pressable
                        onPress={() => setPicking('bulk')}
                        style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                        accessibilityRole="button"
                        testID="mpesa-review-categorise-found"
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Choose one category for all {toCategorise.length}</Text>
                      </Pressable>
                    ) : null}
                    {toStream.length > 0 && incomeSources.length > 0 ? (
                      <Pressable
                        onPress={() => setStreamPickerOpen((open) => !open)}
                        style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                        accessibilityRole="button"
                        testID="mpesa-review-stream-found"
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Choose one income stream for all {toStream.length}</Text>
                      </Pressable>
                    ) : null}
                    {streamPickerOpen && toStream.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }} testID="mpesa-review-stream-choices">
                        {incomeSources.map((source) => (
                          <Pressable
                            key={source.id}
                            onPress={() => streamFound(source)}
                            accessibilityRole="button"
                            testID={`mpesa-review-stream-${source.id}`}
                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}
                          >
                            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{source.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                    {toSend.length > 0 && canManageBudget && otherManagedBudgets.length > 0 ? (
                      <Pressable
                        onPress={() => setSendFound((current) => (current ? null : { groupId: null, accountId: 0, category: '', incomeSourceId: null }))}
                        style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                        accessibilityRole="button"
                        testID="mpesa-review-send-found"
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                          {otherManagedBudgets.length === 1 ? `Send all ${toSend.length} to ${otherManagedBudgets[0].name}` : `Send all ${toSend.length} to another budget`}
                        </Text>
                      </Pressable>
                    ) : null}
                    {sendFound && toSend.length > 0 ? (
                      <View style={{ gap: 6 }} testID="mpesa-review-send-choices">
                        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Which budget?</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                          {otherManagedBudgets.map((option) => {
                            const on = sendFound.groupId === option.id;
                            return (
                              <Pressable
                                key={option.id}
                                disabled={loadingOtherBudget !== null}
                                onPress={async () => {
                                  const options = await loadOtherBudgetOptions(option.id);
                                  if (!options) return;
                                  setSendFound({ groupId: option.id, accountId: options.accounts[0]?.id ?? 0, category: '', incomeSourceId: null });
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                testID={`mpesa-review-send-budget-${option.id}`}
                                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                              >
                                {option.id !== null && loadingOtherBudget === option.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                        {(() => {
                          if (sendFound.groupId === null) return null;
                          const options = otherBudgetOptions[sendFound.groupId];
                          const target = otherManagedBudgets.find((option) => option.id === sendFound.groupId);
                          if (!options || !target) return null;
                          const outCount = toSend.filter((line) => line.direction === 'out').length;
                          const inCount = toSend.length - outCount;
                          const account = options.accounts.find((option) => option.id === sendFound.accountId);
                          const ready = Boolean(account) && (outCount === 0 || Boolean(sendFound.category));
                          return (
                            <View style={{ gap: 6 }}>
                              {options.accounts.length === 0 ? (
                                <Text style={[styles.hint, { color: colors.destructive, marginTop: 0 }]}>{target.name} has no bank account yet. Add one there first.</Text>
                              ) : (
                                <>
                                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Which account in {target.name}?</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                    {options.accounts.map((option) => {
                                      const on = sendFound.accountId === option.id;
                                      return (
                                        <Pressable key={option.id} onPress={() => setSendFound({ ...sendFound, accountId: option.id })} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`mpesa-review-send-account-${option.id}`} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                                          <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </>
                              )}
                              {outCount > 0 ? (
                                <>
                                  <Text style={[styles.hint, { color: sendFound.category ? colors.mutedForeground : colors.destructive, marginTop: 0 }]}>
                                    {inCount > 0 ? `What the ${outCount} paid out ${outCount === 1 ? 'was' : 'were'} for in ${target.name}` : `Which category in ${target.name}?`}
                                  </Text>
                                  {options.categories.length === 0 ? (
                                    <Text style={[styles.hint, { color: colors.destructive, marginTop: 0 }]}>{target.name} has no categories yet. Add one there first.</Text>
                                  ) : (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                      {options.categories.map((category) => {
                                        const on = sendFound.category === category;
                                        return (
                                          <Pressable key={category} onPress={() => setSendFound({ ...sendFound, category })} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`mpesa-review-send-category-${category}`} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                                            <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{category}</Text>
                                          </Pressable>
                                        );
                                      })}
                                    </ScrollView>
                                  )}
                                </>
                              ) : null}
                              {inCount > 0 && options.incomeSources.length > 0 ? (
                                <>
                                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>
                                    {outCount > 0 ? `Income source in ${target.name} for the ${inCount} received (optional)` : `Which income source in ${target.name}? (optional)`}
                                  </Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                    {[{ id: null as number | null, name: 'Not sure' }, ...options.incomeSources.map((source) => ({ id: source.id as number | null, name: source.name }))].map((option) => {
                                      const on = sendFound.incomeSourceId === option.id;
                                      return (
                                        <Pressable key={option.id ?? 'no'} onPress={() => setSendFound({ ...sendFound, incomeSourceId: option.id })} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`mpesa-review-send-income-${option.id ?? 'no'}`} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                                          <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </>
                              ) : null}
                              <Pressable
                                disabled={!ready}
                                onPress={() => sendFoundTo(target.name, account!.name)}
                                style={[styles.primary, { backgroundColor: colors.primary, opacity: ready ? 1 : 0.5 }]}
                                accessibilityRole="button"
                                testID="mpesa-review-send-go"
                              >
                                <Text style={styles.primaryText}>Send {toSend.length} to {target.name}</Text>
                              </Pressable>
                            </View>
                          );
                        })()}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {inView.slice(0, shownCount).map((item) => {
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
                      {status === 'needs' ? 'Needs you' : status === 'changed' ? (choice?.confirmed ? ((choice.auto && out && productOf(item)) || loanOf(item) || savingsOf(item) ? 'Filed by Jamvi' : 'Confirmed') : 'You changed this - confirmed, it saves with the next Save') : 'Suggested by Jamvi'}
                    </Text>
                  ) : null}
                  {twinNotes(item).map((note) => (
                    <Text key={note} style={[styles.hint, { marginTop: 0, color: colors.destructive }]} testID={`mpesa-line-twin-${item.index}`}>
                      {note}
                    </Text>
                  ))}
                  {statementReading && choice?.include && (status === 'suggested' || choice?.confirmed) ? (
                    <Pressable
                      onPress={() => confirm(item.index, !choice?.confirmed)}
                      hitSlop={6}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(choice?.confirmed) }}
                      accessibilityLabel={choice?.confirmed ? 'Confirmed. Tap to take it back' : 'Confirm this as it is'}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 4 }}
                      testID={`mpesa-line-confirm-${item.index}`}
                    >
                      <Feather name={choice?.confirmed ? 'check-square' : 'square'} size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {choice?.confirmed ? 'Confirmed' : 'Confirm'}
                      </Text>
                    </Pressable>
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
                    <Switch value={!!choice?.include} disabled={!canManageBudget && out} onValueChange={(value) => toggle(item.index, value)} accessibilityLabel={`Save ${item.description}`} />
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
                  {/* Quiet unless asked: a line Jamvi knows is a business's says so in a tag,
                      and the question itself only opens with More or the tag ("simplicity...
                      complications in onboarding, not usage", 9 Oct 2026). */}
                  {canManageBudget && choice?.include && destinationOf(choice) === 'category' && businessFor(item) !== null && !openMore.has(item.index) ? (
                    <Pressable
                      onPress={() => setOpenMore((current) => new Set(current).add(item.index))}
                      accessibilityRole="button"
                      accessibilityLabel={`For ${whoForBusinesses.find((one) => one.id === businessFor(item))?.name ?? 'a business'}. Tap to change`}
                      testID={`mpesa-line-business-tag-${item.index}`}
                      hitSlop={6}
                      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${colors.primary}1a` }}
                    >
                      <Feather name="briefcase" size={11} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                        For {whoForBusinesses.find((one) => one.id === businessFor(item))?.name ?? 'a business'} · change
                      </Text>
                    </Pressable>
                  ) : null}
                  {canManageBudget && choice?.include && destinationOf(choice) === 'category' && openMore.has(item.index) && (whoForBusinesses.length > 0 || businessFor(item) !== null)
                    && (out || (!item.type?.startsWith('fuliza_') && item.type !== 'reversal' && loanOf(item)?.kind !== 'borrowed' && !savingsOf(item))) ? (
                    // A business's payment or sales, filed as the business's here rather than under Not sure and moved on Bank later.
                    <WhoIsThisFor
                      compact
                      testIDSuffix={`-${item.index}`}
                      direction={out ? 'out' : 'in'}
                      businesses={whoForBusinesses}
                      businessId={businessFor(item)}
                      onBusiness={(id) => chooseLineBusiness(item.index, id)}
                      costs={costsOf(owners, businessFor(item))}
                      category={choice.category}
                      onCategory={(name) => setChoices((current) => chooseNewCost(lines ?? [], current, item.index, name))}
                      onAddCost={(name) => addLineCost(item.index, name)}
                      onAddBusiness={(name) => addLineBusiness(item.index, name)}
                      payeeName={choice.payeeName ?? namedPayees.nameFor(item.description) ?? ''}
                      onPayeeName={(name) => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], payeeName: name } }))}
                      afterSaveNote={(business) => choice.remember === false
                        ? `Saved as ${business}'s. Jamvi will not remember this payee for it.`
                        : `The payee's other lines here follow. After Save, Jamvi remembers this payee for ${business}.`}
                    />
                  ) : null}
                  {out && choice?.include && choice.debt?.kind !== 'lend' && !isMove(choice) && !isNotSure(choice.category) && canManageBudget && businessFor(item) === null ? (
                    <Pressable
                      onPress={() => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], category: NOT_SURE_CATEGORY, auto: false, remember: false } }))}
                      accessibilityRole="button"
                      testID={`mpesa-line-not-sure-${item.index}`}
                      hitSlop={6}
                      style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
                    >
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Not sure yet - save it and sort it out later</Text>
                    </Pressable>
                  ) : null}
                  {out && choice?.include && isNotSure(choice.category) ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID={`mpesa-line-not-sure-note-${item.index}`}>
                      Saved under Not sure yet. Home will remind you to sort it out.
                    </Text>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && canManageBudget && item.description && (!choice.category || isNotSure(choice.category)) && businessFor(item) === null ? (
                    <NewCategoryOffer
                      description={item.description}
                      rows={categories as unknown as CategoryLite[]}
                      testID={`mpesa-line-new-category-${item.index}`}
                      onCreated={(name) => {
                        void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
                        const made = standardTargetFor(item.description ?? '')?.name;
                        setChoices((current) => {
                          // This line, and its payee's other lines, as chosen (chooseCategory);
                          // other payees Jamvi files under the same category as a suggestion.
                          const next = chooseLineCategory(lines ?? [], current, item.index, name);
                          for (const line of lines ?? []) {
                            const other = next[line.index];
                            if (line.index === item.index || line.direction !== 'out' || !other?.include) continue;
                            if (other.category && !isNotSure(other.category)) continue;
                            if (made && standardTargetFor(line.description ?? '')?.name === made) next[line.index] = { ...other, category: name, auto: true };
                          }
                          return next;
                        });
                      }}
                    />
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && !isNotSure(choice.category) && item.description && rules[payeeKey(item.description)] !== choice.category ? (
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
                      {productOf(item) ? `${productNote(productOf(item)!, choice.category)} Tap to choose a different one.` : 'Suggested by Jamvi. Tap to choose a different one.'}
                    </Text>
                  ) : null}
                  {/* Not asked once Who is this for? names a business: it is that business's sales. */}
                  {item.direction === 'in' && choice?.include && !choice.debt && !isMove(choice) && !choice.contributorId && destinationOf(choice) === 'category' && !item.type?.startsWith('fuliza_') && item.type !== 'reversal' && businessFor(item) === null ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-source-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.foreground, marginTop: 0, fontFamily: 'Inter_600SemiBold' }]}>Where did this come from?</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'Not sure yet' }, ...incomeSources].map((source) => {
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
                        <AddIncomeSourceChip
                          testID={`mpesa-line-source-add-${item.index}`}
                          onCreated={(created) => setChoices((current) => chooseIncomeSource(lines ?? [], current, item.index, created.id))}
                        />
                      </ScrollView>
                      {(choice.incomeSourceId ?? null) === null ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID={`mpesa-line-source-unsure-${item.index}`}>
                          Not sure yet: it still counts in {accounts.find((option) => option.id === accountId)?.name ?? 'the account'}, and Home will remind you to say where it came from.
                        </Text>
                      ) : null}
                      {choice.sourceAuto && choice.incomeSourceId ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]} testID={`mpesa-line-source-suggested-${item.index}`}>
                          Suggested by Jamvi. Tap another to change it.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {openMore.has(item.index) || destinationOf(choice) !== 'category' || transferHints.has(item.index) ? (
                    <>
                  {canManageBudget && choice?.include && !choice.debt && !choice.contributorId && otherAccounts.length > 0 ? (
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
                              onPress={() => {
                                // Keeps this whole section open even after "No" clears it back
                                // to a plain category — otherwise the shared gate below closes
                                // and the very options being switched to disappear with it.
                                setOpenMore((current) => new Set(current).add(item.index));
                                setChoices((current) => chooseTransfer(current, item.index, option.id));
                              }}
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
                  {canManageBudget && choice?.include && destinationOf(choice) !== 'debt' && destinationOf(choice) !== 'contribution' && canUseSavings(item) && savingsGoals.length > 0 ? (
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
                              onPress={() => {
                                setOpenMore((current) => new Set(current).add(item.index));
                                setChoices((current) => chooseSavings(current, item.index, option.id));
                              }}
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
                  {canManageBudget && choice?.include && destinationOf(choice) === 'category' && otherManagedBudgets.length > 0 && !otherBudgetOpen.has(item.index) ? (
                    <Pressable
                      onPress={() => setOtherBudgetOpen((current) => new Set(current).add(item.index))}
                      accessibilityRole="button"
                      hitSlop={6}
                      style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
                      testID={`mpesa-line-other-budget-open-${item.index}`}
                    >
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {whoForBusinesses.length > 0 ? 'Record it in a separate budget instead (not a business)' : 'Record it in a separate budget instead'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {canManageBudget && choice?.include && (destinationOf(choice) === 'other-budget' || (destinationOf(choice) === 'category' && otherBudgetOpen.has(item.index))) && otherManagedBudgets.length > 0 ? (
                    <View style={{ gap: 6 }} testID={`mpesa-line-other-budget-${item.index}`}>
                      <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Record it in which of your other budgets?</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                        {[{ id: null as number | null, name: 'No' }, ...otherManagedBudgets.map((option) => ({ id: option.id as number | null, name: option.name }))].map((option) => {
                          const on = (choice.otherBudget?.groupId ?? null) === option.id;
                          return (
                            <Pressable
                              key={option.id ?? 'no'}
                              disabled={loadingOtherBudget !== null}
                              onPress={async () => {
                                setOpenMore((current) => new Set(current).add(item.index));
                                if (option.id === null) {
                                  setChoices((current) => chooseOtherBudget(current, item.index, null));
                                  return;
                                }
                                const options = await loadOtherBudgetOptions(option.id);
                                if (!options) return;
                                setChoices((current) =>
                                  chooseOtherBudget(current, item.index, {
                                    groupId: option.id!,
                                    groupName: option.name,
                                    accountId: options.accounts[0]?.id ?? 0,
                                    accountName: options.accounts[0]?.name ?? '',
                                  }),
                                );
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              testID={`mpesa-line-other-budget-${item.index}-${option.id ?? 'no'}`}
                              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted, opacity: option.id !== null && loadingOtherBudget === option.id ? 0.6 : 1 }}
                            >
                              {option.id !== null && loadingOtherBudget === option.id ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                              ) : (
                                <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      {choice.otherBudget ? (
                        (() => {
                          const target = choice.otherBudget!;
                          const options = otherBudgetOptions[target.groupId];
                          if (!options) return null;
                          return (
                            <View style={{ gap: 6 }}>
                              {options.accounts.length === 0 ? (
                                <Text style={[styles.hint, { color: colors.destructive, marginTop: 0 }]}>{target.groupName} has no bank account yet. Add one there first.</Text>
                              ) : (
                                <>
                                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Which account in {target.groupName}?</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                    {options.accounts.map((account) => {
                                      const on = target.accountId === account.id;
                                      return (
                                        <Pressable
                                          key={account.id}
                                          onPress={() => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, accountId: account.id, accountName: account.name }))}
                                          accessibilityRole="button"
                                          accessibilityState={{ selected: on }}
                                          testID={`mpesa-line-other-budget-account-${item.index}-${account.id}`}
                                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                                        >
                                          <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{account.name}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </>
                              )}
                              {out ? (
                                <>
                                  <Text style={[styles.hint, { color: options.categories.length === 0 || !target.category?.trim() ? colors.destructive : colors.mutedForeground, marginTop: 0 }]}>Which category in {target.groupName}?</Text>
                                  {options.categories.length === 0 ? (
                                    <Text style={[styles.hint, { color: colors.destructive, marginTop: 0 }]}>{target.groupName} has no categories yet. Add one there first.</Text>
                                  ) : (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                      {options.categories.map((category) => {
                                        const on = target.category === category;
                                        return (
                                          <Pressable
                                            key={category}
                                            onPress={() => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, category }))}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: on }}
                                            testID={`mpesa-line-other-budget-category-${item.index}-${category}`}
                                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                                          >
                                            <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{category}</Text>
                                          </Pressable>
                                        );
                                      })}
                                    </ScrollView>
                                  )}
                                </>
                              ) : options.incomeSources.length > 0 ? (
                                <>
                                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>Which income source in {target.groupName}? (optional)</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                                    {[{ id: null as number | null, name: 'Not sure' }, ...options.incomeSources.map((source) => ({ id: source.id as number | null, name: source.name }))].map((option) => {
                                      const on = (target.incomeSourceId ?? null) === option.id;
                                      return (
                                        <Pressable
                                          key={option.id ?? 'no'}
                                          onPress={() => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, incomeSourceId: option.id }))}
                                          accessibilityRole="button"
                                          accessibilityState={{ selected: on }}
                                          testID={`mpesa-line-other-budget-income-${item.index}-${option.id ?? 'no'}`}
                                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                                        >
                                          <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{option.name}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </ScrollView>
                                </>
                              ) : null}
                            </View>
                          );
                        })()
                      ) : null}
                      {choice.otherBudget && item.description ? (
                        <Pressable
                          onPress={() => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], remember: !current[item.index]?.remember } }))}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: choice.remember === true }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                          testID={`mpesa-line-remember-other-${item.index}`}
                        >
                          <Feather name={choice.remember ? 'check-square' : 'square'} size={18} color={choice.remember ? colors.primary : colors.mutedForeground} />
                          <Text style={{ color: colors.foreground, fontSize: 13, flexShrink: 1 }}>{rememberOtherBudgetLabel(item, choice.otherBudget.groupName)}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {canManageBudget && isShared && item.direction === 'in' && choice?.include && !isMove(choice) && destinationOf(choice) !== 'debt' && parties.length > 0 ? (
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
                  {choice?.include && !isMove(choice) && !choice.contributorId && canLinkDebt(item, parties) ? (
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
                              hitSlop={10}
                              style={{ paddingVertical: 6 }}
                            >
                              <Text style={[styles.hint, { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>
                                Debt, loan, or paid through your account?
                              </Text>
                            </Pressable>
                          )}
                        </>
                      );
                    })()
                  ) : null}
                    </>
                  ) : choice?.include ? (
                    <Pressable
                      onPress={() => setOpenMore((current) => new Set(current).add(item.index))}
                      accessibilityRole="button"
                      hitSlop={6}
                      testID={`mpesa-line-more-${item.index}`}
                    >
                      <Text style={[styles.hint, { color: colors.primary, marginTop: 0, fontFamily: 'Inter_600SemiBold' }]}>
                        More: a business's, debt or loan, between my accounts, savings, another budget
                      </Text>
                    </Pressable>
                  ) : null}
                  {/* On the line itself, not under More: "how can we add notes?" (9 Oct 2026). */}
                  {canAddNote(choice) ? (
                    noteOpen.has(item.index) || choice?.notes ? (
                      <TextInput
                        value={choice?.notes ?? ''}
                        onChangeText={(text) => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], notes: text } }))}
                        placeholder="A short note (optional)"
                        placeholderTextColor={colors.mutedForeground}
                        maxLength={1000}
                        multiline
                        accessibilityLabel={`Note for ${item.description ?? 'this line'}`}
                        testID={`mpesa-line-note-${item.index}`}
                        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.foreground, fontSize: 14 }}
                      />
                    ) : (
                      <Pressable
                        onPress={() => setNoteOpen((current) => new Set(current).add(item.index))}
                        accessibilityRole="button"
                        testID={`mpesa-line-note-add-${item.index}`}
                        hitSlop={6}
                        style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Add a note (optional)</Text>
                      </Pressable>
                    )
                  ) : null}
                  {out && item.fee ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>+ KES {formatExact(item.fee)} M-Pesa charge, saved on its own</Text>
                  ) : null}
                </View>
              );
            })}
            {inView.length > shownCount ? (
              <Pressable
                onPress={() => setShownCount((count) => count + LINES_PER_PAGE)}
                style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                accessibilityRole="button"
                testID="mpesa-show-more"
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                  Show the next {Math.min(LINES_PER_PAGE, inView.length - shownCount)} ({inView.length - shownCount} more)
                </Text>
              </Pressable>
            ) : null}

            {summary && summary.fees > 0 && builtInCharge ? (
              <Text style={[styles.hint, { color: colors.mutedForeground }]} testID="mpesa-charge-built-in">
                M-Pesa charges on these are filed under {builtInCharge}.
              </Text>
            ) : summary && summary.fees > 0 ? (
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
                {notImported.slice(0, shownSkipped).map((item) => (
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
                {notImported.length > shownSkipped ? (
                  <Pressable
                    onPress={() => setShownSkipped((count) => count + LINES_PER_PAGE)}
                    style={[styles.secondary, { borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}
                    accessibilityRole="button"
                    testID="mpesa-show-more-skipped"
                  >
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                      Show the next {Math.min(LINES_PER_PAGE, notImported.length - shownSkipped)} ({notImported.length - shownSkipped} more)
                    </Text>
                  </Pressable>
                ) : null}
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

            {statementReading ? (
              <Pressable onPress={confirmReadAgain} style={styles.secondary} accessibilityRole="button" testID="mpesa-read-again">
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Read my statement again (keeps your choices)</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={statementReading ? confirmStartOver : () => { setLines(null); setChoices({}); setStatementNote(null); setStatementReading(null); }} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Start again</Text>
            </Pressable>
          </>
        )}
      </PageScrollView>
      {/* Warmed as soon as a statement is chosen, so reading starts at once. */}
      <StatementReader job={readerJob} warm={statementFile !== null} onDone={onStatementRead} />

      {lines && !rereading ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderColor: colors.border }]}>
          {firstProblem ? (
            <Pressable onPress={showProblem} accessibilityRole="button" accessibilityHint="Shows the entry that needs attention" testID="mpesa-first-problem">
              <Text style={[styles.hint, { color: colors.destructive, marginBottom: 6 }]}>
                {firstProblem}
                {firstProblemIndex !== null ? '  Tap to see it.' : ''}
              </Text>
            </Pressable>
          ) : null}
          {saveProgress && saveProgress.total > 0 ? (
            <View style={{ gap: 6 }} testID="mpesa-save-progress-bar" accessibilityLiveRegion="polite">
              <Text style={[styles.hint, { color: colors.foreground }]}>
                Saved {saveProgress.done} of {saveProgress.total} · {Math.round((saveProgress.done / saveProgress.total) * 100)}%. Keep Jamvi open until it finishes.
              </Text>
              <ProgressBar fraction={saveProgress.done / saveProgress.total} color={colors.primary} track={colors.muted} />
            </View>
          ) : null}
          {backgroundSave ? (
            // A save started on an earlier visit, still running in the background:
            // the bar the rest of Jamvi shows is off on this screen, so show it here.
            <View style={{ gap: 6 }} testID="mpesa-background-save" accessibilityLiveRegion="polite">
              <Text style={[styles.hint, { color: colors.foreground }]}>
                Saving in the background: {backgroundSave.done} of {backgroundSave.total} · {backgroundSave.total > 0 ? Math.round((backgroundSave.done / backgroundSave.total) * 100) : 0}%. You can keep using Jamvi.
              </Text>
              <ProgressBar fraction={backgroundSave.total > 0 ? backgroundSave.done / backgroundSave.total : 0} color={colors.primary} track={colors.muted} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
          {canUndo && !saving ? (
            <Pressable
              onPress={undo}
              style={[styles.primary, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, flexDirection: 'row', gap: 6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Undo the last change. ${undoSteps} ${undoSteps === 1 ? 'change' : 'changes'} can be undone`}
              testID="mpesa-import-undo"
            >
              <Feather name="rotate-ccw" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Undo</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={saveAll}
            disabled={saving || !summary || summary.count === 0 || (statementReading !== null && confirmedCount === 0)}
            style={[styles.primary, { flex: 1, backgroundColor: colors.primary, opacity: saving || !summary || summary.count === 0 || (statementReading !== null && confirmedCount === 0) ? 0.5 : 1 }]}
            accessibilityRole="button"
            testID="mpesa-import-save"
          >
            {saving ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#fff" />
                {saveProgress && saveProgress.total > 0 ? (
                  <Text style={styles.primaryText} testID="mpesa-save-progress">
                    Saving {saveProgress.done} of {saveProgress.total}
                  </Text>
                ) : null}
              </View>
            ) : backgroundSave ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryText} testID="mpesa-background-save-button">Saving… {backgroundSave.done} of {backgroundSave.total}</Text>
              </View>
            ) : (
              <Text style={styles.primaryText}>
                {statementReading
                  ? `Save ${confirmedCount} confirmed`
                  : `Save ${summary?.count ?? 0} ${summary?.count === 1 ? 'entry' : 'entries'}`}
              </Text>
            )}
          </Pressable>
          </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.sheetTitle, { color: colors.foreground, flexShrink: 1 }]}>Debt, loan, or paid through your account?</Text>
              {/* Leaves whatever this line already had untouched — unlike the "not a debt" button below, which is
                  its own deliberate answer and does write a change. An accidental open needs a true way out. */}
              <Pressable onPress={() => setDebtFor(null)} hitSlop={10} accessibilityLabel="Close without changing anything" testID="mpesa-debt-cancel">
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Choose who, and what it is. If the money was never really yours — it just passed through on its way
              somewhere else — "They are paying me back" or "I borrowed this from them" is still the right choice: it
              keeps your balance accurate without counting as your income or spending. Jamvi will offer to update
              what you owe or are owed once everything is saved.
            </Text>
            <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
              {parties.map((party) => {
                const on = debtFor?.partyId === party.id;
                return (
                  <Pressable
                    key={party.id}
                    onPress={() => setDebtFor((current) => (current ? { ...current, partyId: party.id } : current))}
                    style={[styles.option, on && { backgroundColor: `${colors.primary}18` }]}
                    accessibilityRole="button"
                    testID={`mpesa-debt-party-${party.id}`}
                    hitSlop={6}
                    pressRetentionOffset={PRESS_RETENTION_OFFSET}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>{party.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {newParty ? (
              <View style={{ gap: 8 }} testID="mpesa-debt-new-party">
                <TextInput
                  value={newParty.name}
                  onChangeText={(name) => setNewParty({ ...newParty, name })}
                  placeholder="Their name, or the company's"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  style={[styles.pasteBox, { minHeight: 44, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                  testID="mpesa-debt-new-party-name"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['person', 'institution'] as const).map((kind) => {
                    const on = newParty.kind === kind;
                    return (
                      <Pressable key={kind} onPress={() => setNewParty({ ...newParty, kind })} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`mpesa-debt-new-party-${kind}`}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{kind === 'person' ? 'A person' : 'A company or bank'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => void addParty()} disabled={addingParty || newParty.name.trim().length < 2} accessibilityRole="button" testID="mpesa-debt-new-party-add"
                    style={[styles.categoryButton, { flex: 1, justifyContent: 'center', borderColor: colors.primary, backgroundColor: `${colors.primary}18`, opacity: newParty.name.trim().length < 2 ? 0.5 : 1 }]}>
                    {addingParty ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Add {newParty.name.trim() || 'them'}</Text>}
                  </Pressable>
                  <Pressable onPress={() => setNewParty(null)} accessibilityRole="button" style={[styles.categoryButton, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.muted }]}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  const line = lines?.find((candidate) => candidate.index === debtFor?.index);
                  setNewParty({ name: line ? payeeName(withoutPersonTag(line.original ?? line.description ?? '')) : '', kind: 'person' });
                }}
                style={styles.option}
                accessibilityRole="button"
                testID="mpesa-debt-new-party-open"
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>＋ Someone new</Text>
              </Pressable>
            )}
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
                    hitSlop={6}
                    pressRetentionOffset={PRESS_RETENTION_OFFSET}
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
              hitSlop={6}
              pressRetentionOffset={PRESS_RETENTION_OFFSET}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (debtFor) {
                  // Keeps the other destination options in view afterward — otherwise the
                  // shared gate they sit behind closes the moment this reverts to a plain
                  // category, hiding the very options being switched to.
                  setOpenMore((current) => new Set(current).add(debtFor.index));
                  setDebt(debtFor.index, null);
                }
                setDebtFor(null);
              }}
              style={styles.secondary}
              accessibilityRole="button"
              hitSlop={6}
              pressRetentionOffset={PRESS_RETENTION_OFFSET}
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
              Categories you asked Jamvi to keep for a payee, and payees that belong to another budget. Forget one and it goes back to being suggested from your history.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {Object.entries(rules).map(([key, category]) => (
                <View key={key} style={[styles.option, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
                  <Text style={{ color: colors.foreground, flexShrink: 1 }}>{ruleLabel(key)} → {category}</Text>
                  <Pressable onPress={() => keepRules(withoutRule(rules, key))} accessibilityRole="button" accessibilityLabel={`Forget ${key}`} hitSlop={8} testID={`mpesa-rule-forget-${key}`}>
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              {Object.entries(otherRules).map(([key, rule]) => (
                <View key={`other-${key}`} style={[styles.option, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
                  <Text style={{ color: colors.foreground, flexShrink: 1 }}>{otherBudgetRuleLabel(key)} → {rule.groupName}{rule.category ? ` · ${rule.category}` : ''}</Text>
                  <Pressable onPress={() => keepOtherRules(withoutOtherBudgetRule(otherRules, key))} accessibilityRole="button" accessibilityLabel={`Forget ${key} going to ${rule.groupName}`} hitSlop={8} testID={`mpesa-other-rule-forget-${key}`}>
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
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={reporting !== null} animationType="slide" transparent onRequestClose={() => setReporting(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      <CategorySheet visible={picking !== null} budgetName={group?.name} onPick={chooseCategory} onClose={() => setPicking(null)} />
      <UndoDeleteBar pending={undoable.pending} onUndo={undoable.undo} />
    </View>
  );
}

/** A thin bar filled to `fraction` (0 to 1). */
function ProgressBar({ fraction, color, track }: { fraction: number; color: string; track: string }) {
  const filled = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(filled * 100)}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  kicker: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 2 },
  leadCard: { borderWidth: 2, shadowColor: '#0D4A43', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
  orLine: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  hint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  steps: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { fontSize: 16, fontFamily: 'Inter_700Bold', width: 18 },
  stepText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  pasteBox: { minHeight: 170, borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  primary: { height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  secondary: { alignItems: 'center', paddingVertical: 12 },
  card: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  summaryLine: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  categoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
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
