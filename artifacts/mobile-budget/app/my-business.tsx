/**
 * Your business's accounts: the numbers and names your business's money
 * comes from and goes to, so it is counted as owner's money - not income, not
 * spending, no debt (lib/ownerBusiness, api-server lib/owner-business).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { customFetch, useGetJointAccounts } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useOwnerBusiness } from '@/hooks/useOwnerBusiness';
import { useBusinesses } from '@/hooks/useBusinesses';
import { businessKeyFor, businessKeyLabel, businessMatches, withKey, withoutKey, withSkipped, type OwnerBusiness } from '@/lib/ownerBusiness';
import { plainSaveError } from '@/lib/saveRetry';

type Row = Parameters<typeof businessMatches>[0][number];

export default function MyBusinessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { business, matching, fromBank, unassigned, ready, markedIds, save, mark } = useOwnerBusiness();
  const { data: accounts = [] } = useGetJointAccounts();
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);

  // The business is picked from My businesses, never typed, so one business
  // cannot end up under two spellings ("create a business name first ...
  // one should not go to this step if he has not passed the stage of creating
  // a name", 8 Oct 2026).
  const myBusinesses = useBusinesses().list;
  // Set up before businesses were picked: the typed name, when it is one of them.
  const chosen = myBusinesses.find((one) => one.id === business.incomeSourceId)
    ?? myBusinesses.find((one) => one.name.trim().toLowerCase() === business.name.trim().toLowerCase())
    ?? null;
  const choose = (one: { id: number; name: string }) => void save({ ...business, name: one.name, incomeSourceId: one.id });

  /** Every saved entry, in every account, that names the business and is not yet marked. */
  const findSaved = async (next: OwnerBusiness): Promise<Row[]> => {
    const found: Row[] = [];
    for (const account of accounts) {
      const ledger = await customFetch<{ transactions?: Row[] }>(`/api/joint-account?accountId=${account.id}`);
      found.push(...businessMatches(ledger.transactions ?? [], next, markedIds));
    }
    return found;
  };

  /** Saved entries are shown first, counted, and marked only when the person says so. */
  const offerSaved = async (stored: OwnerBusiness) => {
    const next = { ...stored, keys: [...new Set([...stored.keys, ...fromBank.map((one) => one.key)])] };
    setWorking(true);
    try {
      const found = await findSaved(next);
      if (found.length === 0) return;
      const total = found.reduce((sum, row) => sum + Number((row as { amount?: number | string }).amount ?? 0), 0);
      Alert.alert(
        `${found.length} saved ${found.length === 1 ? 'entry names' : 'entries name'} your business`,
        `KES ${Math.round(total).toLocaleString('en-KE')} in all. Mark them as money between you and your business? Not income, not spending.`,
        [
          {
            text: 'Leave them',
            style: 'cancel',
            // Left as they are, and not marked later either.
            onPress: () => void save(found.reduce((acc, row) => withSkipped(acc, row.id), stored)),
          },
          {
            text: `Mark ${found.length}`,
            onPress: () => {
              void mark(found.map((row) => row.id)).catch((error) => Alert.alert('Could not mark them', plainSaveError(error)));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Could not look through your entries', plainSaveError(error));
    } finally {
      setWorking(false);
    }
  };

  const add = async () => {
    const key = businessKeyFor(typed);
    if (!key) return;
    if (business.keys.includes(key)) {
      setTyped('');
      return;
    }
    const next = withKey(business, key);
    await save(next);
    setTyped('');
    await offerSaved(next);
  };

  const remove = (key: string) => {
    Alert.alert('Stop treating this as your business?', `${businessKeyLabel(key)}. Entries already marked stay marked; open one on Bank to change it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void save(withoutKey(business, key)) },
    ]);
  };

  const shownName = chosen?.name ?? '';

  return (
    <PageScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="my-business-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>My business's accounts</Text>
      </View>

      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>
        Money from these is your own money taken from the business (owner's drawings), so it is not income. Money to them is money you put into it, so it is not spending. Neither is a debt.
      </Text>
      {!ready ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Getting ready on the server - entries are marked in a minute or two.</Text>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Which business?</Text>
        {myBusinesses.length === 0 ? (
          <View style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }} testID="my-business-create-first">
            <Text style={{ color: colors.foreground }}>First create the business in My businesses, then come back to add its numbers.</Text>
            <Pressable onPress={() => router.push('/businesses' as never)} accessibilityRole="button" testID="my-business-go-create"
              style={{ alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Create a business</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {myBusinesses.map((one) => {
              const on = chosen?.id === one.id;
              return (
                <Pressable key={one.id} onPress={() => choose(one)} accessibilityRole="button" testID={`my-business-pick-${one.id}`}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}>
                  <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{one.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {chosen ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Bank shows "From {shownName}" and "To {shownName}".</Text>
        ) : myBusinesses.length > 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Pick the business, then add its numbers.</Text>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Its numbers and names</Text>
        {/* First, so it is never pushed below a long list ("am not able to add", 8 Oct 2026). */}
        {chosen ? (<>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={() => void add()}
            placeholder="Till, paybill + account, phone number, or its name"
            placeholderTextColor={colors.mutedForeground}
            testID="my-business-add-input"
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }}
          />
          <Pressable onPress={() => void add()} disabled={!typed.trim() || working} accessibilityRole="button" testID="my-business-add"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', opacity: !typed.trim() || working ? 0.5 : 1 }}>
            {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
          </Pressable>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          Write it as M-Pesa or the bank shows it. For a bank account, add its account number, or the paybill and account number together (for example 522522 1234567) - a bank's paybill on its own would catch every payment to that bank. New entries that name it are marked as they come in. Open one on Bank and choose "Not my business" to sort it out another way.
        </Text>
        </>) : null}
        {unassigned.length > 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }} testID="my-business-unassigned">
            {unassigned.map((account) => account.name).join(', ')} {unassigned.length === 1 ? 'is a business account' : 'are business accounts'} on Bank with no business chosen. Open {unassigned.length === 1 ? 'it' : 'each'} on Bank and choose which business, and it is listed under that business here.
          </Text>
        ) : null}
        {fromBank.map((one) => (
          <View key={`bank-${one.key}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }} testID={`my-business-bank-${one.key}`}>
            <Feather name="credit-card" size={14} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground }}>{one.account} · {businessKeyLabel(one.key)}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>A business account on Bank. Change it there.</Text>
            </View>
          </View>
        ))}
        {business.keys.length === 0 && fromBank.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }} testID="my-business-none">None yet.</Text>
        ) : business.keys.map((key) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }} testID={`my-business-key-${key}`}>
            <Feather name={key.startsWith('#') ? 'hash' : 'briefcase'} size={14} color={colors.mutedForeground} />
            <Text style={{ flex: 1, color: colors.foreground }}>{businessKeyLabel(key)}</Text>
            <Pressable onPress={() => remove(key)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${businessKeyLabel(key)}`}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </View>

      {chosen && matching.keys.length > 0 ? (
        <Pressable onPress={() => void offerSaved(business)} disabled={working} accessibilityRole="button" testID="my-business-check-saved"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
          <Feather name="search" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Look through saved entries again</Text>
        </Pressable>
      ) : null}
    </PageScrollView>
  );
}
