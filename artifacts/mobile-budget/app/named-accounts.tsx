/**
 * Named accounts: the outside accounts you pay often, by a name you choose,
 * and the category their payments go to (lib/namedPayees).
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, useGetBudgetCategories, useGetJointAccounts } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useNamedPayees } from '@/hooks/useNamedPayees';
import { isNamedPayee, namedKeyFor, namedKeyLabel } from '@/lib/namedPayees';
import { isNotSure } from '@/lib/entriesToSort';
import { payeeName, referenceOf } from '@/lib/payeeLearning';
import { LISTS_AN_EDIT_CHANGES } from '@/lib/showSavedEdit';
import { plainSaveError } from '@/lib/saveRetry';

type Row = {
  id: number; type: string; amount: number | string; date: string; description?: string | null; expenseCategory?: string | null;
  bankTransferId?: unknown; savingsGoalId?: unknown; chargeForTransactionId?: unknown; expenseId?: unknown;
  isLending?: boolean | null; settlesContributorId?: number | null; reversal?: unknown;
};

const same = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export default function NamedAccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const { named, add, remove } = useNamedPayees();
  const { data: accounts = [] } = useGetJointAccounts();
  const { data: categoryList = [] } = useGetBudgetCategories();

  // Opened from an entry: its account number, or its payee's name.
  const [keyText, setKeyText] = useState(() => {
    const from = typeof prefill === 'string' ? prefill : '';
    return referenceOf(from) || payeeName(from);
  });
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [working, setWorking] = useState(false);

  // Categories that carry spending: not a heading, and not Not sure yet.
  const categories = useMemo(() => {
    const parents = new Set(categoryList.map((row) => row.parentId).filter((id): id is number => id != null));
    return categoryList.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [categoryList]);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (words ? categories.filter((one) => one.toLowerCase().includes(words)) : categories).slice(0, 12);
  }, [categories, search]);

  /** Saved payments to this account still under another category: shown, counted, and moved only when asked. */
  const offerSaved = async (key: string, label: string, to: string) => {
    const found: Row[] = [];
    for (const account of accounts) {
      const ledger = await customFetch<{ transactions?: Row[] }>(`/api/joint-account?accountId=${account.id}`);
      found.push(...(ledger.transactions ?? []).filter((row) =>
        row.type === 'disbursement' && row.bankTransferId == null && row.savingsGoalId == null && row.chargeForTransactionId == null &&
        row.expenseId == null && !row.isLending && row.settlesContributorId == null && !row.reversal &&
        isNamedPayee(row.description, key) && !same(row.expenseCategory, to)));
    }
    if (found.length === 0) return;
    const total = found.reduce((sum, row) => sum + Number(row.amount), 0);
    Alert.alert(
      `${found.length} saved ${found.length === 1 ? 'payment' : 'payments'} to ${label}`,
      `KES ${Math.round(total).toLocaleString('en-KE')} in all. File them under ${to}?`,
      [
        { text: 'Leave them', style: 'cancel' },
        {
          text: `File ${found.length}`,
          onPress: () => {
            void (async () => {
              let moved = 0;
              try {
                for (const row of found) {
                  await customFetch(`/api/joint-account/${row.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: Number(row.amount), date: row.date, expenseCategory: to }),
                  });
                  moved += 1;
                }
                Alert.alert('Filed', `${moved} ${moved === 1 ? 'payment' : 'payments'} to ${label} filed under ${to}.`);
              } catch (error) {
                Alert.alert('Could not file them all', `${moved} of ${found.length} filed. ${plainSaveError(error)}`);
              } finally {
                void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
                for (const queryKey of LISTS_AN_EDIT_CHANGES) void queryClient.invalidateQueries({ queryKey });
              }
            })();
          },
        },
      ],
    );
  };

  const save = async () => {
    const key = namedKeyFor(keyText);
    if (!key) {
      Alert.alert('Which account?', 'Type its account number, paybill and account number, till or phone number, or its name as M-Pesa shows it.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('What should it be called?', 'For example "Landlord - Kamau".');
      return;
    }
    setWorking(true);
    try {
      await add({ key, name: name.trim(), ...(category ? { category } : {}) });
      setKeyText('');
      setName('');
      setCategory('');
      setSearch('');
      void queryClient.invalidateQueries({ queryKey: ['named-payees'] });
      if (category) await offerSaved(key, name.trim(), category);
    } catch (error) {
      Alert.alert('Could not look through your payments', plainSaveError(error));
    } finally {
      setWorking(false);
    }
  };

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground } as const;
  const chip = (on: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted,
  }) as const;

  return (
    <PageScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="named-accounts-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Named accounts</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>
        Give the accounts you pay often a name you will recognise - your landlord's bank account, a supplier's till - and say where their payments go.
      </Text>

      {named.length > 0 ? (
        <View style={{ gap: 8 }}>
          {named.map((one) => (
            <View key={one.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }} testID={`named-account-${one.key}`}>
              <Feather name="bookmark" size={16} color={colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{one.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                  {namedKeyLabel(one.key)}{one.category ? ` · ${one.category}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => Alert.alert(`Forget ${one.name}?`, 'Payments already filed stay where they are.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Forget', style: 'destructive', onPress: () => void remove(one.key) },
                ])}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Forget ${one.name}`}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }} testID="named-accounts-none">None yet.</Text>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Add one</Text>
        <TextInput value={keyText} onChangeText={setKeyText} placeholder="Account no., paybill + account, till, phone, or name" placeholderTextColor={colors.mutedForeground} style={input} testID="named-account-key" />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
          For a bank account, its account number is enough - or the paybill and account together (522522 1234567). A bank's paybill on its own is every payment to that bank.
        </Text>
        <TextInput value={name} onChangeText={setName} placeholder='Its name, e.g. "Landlord - Kamau"' placeholderTextColor={colors.mutedForeground} style={input} testID="named-account-name" />
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>Where its payments go (optional)</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search categories" placeholderTextColor={colors.mutedForeground} style={input} testID="named-account-category-search" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {shown.map((one) => (
            <Pressable key={one} onPress={() => setCategory(category === one ? '' : one)} accessibilityRole="button" accessibilityState={{ selected: category === one }} testID={`named-account-category-${one}`} style={chip(category === one)}>
              <Text style={{ color: category === one ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{one}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => void save()} disabled={working} accessibilityRole="button" testID="named-account-save"
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4, opacity: working ? 0.6 : 1 }}>
          {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Save</Text>}
        </Pressable>
      </View>
    </PageScrollView>
  );
}
