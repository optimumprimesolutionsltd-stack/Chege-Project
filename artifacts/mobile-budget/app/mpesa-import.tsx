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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  customFetch,
  useCreateDeposit,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
} from '@workspace/api-client-react';
import { buildCategoryTree, filterCategoryTree, type CategoryRow } from '@workspace/category-tree';

import { BankAccountPicker } from '@/components/BankAccountPicker';
import { CategorySearchBox } from '@/components/CategorySearchBox';
import { PageScrollView } from '@/components/PageScrollReset';
import { ScreenHint } from '@/components/ScreenHint';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { formatExact } from '@/lib/formatExact';
import {
  buildPostings,
  initialChoices,
  isRecordable,
  lineLabel,
  problemWith,
  snippetFor,
  summarise,
  type Choice,
  type PreviewLine,
} from '@/lib/mpesaImport';

// Shared with the day of banking and the Bank form: a fee is the same expense every time.
const CHARGE_CATEGORY_KEY = 'jamvi:last-charge-category';

const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

type Outcome = { saved: number; repeats: number; failed: Array<{ what: string; why: string }> };

/** A category picked from the tree, in a sheet with a search box. */
function CategorySheet({
  visible,
  categories,
  onPick,
  onClose,
}: {
  visible: boolean;
  categories: CategoryRow[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const tree = useMemo(() => filterCategoryTree(buildCategoryTree(categories), search), [categories, search]);
  const pick = (name: string) => {
    setSearch('');
    onPick(name);
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What was it for?</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <CategorySearchBox value={search} onChange={setSearch} testID="mpesa-category-search" />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
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
            {tree.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>No category matches that.</Text>
            ) : null}
          </ScrollView>
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
  const { data: group } = useGetGroup();
  const isShared = group?.isPrivate === false;

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string }>;
  const { data: categoryList = [] } = useGetBudgetCategories();
  const categories = categoryList as unknown as CategoryRow[];
  const { mutateAsync: createDeposit } = useCreateDeposit();
  const { mutateAsync: createDisbursement } = useCreateDisbursement();

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // M-Pesa is usually its own account: start on one that says so.
  const guessedAccount = accounts.find((account) => /m-?pesa/i.test(account.name))?.id ?? accounts[0]?.id ?? null;
  const accountId = selectedAccountId ?? guessedAccount;
  const { data: account } = useGetJointAccount(accountId ? { accountId } : undefined);
  const history = useMemo(
    () => ((account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null }>),
    [account],
  );

  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [chargeCategory, setChargeCategory] = useState('');
  const [picking, setPicking] = useState<number | 'charge' | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CHARGE_CATEGORY_KEY).then((stored) => stored && setChargeCategory(stored)).catch(() => {});
  }, []);

  const readMessages = async () => {
    if (!text.trim()) {
      Alert.alert('Paste your messages', 'Copy them from your Messages app, then paste them here.');
      return;
    }
    setReading(true);
    try {
      const response = await customFetch<{ lines: PreviewLine[] }>('/api/mpesa/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      setLines(response.lines);
      setChoices(initialChoices(response.lines, history));
    } catch (error: unknown) {
      Alert.alert('Could not read them', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReading(false);
    }
  };

  const toggle = (index: number, include: boolean) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], include } }));

  const chooseCategory = (name: string) => {
    if (picking === 'charge') {
      setChargeCategory(name);
      AsyncStorage.setItem(CHARGE_CATEGORY_KEY, name).catch(() => {});
    } else if (picking !== null) {
      setChoices((current) => ({ ...current, [picking]: { ...current[picking], category: name } }));
    }
    setPicking(null);
  };

  const summary = useMemo(() => (lines ? summarise(lines, choices) : null), [lines, choices]);
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !chargeCategory.trim()) return 'Choose a category for the M-Pesa charges.';
    return null;
  }, [lines, choices, summary, chargeCategory]);

  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];

  const saveAll = async () => {
    if (!lines || !accountId || saving) return;
    if (firstProblem) {
      Alert.alert('Not quite ready', firstProblem);
      return;
    }
    setSaving(true);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
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
        });
        if (!built) continue;
        try {
          if (built.kind === 'deposit') {
            await createDeposit({ data: built.main as never });
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
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'It was not saved.';
          if (/already recorded/i.test(message)) result.repeats += 1;
          else result.failed.push({ what: item.description ?? 'A message', why: message });
        }
      }
    } finally {
      setSaving(false);
      setOutcome(result);
    }
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

      <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
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
              onPress={readMessages}
              disabled={reading}
              style={[styles.primary, { backgroundColor: colors.primary, opacity: reading ? 0.6 : 1 }]}
              accessibilityRole="button"
              testID="mpesa-import-read"
            >
              {reading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Read my messages</Text>}
            </Pressable>
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
                setChoices(initialChoices(lines, []));
              }}
              testIDPrefix="mpesa-import-account"
            />

            {summary ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-import-summary">
                <Text style={[styles.summaryLine, { color: colors.foreground }]}>
                  {summary.count} of {recordable.length} ready to save
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Money in KES {formatExact(summary.moneyIn)} · money out KES {formatExact(summary.moneyOut)}
                  {summary.fees > 0 ? ` · M-Pesa charges KES ${formatExact(summary.fees)}` : ''}
                </Text>
              </View>
            ) : null}

            {recordable.map((item) => {
              const choice = choices[item.index];
              const out = item.direction === 'out';
              return (
                <View key={item.index} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: choice?.include ? 1 : 0.55 }]} testID={`mpesa-line-${item.index}`}>
                  <View style={styles.lineTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.lineTitle, { color: colors.foreground }]} numberOfLines={2}>{item.description}</Text>
                      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                        {item.date ?? 'No date on it, so today'} · {out ? 'Money out' : 'Money in'}
                      </Text>
                      {item.named === false && snippetFor(text, item.receipt) ? (
                        <Text style={[styles.hint, { color: colors.mutedForeground, fontStyle: 'italic' }]} testID={`mpesa-line-snippet-${item.index}`}>
                          No name in the message: “{snippetFor(text, item.receipt)}…”
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.amount, { color: out ? colors.destructive : colors.success }]}>
                      {out ? '−' : '+'}{formatExact(item.amount ?? 0)}
                    </Text>
                    <Switch value={!!choice?.include} onValueChange={(value) => toggle(item.index, value)} accessibilityLabel={`Save ${item.description}`} />
                  </View>
                  {out && choice?.include ? (
                    <Pressable
                      onPress={() => setPicking(item.index)}
                      style={[styles.categoryButton, { borderColor: choice.category ? colors.border : colors.destructive, backgroundColor: colors.muted }]}
                      accessibilityRole="button"
                      testID={`mpesa-line-category-${item.index}`}
                    >
                      <Text style={{ color: choice.category ? colors.foreground : colors.destructive, fontFamily: 'Inter_600SemiBold' }}>
                        {choice.category || 'Choose what it was for'}
                      </Text>
                      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                    </Pressable>
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
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable onPress={() => { setLines(null); setChoices({}); }} style={styles.secondary} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Paste different messages</Text>
            </Pressable>
          </>
        )}
      </PageScrollView>

      {lines ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderColor: colors.border }]}>
          {firstProblem ? <Text style={[styles.hint, { color: colors.destructive, marginBottom: 6 }]}>{firstProblem}</Text> : null}
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

      <CategorySheet visible={picking !== null} categories={categories} onPick={chooseCategory} onClose={() => setPicking(null)} />
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
});
