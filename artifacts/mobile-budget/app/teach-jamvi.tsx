import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetJointAccountQueryKey,
  getGetJointAccountsQueryKey,
  useCreateJointAccount,
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useGetJointAccounts,
  useUpdateJointAccount,
  useUpdateJointAccountTransaction,
  useCreateBudgetCategory,
  getGetBudgetCategoriesQueryKey,
} from '@workspace/api-client-react';

import { useColors } from '@/hooks/useColors';
import { useBusinesses } from '@/hooks/useBusinesses';
import { useBusinessAccounts } from '@/hooks/useBusinessAccounts';
import { PageScrollView } from '@/components/PageScrollReset';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { TeachJamviCard, type OwnAccountAnswer } from '@/components/TeachJamviCard';
import { BusinessSalaryQuestion } from '@/components/BusinessSalaryQuestion';
import { FamilyNamesCard } from '@/components/FamilyNamesCard';
import { FAMILY_CATEGORY, familyCategories, familyNames, relativesBySurname, withFamily, withoutFamily } from '@/lib/family';
import { useAuth } from '@/lib/auth';
import { payeeKey } from '@/lib/payeeLearning';
import { isNotSure, type EntryToSort } from '@/lib/entriesToSort';
import { parseStoredRules, rulesStorageKey, withRule, withSourceRule, type PayeeRules } from '@/lib/payeeLearning';
import { savedGroups, suggestedCategories, teachDoneKey, type SavedGroup } from '@/lib/teachJamvi';
import { LISTS_AN_EDIT_CHANGES, withoutSorted } from '@/lib/showSavedEdit';
import { plainSaveError } from '@/lib/saveRetry';
import { saveRules } from '@/lib/rulesStore';

/**
 * Teach Jamvi your M-Pesa, for somebody who already uses Jamvi: "even a current
 * user should be vetted again" (9 Oct 2026). Their saved entries Jamvi could not
 * place (lib/entriesToSort) are grouped by payee, and the regulars are asked
 * about once each (lib/teachJamvi savedGroups). One answer files every one of
 * that payee's entries and teaches Jamvi the payee for every statement and
 * message after. Offered once per budget from Home; open again from Settings.
 */
