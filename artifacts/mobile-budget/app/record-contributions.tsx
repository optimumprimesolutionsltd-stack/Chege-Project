import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, useCreateJointAccount } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { handleLapsedError } from '@/lib/lapsedError';

type Contributor = { id: number; name: string; hasAccount: boolean; monthlyTarget: number | null };
type BankAccount = { id: number; name: string };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 0 });

export default function RecordContributionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: contributors = [], isLoading } = useQuery<Contributor[]>({
    queryKey: ['contributors'],
    queryFn: () => customFetch('/api/contributors'),
    retry: false,
  });
  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['joint-accounts'],
    queryFn: () => customFetch('/api/joint-accounts'),
    retry: false,
  });

  const [accountId, setAccountId] = useState<number | null>(null);
  useEffect(() => {
    setAccountId((current) =>
      current != null && accounts.some((account) => account.id === current) ? current : accounts[0]?.id ?? null,
    );
  }, [accounts]);

  const createBankAccount = useCreateJointAccount();
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const handleAddAccount = async () => {
    const name = newAccountName.trim();
    if (!name) {
      Alert.alert('Account name required', 'Enter a name for this bank account.');
      return;
    }
    try {
      const created = await createBankAccount.mutateAsync({ data: { name } });
      setAccountId(created.id);
      setNewAccountName('');
      setAddingAccount(false);
      await queryClient.invalidateQueries({ queryKey: ['joint-accounts'] });
    } catch (error) {
      Alert.alert('Could not add account', error instanceof Error ? error.message : 'Check the name and try again.');
    }
  };

  const now = useMemo(() => new Date(), []);
  // The one date field. The month a record counts toward is this date's month —
  // there is no separate month picker to disagree with it.
  const [dateReceived, setDateReceived] = useState(ymd(now));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const todayStr = ymd(now);
  const earliestDate = `${now.getFullYear() - 3}-01-01`;
  const received = new Date(`${dateReceived}T00:00:00`);
  const month = received.getMonth() + 1;
  const year = received.getFullYear();
  const countsToward = `${MONTHS[month - 1]} ${year}`;

  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [each, setEach] = useState('');
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  // Which contributor ids we have already folded into `ticked`. Without this,
  // any background refetch of the list (window focus, staleness, or the
  // refetch right after adding a name) hands back a new array and re-ticks
  // everyone — silently undoing a deselection the treasurer just made. That
  // bites hardest in Advanced mode, where they linger typing amounts.
  const seenContributorIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    setTicked((previous) => {
      const next = new Set<number>();
      for (const contributor of contributors) {
        // Newly appeared names start ticked (the common case); everyone else
        // keeps whatever the treasurer last set.
        if (!seenContributorIds.current.has(contributor.id) || previous.has(contributor.id)) {
          next.add(contributor.id);
        }
      }
      return next;
    });
    seenContributorIds.current = new Set(contributors.map((contributor) => contributor.id));
    const common = contributors.find((contributor) => contributor.monthlyTarget)?.monthlyTarget;
    if (common && !each) setEach(String(common));
  }, [contributors]);

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set synchronously the instant a record starts, so a fast double-tap or a
  // second tap during the network round-trip cannot fire a second deposit -
  // React state alone re-renders a frame too late to stop it.
  const submittingRef = useRef(false);

  const toggle = (id: number) =>
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Same amount / Per person are two views of one intent, not separate forms.
  // Switching to Per person fills each ticked row from the flat figure (or the
  // person's target); switching back collapses to that figure when every
  // ticked row already agrees. `amounts` is kept across switches, so a round
  // trip never loses per-person edits.
  const switchMode = (next: 'simple' | 'advanced') => {
    if (next === mode) return;
    if (next === 'advanced') {
      setAmounts((previous) => {
        const flat = Number(each);
        const flatSeed = Number.isFinite(flat) && flat > 0 ? String(flat) : '';
        const seeded = { ...previous };
        for (const contributor of contributors) {
          if (!ticked.has(contributor.id) || seeded[contributor.id]) continue;
          const seed = flatSeed || (contributor.monthlyTarget ? String(contributor.monthlyTarget) : '');
          if (seed) seeded[contributor.id] = seed;
        }
        return seeded;
      });
    } else {
      const values = contributors
        .filter((contributor) => ticked.has(contributor.id))
        .map((contributor) => Number(amounts[contributor.id]))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (values.length > 0 && values.every((value) => value === values[0])) {
        setEach(String(values[0]));
      }
    }
    setMode(next);
  };

  const amountFor = (contributor: Contributor): number => {
    if (mode === 'advanced') {
      const typed = Number(amounts[contributor.id]);
      return Number.isFinite(typed) && typed > 0 ? typed : 0;
    }
    const flat = Number(each);
    return Number.isFinite(flat) && flat > 0 ? flat : 0;
  };

  const chosen = contributors.filter((contributor) => ticked.has(contributor.id));
  const total = chosen.reduce((sum, contributor) => sum + amountFor(contributor), 0);

  const addContributor = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await customFetch('/api/contributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setNewName('');
      await queryClient.invalidateQueries({ queryKey: ['contributors'] });
    } catch {
      Alert.alert('Could not add', 'That name was not added.');
    } finally {
      setAdding(false);
    }
  };

  const record = () => {
    if (submittingRef.current || saving) return;
    if (contributors.length < 2) {
      Alert.alert('Add at least two names', 'A shared group records for a group. Add another contributor first.');
      return;
    }
    if (accountId == null) {
      Alert.alert('No bank account yet', 'Contributions need somewhere to land. Set up a bank account on the Bank tab first.');
      return;
    }
    if (!dateReceived || dateReceived < earliestDate || dateReceived > todayStr) {
      Alert.alert('Pick the date received', 'Choose the day the money came in — that is the month it counts toward.');
      return;
    }
    if (chosen.length === 0) {
      Alert.alert('Nobody ticked', 'Tick at least one person who paid.');
      return;
    }
    if (mode === 'simple' && !(Number(each) > 0)) {
      Alert.alert('Enter the amount', 'Type what each person paid in the Each (KES) box.');
      return;
    }
    const splits = chosen
      .map((contributor) => ({ contributorId: contributor.id, amount: amountFor(contributor) }))
      .filter((split) => split.amount > 0);
    if (splits.length === 0) {
      Alert.alert('No amounts entered', 'Enter what each ticked person paid, or untick anyone who paid nothing.');
      return;
    }

    // Confirm before it becomes money in the record. Nothing here is undone by
    // tapping again, so the tap has to be deliberate.
    const amount = splits.reduce((sum, split) => sum + split.amount, 0);
    const accountName = accounts.find((account) => account.id === accountId)?.name;
    Alert.alert(
      `Record KES ${kes(amount)}?`,
      `${splits.length} ${splits.length === 1 ? 'person' : 'people'}${accountName ? ` · into ${accountName}` : ''} for ${countsToward}. This adds one bank deposit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record', onPress: () => void submitRecord(splits, amount) },
      ],
    );
  };

  const submitRecord = async (
    splits: Array<{ contributorId: number; amount: number }>,
    amount: number,
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      await customFetch('/api/joint-account/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: `Contributions for ${MONTHS[month - 1]} ${year}`,
          date: dateReceived,
          accountId,
          contributorSplits: splits,
        }),
      });
      await queryClient.invalidateQueries();
      // Leave the guard set: the screen is closing, and resetting it opens a
      // window where the sheet is still on screen and a second tap fires a
      // second deposit.
      router.back();
    } catch (error) {
      submittingRef.current = false;
      setSaving(false);
      if (!handleLapsedError(error)) {
        Alert.alert('Could not record', error instanceof Error ? error.message : 'Nothing has been changed.');
      }
    }
  };

  const canRecord = !saving && total > 0 && contributors.length >= 2 && accountId != null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Record contributions</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bank account */}
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.foreground }]}>Bank account</Text>
          {accounts.length === 0 && !addingAccount ? (
            <Text style={[styles.notice, { borderColor: colors.border, color: colors.mutedForeground }]}>
              No bank account yet. Contributions need somewhere to land.
            </Text>
          ) : accounts.length === 1 && !addingAccount ? (
            <Text style={{ color: colors.mutedForeground }}>Goes to <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{accounts[0].name}</Text></Text>
          ) : !addingAccount ? (
            <View style={styles.chips}>
              {accounts.map((account) => {
                const on = account.id === accountId;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => setAccountId(account.id)}
                    style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : 'transparent' }]}
                  >
                    <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>{account.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {addingAccount ? (
            <View style={styles.row}>
              <TextInput
                autoFocus
                value={newAccountName}
                onChangeText={setNewAccountName}
                placeholder="e.g. Family M-Pesa"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => void handleAddAccount()}
                style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.foreground }]}
              />
              <Pressable
                onPress={() => void handleAddAccount()}
                disabled={createBankAccount.isPending || !newAccountName.trim()}
                style={[styles.addBtn, { borderColor: colors.border, opacity: createBankAccount.isPending || !newAccountName.trim() ? 0.5 : 1 }]}
              >
                {createBankAccount.isPending ? <ActivityIndicator size="small" color={colors.foreground} /> : <Feather name="check" size={16} color={colors.foreground} />}
              </Pressable>
              <Pressable onPress={() => { setAddingAccount(false); setNewAccountName(''); }} hitSlop={8} style={{ padding: 10 }}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setAddingAccount(true)} style={styles.addAccountLink} hitSlop={6}>
              <Feather name="plus-circle" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                {accounts.length === 0 ? 'Add a bank account' : 'Add another account'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Date received — the month it counts toward comes from this */}
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.foreground }]}>Date received *</Text>
          <Pressable onPress={() => setShowDatePicker(true)} style={[styles.field, { borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground }}>{dateReceived}</Text>
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>Counts toward {countsToward}</Text>
        </View>

        {showDatePicker && (
          <DateTimePicker
            mode="date"
            value={new Date(`${dateReceived}T12:00:00`)}
            minimumDate={new Date(`${earliestDate}T00:00:00`)}
            maximumDate={now}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (Platform.OS !== 'ios') setShowDatePicker(false);
              if (selected) setDateReceived(ymd(selected));
            }}
          />
        )}

        {/* Mode */}
        <View style={styles.chips}>
          {(['simple', 'advanced'] as const).map((option) => {
            const on = mode === option;
            return (
              <Pressable
                key={option}
                onPress={() => switchMode(option)}
                style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : 'transparent' }]}
              >
                <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
                  {option === 'simple' ? 'Same amount' : 'Per person'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>
          {mode === 'simple'
            ? 'Everyone paid the same amount — type it once below. Switching to Per person fills every row with it.'
            : 'Each row starts from the same-amount figure. Change the ones that differ, or clear a row for someone who paid nothing.'}
        </Text>

        {mode === 'simple' && (
          <View style={styles.block}>
            <Text style={[styles.label, { color: colors.foreground }]}>Each (KES)</Text>
            <TextInput
              value={each}
              onChangeText={setEach}
              keyboardType="number-pad"
              placeholder="e.g. 1000"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
        )}

        {/* Contributors */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : contributors.length < 2 ? (
          <Text style={[styles.notice, { borderColor: colors.border, color: colors.mutedForeground }]}>
            {contributors.length === 0
              ? 'Nobody to record yet. Add the people who contribute below — they do not need the app.'
              : 'Add at least one more name below. A shared group records for a group.'}
          </Text>
        ) : (
          <View style={[styles.list, { borderColor: colors.border }]}>
            {contributors.map((contributor, index) => {
              const on = ticked.has(contributor.id);
              return (
                <View
                  key={contributor.id}
                  style={[styles.member, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <Pressable onPress={() => toggle(contributor.id)} hitSlop={8} style={styles.check}>
                    <Feather
                      name={on ? 'check-square' : 'square'}
                      size={20}
                      color={on ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                  <Text style={[styles.memberName, { color: on ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                    {contributor.name}
                  </Text>
                  {mode === 'advanced' ? (
                    <TextInput
                      value={amounts[contributor.id] ?? ''}
                      onChangeText={(text) => setAmounts((previous) => ({ ...previous, [contributor.id]: text }))}
                      editable={on}
                      keyboardType="number-pad"
                      placeholder={contributor.monthlyTarget ? String(contributor.monthlyTarget) : '0'}
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground, opacity: on ? 1 : 0.4 }]}
                    />
                  ) : (
                    <Text style={{ color: on ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                      {on && amountFor(contributor) > 0 ? `KES ${kes(amountFor(contributor))}` : '—'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Add someone */}
        <View style={styles.row}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Add someone by name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.foreground }]}
          />
          <Pressable
            onPress={() => void addContributor()}
            disabled={adding || !newName.trim()}
            style={[styles.addBtn, { borderColor: colors.border, opacity: adding || !newName.trim() ? 0.5 : 1 }]}
          >
            <Feather name="user-plus" size={16} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{adding ? 'Adding…' : 'Add'}</Text>
          </Pressable>
        </View>

        <View style={[styles.totalBar, { backgroundColor: colors.muted }]}>
          <Text style={{ color: colors.mutedForeground }}>{chosen.length} of {contributors.length} ticked</Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>KES {kes(total)}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
        <Pressable
          onPress={record}
          disabled={!canRecord}
          style={[styles.recordBtn, { backgroundColor: colors.primary, opacity: canRecord ? 1 : 0.5 }]}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
            {saving ? 'Recording…' : `Record KES ${kes(total)}`}
          </Text>
        </Pressable>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  block: { gap: 6 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12 },
  input: { height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addAccountLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, paddingVertical: 4 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  modeHint: { fontSize: 12, lineHeight: 17, marginTop: -2 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  check: { width: 22 },
  memberName: { flex: 1, fontSize: 14 },
  amountInput: { width: 96, height: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, textAlign: 'right', fontSize: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  totalBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  recordBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
