import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

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

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const [dateReceived, setDateReceived] = useState(ymd(now));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  useEffect(() => {
    setDateReceived((current) => {
      if (current >= monthStart && current <= monthEnd) return current;
      const todayString = ymd(new Date());
      return todayString >= monthStart && todayString <= monthEnd ? todayString : monthStart;
    });
  }, [monthStart, monthEnd]);

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

  const monthOptions = useMemo(() => {
    const result: { month: number; year: number; label: string }[] = [];
    const date = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      result.push({ month: date.getMonth() + 1, year: date.getFullYear(), label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` });
      date.setMonth(date.getMonth() - 1);
    }
    return result;
  }, [now]);

  const toggle = (id: number) =>
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const record = async () => {
    if (contributors.length < 2) {
      Alert.alert('Add at least two names', 'A shared budget records for a group. Add another contributor first.');
      return;
    }
    if (accountId == null) {
      Alert.alert('No bank account yet', 'Contributions need somewhere to land. Set up a bank account on the Bank tab first.');
      return;
    }
    const splits = chosen
      .map((contributor) => ({ contributorId: contributor.id, amount: amountFor(contributor) }))
      .filter((split) => split.amount > 0);
    if (splits.length === 0) {
      Alert.alert('Nothing to record', 'Tick at least one person and enter an amount.');
      return;
    }

    setSaving(true);
    try {
      await customFetch('/api/joint-account/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: splits.reduce((sum, split) => sum + split.amount, 0),
          description: `Contributions for ${MONTHS[month - 1]} ${year}`,
          date: dateReceived,
          accountId,
          contributorSplits: splits,
        }),
      });
      await queryClient.invalidateQueries();
      router.back();
    } catch (error) {
      Alert.alert('Could not record', error instanceof Error ? error.message : 'Nothing has been changed.');
    } finally {
      setSaving(false);
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 16 }} keyboardShouldPersistTaps="handled">
        {/* Bank account */}
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.foreground }]}>Bank account</Text>
          {accounts.length === 0 ? (
            <Pressable onPress={() => router.push('/(tabs)/bank')} style={[styles.notice, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground }}>No bank account yet. Tap to set one up on the Bank tab.</Text>
            </Pressable>
          ) : accounts.length === 1 ? (
            <Text style={{ color: colors.mutedForeground }}>Goes to <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{accounts[0].name}</Text></Text>
          ) : (
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
          )}
        </View>

        {/* Month + date */}
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>Month</Text>
            <Pressable onPress={() => setMonthPickerVisible(true)} style={[styles.field, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground }}>{MONTHS[month - 1]} {year}</Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>Date received</Text>
            <Pressable onPress={() => setShowDatePicker(true)} style={[styles.field, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground }}>{dateReceived}</Text>
              <Feather name="calendar" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            mode="date"
            value={new Date(`${dateReceived}T12:00:00`)}
            minimumDate={new Date(`${monthStart}T00:00:00`)}
            maximumDate={new Date(`${monthEnd}T23:59:59`)}
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
                onPress={() => setMode(option)}
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
            ? 'Everyone paid the same amount — type it once below.'
            : 'Amounts differ per person, or someone paid nothing — set each one in their row.'}
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
              : 'Add at least one more name below. A shared budget records for a group.'}
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
          onPress={() => void record()}
          disabled={!canRecord}
          style={[styles.recordBtn, { backgroundColor: colors.primary, opacity: canRecord ? 1 : 0.5 }]}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
            {saving ? 'Recording…' : `Record KES ${kes(total)}`}
          </Text>
        </Pressable>
      </View>

      <Modal visible={monthPickerVisible} animationType="slide" transparent onRequestClose={() => setMonthPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMonthPickerVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Which month?</Text>
            <FlatList
              data={monthOptions}
              keyExtractor={(item) => `${item.year}-${item.month}`}
              style={{ flexGrow: 0 }}
              renderItem={({ item }) => {
                const selected = item.month === month && item.year === year;
                return (
                  <Pressable
                    onPress={() => { setMonth(item.month); setYear(item.year); setMonthPickerVisible(false); }}
                    style={[styles.modalItem, selected && { backgroundColor: `${colors.primary}18` }]}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.foreground, fontFamily: selected ? 'Inter_700Bold' : 'Inter_400Regular' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8 },
});
