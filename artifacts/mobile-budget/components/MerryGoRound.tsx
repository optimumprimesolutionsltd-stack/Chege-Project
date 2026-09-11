import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetJointAccountQueryKey, getGetJointAccountsQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useCollapsed } from '@/hooks/useCollapsed';
import { handleLapsedError } from '@/lib/lapsedError';

type PayoutMember = { id: number; name: string; timesReceived: number; lastRound: number | null };
type Payout = { id: number; roundNumber: number; contributorId: number; name: string; amount: number; date: string; note: string | null };
type PayoutsResponse = {
  enabled: boolean;
  payouts: Payout[];
  nextRound: number;
  totalPaidOut: number;
  members: PayoutMember[];
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => ymd(new Date());
const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

/**
 * Merry-go-round: the rotating payout a chama runs alongside contributions.
 * Off by default; a manager turns it on for this budget. Same shape as the
 * other contribution panels — a one-line summary that expands, and the
 * record-a-round form behind an Edit control with Save at the foot.
 */
export function MerryGoRound({ canManage = false }: { canManage?: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { open, toggle } = useCollapsed('merry-go-round');
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError } = useQuery<PayoutsResponse>({
    queryKey: ['payouts'],
    queryFn: () => customFetch<PayoutsResponse>('/api/payouts'),
    retry: false,
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      await customFetch('/api/contribution-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merryGoRoundEnabled: enabled }),
      });
    },
    onSuccess: (_result, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['contribution-settings'] });
      if (!enabled) setEditing(false);
      Alert.alert(enabled ? 'Merry-go-round turned on' : 'Merry-go-round turned off');
    },
    onError: () => Alert.alert('Could not change the setting', 'Please try again.'),
  });

  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');
  const resetForm = () => {
    setRecipientId(null);
    setAmount('');
    setDate(todayIso());
    setNote('');
  };

  const recordPayout = useMutation({
    mutationFn: async () =>
      customFetch<Payout & { name: string }>('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributorId: recipientId,
          amount: Math.round(Number(amount)),
          date,
          note: note.trim() || undefined,
        }),
      }),
    onSuccess: (payout) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['contribution-grid'] });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      resetForm();
      setEditing(false);
      Alert.alert(`Round ${payout.roundNumber} recorded`, `KES ${kes(payout.amount)} to ${payout.name}.`);
    },
    onError: (error) => {
      if (handleLapsedError(error)) return;
      Alert.alert('Could not record the payout', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const deletePayout = useMutation({
    mutationFn: async (id: number) => {
      await customFetch(`/api/payouts/${id}`, { method: 'DELETE', responseType: 'json' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['contribution-grid'] });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      Alert.alert('Round removed', 'The payout and its bank withdrawal were reversed.');
    },
    onError: (error) =>
      Alert.alert('Could not undo the round', error instanceof Error ? error.message : 'Please try again.'),
  });

  const confirmDeletePayout = (payout: Payout) =>
    Alert.alert(
      `Undo round ${payout.roundNumber}?`,
      `KES ${kes(payout.amount)} to ${payout.name}. This reverses the bank withdrawal too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo round', style: 'destructive', onPress: () => deletePayout.mutate(payout.id) },
      ],
    );

  if (isLoading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (isError || !data) return null;
  if (!data.enabled && !canManage) return null;

  if (!data.enabled) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headingRow}>
          <Feather name="refresh-cw" size={15} color={colors.primary} />
          <Text style={[styles.heading, { color: colors.foreground }]}>Merry-go-round</Text>
        </View>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          A rotating payout: each round the group pays one member from the joint account, until everyone has had a turn.
          Turn it on only if your group runs one — it stays off otherwise.
        </Text>
        <Pressable
          onPress={() => setEnabled.mutate(true)}
          disabled={setEnabled.isPending}
          style={[styles.button, { borderColor: colors.border }]}
          testID="enable-merry-go-round"
        >
          {setEnabled.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="power" size={15} color={colors.primary} />}
          <Text style={[styles.buttonText, { color: colors.primary }]}>Turn on for this budget</Text>
        </Pressable>
      </View>
    );
  }

  const waiting = data.members.filter((member) => member.timesReceived === 0).length;
  const summary =
    data.members.length === 0
      ? 'No members yet'
      : `Round ${data.nextRound} next · KES ${kes(data.totalPaidOut)} paid out · ${data.members.length - waiting} of ${data.members.length} have had a turn`;

  const submit = () => {
    if (!recipientId || !(Number(amount) > 0)) {
      Alert.alert('Pick a member and an amount above zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Enter the date as YYYY-MM-DD.');
      return;
    }
    recordPayout.mutate();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={styles.headerRow} onPress={toggle}>
        <View style={styles.headerText}>
          <View style={styles.headingRow}>
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.heading, { color: colors.foreground }]}>Merry-go-round</Text>
            {open && canManage && !editing ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  setEditing(true);
                }}
                hitSlop={8}
                testID="edit-merry-go-round"
              >
                <Feather name="edit-2" size={14} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>{summary}</Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>

      {!open ? null : (
        <>
          {data.members.length > 0 ? (
            <View style={styles.chips}>
              {data.members.map((member) => {
                const waitingTurn = member.timesReceived === 0;
                return (
                  <View
                    key={member.id}
                    style={[
                      styles.chip,
                      {
                        borderColor: waitingTurn ? colors.primary : colors.border,
                        backgroundColor: waitingTurn ? `${colors.primary}12` : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: waitingTurn ? colors.foreground : colors.mutedForeground }]}>
                      {member.name} {waitingTurn ? 'waiting' : `${member.timesReceived}×`}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {data.payouts.length > 0 ? (
            <View style={{ gap: 8 }}>
              {data.payouts.map((payout) => (
                <View key={payout.id} style={[styles.payoutRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payoutName, { color: colors.foreground }]}>
                      Round {payout.roundNumber} · {payout.name}
                    </Text>
                    <Text style={[styles.payoutMeta, { color: colors.mutedForeground }]}>
                      {payout.date}
                      {payout.note ? ` · ${payout.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.payoutAmount, { color: colors.foreground }]}>KES {kes(payout.amount)}</Text>
                  {editing && canManage ? (
                    <Pressable
                      onPress={() => confirmDeletePayout(payout)}
                      disabled={deletePayout.isPending}
                      hitSlop={8}
                      style={{ marginLeft: 8 }}
                      testID={`delete-payout-${payout.id}`}
                    >
                      <Feather name="trash-2" size={15} color="#ef4444" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <View style={[styles.totalRow, { borderColor: colors.border }]}>
                <Text style={[styles.payoutName, { color: colors.foreground }]}>Paid out</Text>
                <Text style={[styles.payoutAmount, { color: colors.foreground }]}>KES {kes(data.totalPaidOut)}</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>No rounds recorded yet.</Text>
          )}

          {editing ? (
            <View style={[styles.form, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Pay round {data.nextRound} to</Text>
              <View style={styles.recipientWrap}>
                {data.members.map((member) => {
                  const selected = recipientId === member.id;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => setRecipientId(member.id)}
                      style={[
                        styles.recipient,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? `${colors.primary}12` : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[styles.recipientText, { color: colors.foreground }]}>
                        {member.name}
                        {member.timesReceived > 0 ? ` · had ${member.timesReceived}` : ' · not yet'}
                      </Text>
                      {selected ? <Feather name="check" size={13} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Amount (KES)</Text>
                  <TextInput
                    value={amount}
                    onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    testID="payout-amount"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Date</Text>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    style={[styles.input, styles.dateField, { borderColor: colors.border }]}
                    testID="payout-date"
                  >
                    <Text style={{ color: colors.foreground, fontSize: 14 }}>{date}</Text>
                    <Feather name="calendar" size={15} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  mode="date"
                  value={new Date(`${date}T12:00:00`)}
                  maximumDate={new Date()}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (selected) setDate(ymd(selected));
                  }}
                />
              )}

              <Text style={[styles.label, { color: colors.foreground }]}>Note (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={200}
                placeholder="e.g. paid via M-Pesa"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              />

              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Saving records round {data.nextRound} and takes {amount ? `KES ${kes(Number(amount))}` : 'the amount'} out of the joint account.
              </Text>
              <View style={styles.actions}>
                <Pressable onPress={() => { resetForm(); setEditing(false); }} disabled={recordPayout.isPending} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={recordPayout.isPending}
                  style={[styles.recordBtn, { backgroundColor: colors.primary, opacity: recordPayout.isPending ? 0.6 : 1 }]}
                  testID="record-payout"
                >
                  {recordPayout.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
                  <Text style={[styles.recordBtnText, { color: colors.primaryForeground }]}>Save round {data.nextRound}</Text>
                </Pressable>
              </View>
            </View>
          ) : canManage ? (
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Turn off the merry-go-round?',
                  'The rounds already recorded stay. You can turn it back on later.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Turn off', style: 'destructive', onPress: () => setEnabled.mutate(false) },
                  ],
                )
              }
              testID="disable-merry-go-round"
            >
              <Text style={[styles.turnOff, { color: colors.mutedForeground }]}>Turn off the merry-go-round</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 17 },
  body: { fontSize: 13, lineHeight: 19 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  recipientWrap: { gap: 6 },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    minHeight: 38,
  },
  recipientText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fieldRow: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 4 },
  input: {
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
  },
  recordBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  payoutName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  payoutMeta: { fontSize: 11, marginTop: 2 },
  payoutAmount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    paddingTop: 8,
  },
  turnOff: { fontSize: 11, textDecorationLine: 'underline' },
});