export default function TeachJamviScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: group } = useGetGroup();
  const { data, isLoading, isError, refetch } = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ['entries-to-sort'],
    queryFn: () => customFetch('/api/entries-to-sort'),
    retry: false,
  });
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const { data: categoryList = [] } = useGetBudgetCategories();
  const { data: incomeSources = [] } = useGetIncomeSources();
  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string; accountNumber?: string | null }>;
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();
  const { mutateAsync: createAccount } = useCreateJointAccount();
  const { mutateAsync: updateAccount } = useUpdateJointAccount();
  const businesses = useBusinesses();
  const businessAccounts = useBusinessAccounts();

  // Only categories that carry spending: not a heading, and not "Not sure yet" itself.
  const categoryNames = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);

  const rulesKey = rulesStorageKey(group?.id);
  const [rules, setRules] = useState<PayeeRules>({});
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(rulesKey)
      .then((stored) => { if (active) setRules(parseStoredRules(stored)); })
      .catch(() => {});
    return () => { active = false; };
  }, [rulesKey]);
  const keepRules = (next: PayeeRules) => {
    setRules(next);
    void saveRules(group?.id, next, rules);
  };

  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [answered, setAnswered] = useState(0);
  const [working, setWorking] = useState(false);
  const groups = useMemo(() => savedGroups(entries, rules, { skipped }), [entries, rules, skipped]);
  const waiting = useMemo(() => entries.filter((entry) => !(entry.direction === 'in' && entry.incomeSourceId != null)).length, [entries]);
  const behind = groups.reduce((sum, one) => sum + one.count, 0);

  // Gone through, or put off: Home stops offering it for this budget.
  const finish = () => {
    void AsyncStorage.setItem(teachDoneKey(group?.id), 'done').catch(() => {});
    router.back();
  };

  const sorted = async (ids: readonly number[]) => {
    queryClient.setQueryData<{ entries: EntryToSort[] }>(['entries-to-sort'], (cached) => withoutSorted(cached, ids));
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });
    for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
  };

  // Every entry of the regular, one save each, as Sort them out does.
  const saveAll = async (taught: SavedGroup, change: Record<string, unknown>) => {
    setWorking(true);
    const done: number[] = [];
    try {
      for (const one of taught.entries) {
        await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, ...change } as never });
        done.push(one.id);
      }
      setAnswered((count) => count + 1);
    } catch (error) {
      Alert.alert('Could not file them all', `${done.length} of ${taught.count} filed. ${plainSaveError(error)}`);
    } finally {
      await sorted(done);
      setWorking(false);
    }
  };

  const onCategory = (taught: SavedGroup, category: string) => {
    if (category === FAMILY_CATEGORY) void ensureCategory(category);
    // A bank account is remembered by its account number, never the bank's shared paybill.
    keepRules(taught.key.startsWith('#ref:') ? { ...rules, [taught.key]: category } : withRule(rules, taught.entries[0].description, category));
    void saveAll(taught, { expenseCategory: category });
  };
  const onSource = (taught: SavedGroup, incomeSourceId: number) => {
    keepRules(withSourceRule(rules, taught.entries[0].description, incomeSourceId));
    // A stream's owner is who the money came in under (as Sort them out does).
    const owner = (incomeSources as Array<{ id: number; userId?: string | null }>).find((source) => source.id === incomeSourceId)?.userId;
    void saveAll(taught, { incomeSourceId, ...(owner ? { madeById: owner } : {}) });
  };
  const onOwnAccount = async (taught: SavedGroup, answer: OwnAccountAnswer) => {
    // The number goes on the account itself, on the server: every statement and
    // message after counts payments to it as the person's own money moving.
    let targetName: string;
    if ('accountId' in answer) {
      const existing = accounts.find((account) => account.id === answer.accountId);
      targetName = existing?.name ?? taught.label;
      await updateAccount({ id: answer.accountId, data: { name: targetName, accountNumber: taught.reference } });
    } else {
      const created = await createAccount({ data: { name: answer.name, accountNumber: taught.reference } });
      targetName = answer.name;
      let businessId = answer.businessId;
      if (answer.newBusinessName) businessId = (await businesses.create(answer.newBusinessName).catch(() => null))?.id ?? null;
      if (businessId !== null) {
        await businessAccounts.setBusiness(created.id, true, businessId).catch(() =>
          Alert.alert('Account added', "It could not be set as the business's yet. Open it on Bank and choose Business."));
      }
    }
    await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
    setSkipped((current) => new Set([...current, taught.key]));
    setAnswered((count) => count + 1);
    // Saved entries are left where they are: turning a payment into a move between
    // accounts is done on Bank. Said, so nobody thinks they changed.
    Alert.alert(
      `${targetName} linked`,
      `From now on, money to and from account ${taught.reference} counts as moving your own money. The ${taught.count} entries already saved stay under Not sure yet: sort them on Bank if they were moves too.`,
    );
  };

  // Your family, once (lib/family): their payments are family support, never a shop.
  const { user } = useAuth();
  const { mutateAsync: createCategory } = useCreateBudgetCategory();
  const familyLeaves = useMemo(() => familyCategories(categoryList as unknown as Array<{ id: number; name: string; parentId?: number | null }>), [categoryList]);
  const familyChoices = familyLeaves.length > 0 ? familyLeaves : [FAMILY_CATEGORY];
  const keptFamily = useMemo(() => familyNames(rules, familyChoices), [rules, familyChoices]);
  const familySuggestions = useMemo(
    () => relativesBySurname(entries.filter((entry) => entry.direction === 'out').map((entry) => entry.description), user?.lastName, keptFamily.map((one) => one.key)),
    [entries, user?.lastName, keptFamily],
  );
  const ensureCategory = async (name: string) => {
    if (categoryList.some((row) => row.name === name)) return;
    await createCategory({ data: { name, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } });
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
  };
  // Kept for every message after, and their saved Not sure entries filed now.
  const addFamily = async (name: string, category: string) => {
    await ensureCategory(category);
    keepRules(withFamily(rules, name, category));
    const key = payeeKey(name);
    const theirs = entries.filter((entry) => entry.direction === 'out' && payeeKey(entry.description) === key);
    if (theirs.length > 0) {
      const done: number[] = [];
      for (const one of theirs) {
        await updateTransaction({ id: one.id, data: { amount: one.amount, date: one.date, expenseCategory: category } as never });
        done.push(one.id);
      }
      await sorted(done);
    }
  };

  const [picking, setPicking] = useState<SavedGroup | null>(null);
  const [search, setSearch] = useState('');
  const pickable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? categoryNames.filter((name) => name.toLowerCase().includes(needle)) : categoryNames;
  }, [categoryNames, search]);

  return (
    <PageScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="teach-jamvi-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Teach Jamvi your M-Pesa</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : isError ? (
        <Pressable onPress={() => refetch()} accessibilityRole="button" testID="teach-jamvi-retry">
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Could not load your entries. Try again</Text>
        </Pressable>
      ) : groups.length === 0 && answered === 0 ? (
        <View style={{ gap: 12 }} testID="teach-jamvi-nothing">
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 21 }}>
            Nothing to ask. Jamvi already knows where your regular payments go.
          </Text>
          {waiting > 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
              {waiting} one-off {waiting === 1 ? 'entry is' : 'entries are'} still Not sure yet. Sort them out whenever you remember.
            </Text>
          ) : null}
          <Pressable onPress={finish} accessibilityRole="button" testID="teach-jamvi-close" style={{ alignSelf: 'flex-start' }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ opacity: working ? 0.6 : 1 }} pointerEvents={working ? 'none' : 'auto'}>
          {/* Each business asked once too, before the regulars (lib/businessSalary). */}
          <BusinessSalaryQuestion />
          <FamilyNamesCard kept={keptFamily} categories={familyLeaves} suggestions={familySuggestions} onAdd={addFamily} onRemove={(key) => keepRules(withoutFamily(rules, key))} />
          <TeachJamviCard
            groups={groups}
            intro={groups.length > 0 ? `${waiting} saved ${waiting === 1 ? 'entry is' : 'entries are'} Not sure yet. ${behind} of them are your ${groups.length === 1 ? 'one regular' : `${groups.length} regulars`} below.` : undefined}
            answered={answered}
            suggestions={(taught) => suggestedCategories(taught, [...familyChoices, ...categoryNames], undefined)}
            incomeSources={incomeSources as Array<{ id: number; name: string }>}
            accounts={accounts}
            businesses={businesses.list}
            onCategory={onCategory}
            onPickCategory={(taught) => { setSearch(''); setPicking(taught); }}
            onSource={onSource}
            onOwnAccount={onOwnAccount}
            onSkip={(taught) => setSkipped((current) => new Set([...current, taught.key]))}
            onClose={finish}
            doneText={`Done. Your ${answered === 1 ? 'regular is' : `${answered} regulars are`} filed, and Jamvi files them by itself from now on.`}
          />
          {groups.length === 0 ? (
            <Pressable onPress={finish} accessibilityRole="button" testID="teach-jamvi-finish" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}>Back to Home</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Modal visible={picking !== null} animationType="slide" transparent onRequestClose={() => setPicking(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + 16, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>What is {picking?.label} for?</Text>
              <Pressable onPress={() => setPicking(null)} hitSlop={10} accessibilityLabel="Close">
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <CategorySearchBox value={search} onChange={setSearch} testID="teach-jamvi-category-search" />
            <FlatList
              data={pickable}
              keyExtractor={(name) => name}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { const taught = picking; setPicking(null); if (taught) onCategory(taught, item); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12 }}
                  testID={`teach-jamvi-category-option-${item}`}
                >
                  <Text style={{ color: colors.foreground }}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </PageScrollView>
  );
}
