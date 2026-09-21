/**
 * One party paying another, through your account.
 *
 * Kamau owes you; you owe Mwangi. Kamau's money lands in your account and
 * leaves again to Mwangi the same day, and nothing of it was ever yours. Two
 * debts fall by the same amount and your balance ends where it started.
 *
 * Both halves could already be recorded one at a time — a deposit marked as a
 * repayment, then a withdrawal to somebody you owe — but doing it that way
 * means entering the same amount twice, on two screens, and remembering that
 * neither is income and neither is spending. Miss the marking on either one
 * and the month gains income that was never earned or spending that never
 * happened.
 *
 * So it is one entry and two ordinary postings. Nothing records that they
 * arrived together: afterwards the account reads exactly as it would had each
 * been typed on its own, which is what the bank statement will show.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import { handleLapsedError } from '@/lib/lapsedError';
import { readAmount, toMoney } from '@/lib/bankAmount';
import {
  customFetch,
  useCreateDeposit,
  useCreateDisbursement,
  useGetGroup,
  useGetJointAccounts,
} from '@workspace/api-client-react';

type Party = {
  id: number;
  name: string;
  kind?: string | null;
  owedToUs?: number | null;
  owedByUs?: number | null;
};

type Account = { id: number; name: string };

function formatKES(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PassThroughScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Account[];
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Party[]>('/api/contributors'),
    staleTime: 30_000,
  });

  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();

  const [date, setDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [payerId, setPayerId] = useState<number | null>(null);
  const [payeeId, setPayeeId] = useState<number | null>(null);
  const [showPayer, setShowPayer] = useState(false);
  const [showPayee, setShowPayee] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Anybody can stand on either side. Restricting the payer to people who
  // already owe you would rule out the case where the arrangement is the whole
  // reason they are being recorded at all.
  const payer = parties.find((party) => party.id === payerId) ?? null;
  const payee = parties.find((party) => party.id === payeeId) ?? null;
  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const parsedAmount = useMemo(() => (amount.trim() === '' ? null : readAmount(amount)), [amount]);

  const save = async () => {
    if (!activeAccountId) {
      Alert.alert('Which account?', 'Choose the account the money passed through.');
      return;
    }
    if (!payer || !payee) {
      Alert.alert('Who paid whom?', 'Pick the one paying and the one being paid.');
      return;
    }
    if (payer.id === payee.id) {
      // Somebody paying themselves through your account is not a thing, and
      // the two balance changes would fight over the same row.
      Alert.alert('They are the same person', 'Pick two different people.');
      return;
    }
    if (parsedAmount === null || parsedAmount <= 0) {
      Alert.alert('How much?', 'Enter an amount, with up to two decimal places.');
      return;
    }
    const total = toMoney(parsedAmount);
    const narration = note.trim() || `${payer.name} to ${payee.name}`;

    setSaving(true);
    try {
      // In first, out second, in the order it happened. If the second fails,
      // what stands is a repayment that really did reach the account — true,
      // and correctable — rather than a payment made from money never received.
      await createDeposit({
        data: {
          amount: total,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          settlesContributorId: payer.id,
          accountId: activeAccountId,
        },
      });
      await createDisbursement({
        data: {
          amount: total,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          accountId: activeAccountId,
          // Not spending: the money was never yours to spend. It is the same
          // reasoning as lending, and it keeps the pair out of the month's
          // figures on both sides rather than only one.
          isLending: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['joint-account'] });

      const owedToUs = typeof payer.owedToUs === 'number' ? payer.owedToUs : 0;
      const owedByUs = typeof payee.owedByUs === 'number' ? payee.owedByUs : 0;
      const payerLeft = Math.max(0, toMoney(owedToUs - total));
      const payeeLeft = Math.max(0, toMoney(owedByUs - total));
      Alert.alert(
        'Update both balances?',
        `· ${payer.name}: owes you ${formatKES(owedToUs)} → ${formatKES(payerLeft)}\n` +
          `· ${payee.name}: you owe ${formatKES(owedByUs)} → ${formatKES(payeeLeft)}\n\n` +
          'Both postings are saved either way.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => router.back() },
          {
            text: 'Update',
            onPress: async () => {
              try {
                await customFetch(`/api/contributors/${payer.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ owedToUs: payerLeft }),
                });
                await customFetch(`/api/contributors/${payee.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ owedByUs: payeeLeft }),
                });
                await queryClient.invalidateQueries({ queryKey: ['parties'] });
              } catch (error: unknown) {
                Alert.alert('Some balances did not update', error instanceof Error ? error.message : 'Please try again.');
              } finally {
                router.back();
              }
            },
          },
        ],
      );
    } catch (error: unknown) {
      if (!handleLapsedError(error)) {
        Alert.alert('Could not record it', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const partyPicker = (
    which: 'payer' | 'payee',
    open: boolean,
    setOpen: (value: boolean) => void,
    chosen: Party | null,
    onPick: (id: number) => void,
  ) => (
    <>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        testID={`pass-through-${which}`}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}
      >
        <Text style={{ color: chosen ? colors.foreground : colors.mutedForeground }}>
          {chosen?.name ?? (which === 'payer' ? 'Who is paying' : 'Who is being paid')}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open ? (
        <View style={[styles.dropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
          {parties.length === 0 ? (
            <Text style={{ color: colors.dropdownMutedForeground, padding: 14, fontSize: 12 }}>
              Nobody recorded yet. Add them under Settings, then Creditors and debtors.
            </Text>
          ) : (
            parties.map((party) => (
              <TouchableOpacity
                key={`${which}-${party.id}`}
                style={[styles.option, { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }]}
                onPress={() => { onPick(party.id); setOpen(false); }}
                testID={`pass-through-${which}-${party.id}`}
              >
                <Text style={{ color: colors.dropdownForeground, flexShrink: 1 }}>{party.name}</Text>
                <Text style={{ color: colors.dropdownMutedForeground, fontSize: 12 }}>
                  {which === 'payer'
                    ? `owes you KES ${formatKES(party.owedToUs ?? 0)}`
                    : `you owe KES ${formatKES(party.owedByUs ?? 0)}`}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}
    </>
  );

  return (
    <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} testID="pass-through-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Paid through your account</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Somebody who owes you settling with somebody you owe, their money passing through your account on the way. Two
        debts fall, and your balance ends where it started.
      </Text>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Who is paying</Text>
      {partyPicker('payer', showPayer, setShowPayer, payer, setPayerId)}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Who is being paid</Text>
      {partyPicker('payee', showPayee, setShowPayee, payee, setPayeeId)}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="e.g. 6000, or 4000+2000"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        testID="pass-through-amount"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
      />

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
      <Pressable onPress={() => setShowDatePicker(true)} testID="pass-through-date" style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}>
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
            onPress={() => setAccountId(candidate.id)}
            testID={`pass-through-account-${candidate.id}`}
            style={[
              styles.field,
              {
                borderColor: activeAccountId === candidate.id ? colors.primary : colors.border,
                backgroundColor: activeAccountId === candidate.id ? `${colors.primary}18` : colors.card,
              },
            ]}
          >
            <Text style={{ color: colors.foreground }}>{candidate.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Note (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What it was for"
        placeholderTextColor={colors.mutedForeground}
        testID="pass-through-note"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
      />

      {payer && payee && parsedAmount !== null && parsedAmount > 0 ? (
        <View style={[styles.preview, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]} testID="pass-through-preview">
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
            KES {formatKES(toMoney(parsedAmount))} in from {payer.name}, straight out to {payee.name}.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
            Your balance ends where it started. Neither half counts as income or spending — the money was never yours.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => void save()}
        disabled={saving}
        testID="pass-through-save"
        style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }}>Record both postings</Text>
        )}
      </TouchableOpacity>
    </PageScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46, fontFamily: 'Inter_400Regular' },
  dropdown: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: 6 },
  option: { paddingHorizontal: 14, paddingVertical: 11 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 18 },
  save: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, height: 50, marginTop: 18 },
});
