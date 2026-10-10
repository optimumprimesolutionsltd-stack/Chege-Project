import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useColors } from '@/hooks/useColors';
import { incomeAnswers, mayBeOwnAccount, ownByNumber, type Known, type TeachRegular } from '@/lib/teachJamvi';

type Account = { id: number; name: string; accountNumber?: string | null };
type Named = { id: number; name: string };

/** The answer for a regular that is one of the person's own accounts. */
export type OwnAccountAnswer =
  | { accountId: number }
  | { name: string; businessId: number | null; newBusinessName?: string };

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;

/** How many answers a list shows before "Other…": the likeliest, at a glance. */
const SHOWN = 3;

function question(group: TeachRegular): string {
  if (group.direction === 'in') return `What is the money from ${group.label}?`;
  if (group.kind === 'person') return `Who is ${group.label} to you?`;
  if (group.kind === 'bank') return 'What is this account?';
  return `What do you pay ${group.label} for?`;
}

/**
 * Teach Jamvi your M-Pesa (lib/teachJamvi): what Jamvi already filed by
 * itself, then the regulars only the person can name, one at a time. Each
 * answer files every line of that payee now and every message from it later.
 */
export function TeachJamviCard<G extends TeachRegular>({
  groups,
  known,
  intro,
  answered,
  suggestions,
  incomeSources,
  accounts,
  businesses,
  onCategory,
  onPickCategory,
  onSource,
  onOwnAccount,
  onSkip,
  onClose,
  doneText,
  guess,
  onDebt,
}: {
  groups: G[];
  /** What Jamvi filed by itself in this read; left out for saved history. */
  known?: Known | null;
  /** A line in place of `known`, for saved history. */
  intro?: string;
  /** Regulars answered so far in this read. */
  answered: number;
  /** Categories to offer first for a regular (lib/teachJamvi suggestedCategories). */
  suggestions: (group: G) => string[];
  incomeSources: Named[];
  accounts: Account[];
  businesses: Named[];
  onCategory: (group: G, category: string) => void;
  onPickCategory: (group: G) => void;
  onSource: (group: G, incomeSourceId: number) => void;
  onOwnAccount: (group: G, answer: OwnAccountAnswer) => Promise<void>;
  onSkip: (group: G) => void;
  onClose: () => void;
  /** What to say once every regular is answered. */
  doneText?: string;
  /** Jamvi's own guess at the income stream for money in, put first. */
  guess?: (group: G) => number | null;
  /** Money in that is a loan, or a debt being paid back (Who owes who). Left out where it cannot be recorded. */
  onDebt?: (group: G, kind: 'borrowed' | 'repaid') => Promise<void>;
}) {
  const colors = useColors();
  const group = groups[0] ?? null;
  const [ownOpen, setOwnOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [businessId, setBusinessId] = useState<number | null | 'new'>(null);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Other…" opened on a list of answers.
  const [moreOf, setMoreOf] = useState<{ income: boolean; sales: boolean }>({ income: false, sales: false });

  // A new regular starts with the own-account panel folded and its name suggested.
  useEffect(() => {
    setOwnOpen(false);
    setMoreOf({ income: false, sales: false });
    setNewName(group ? `${group.label} ${group.reference}`.trim() : '');
    setBusinessId(null);
    setNewBusinessName('');
    setError(null);
  }, [group?.key]);

  const chip = (label: string, onPress: () => void, testID: string, icon?: keyof typeof Feather.glyphMap, strong = false) => (
    <Pressable
      key={testID}
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.primary, backgroundColor: strong ? colors.primary : `${colors.primary}10`, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {icon ? <Feather name={icon} size={13} color={strong ? colors.primaryForeground : colors.primary} /> : null}
      <Text style={[styles.chipText, { color: strong ? colors.primaryForeground : colors.primary }]}>{label}</Text>
    </Pressable>
  );

  const saveOwn = async (answer: OwnAccountAnswer) => {
    if (!group) return;
    setSaving(true);
    setError(null);
    try {
      await onOwnAccount(group, answer);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the account. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // Accounts this number could be: one with no number yet, or this very number.
  // A payer with no number (a bank paying in) can be any of them.
  const linkable = group ? accounts.filter((account) => {
    if (!ownByNumber(group)) return true;
    const digits = (account.accountNumber ?? '').replace(/\D/g, '');
    return !digits || digits === group.reference;
  }) : [];
  // Money in: the person's own streams apart from their businesses' sales,
  // best guess first (lib/teachJamvi incomeAnswers).
  const answers = group && group.direction === 'in'
    ? incomeAnswers(group.label, incomeSources, businesses, guess?.(group) ?? null)
    : { income: [], sales: [] };
  const section = (title: string, children: React.ReactNode, testID: string, hint?: string) => (
    <View style={styles.section} testID={testID}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {hint ? <Text style={[styles.payeeMeta, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      <View style={styles.chips}>{children}</View>
    </View>
  );
  const listOf = <T extends Named>(list: T[], open: boolean, which: 'income' | 'sales', make: (one: T) => React.ReactNode) => [
    ...(open ? list : list.slice(0, SHOWN)).map(make),
    ...(!open && list.length > SHOWN
      ? [chip(`Other… (${list.length - SHOWN})`, () => setMoreOf((current) => ({ ...current, [which]: true })), `teach-jamvi-more-${which}`, 'chevron-down')]
      : []),
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="teach-jamvi">
      <View style={styles.headRow}>
        <Text style={[styles.kicker, { color: colors.primary }]}>TEACH JAMVI YOUR M-PESA</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Later" testID="teach-jamvi-later">
          <Text style={[styles.link, { color: colors.mutedForeground }]}>Later</Text>
        </Pressable>
      </View>

      {intro ? (
        <Text style={[styles.known, { color: colors.mutedForeground }]} testID="teach-jamvi-intro">{intro}</Text>
      ) : null}
      {known && known.filed > 0 ? (
        <Text style={[styles.known, { color: colors.mutedForeground }]} testID="teach-jamvi-known">
          Jamvi filed {known.filed} of {known.of} by itself: {known.parts.map((part) => `${part.label} ${part.count}`).join(' · ')}.
        </Text>
      ) : null}

      {group ? (
        <>
          <Text style={[styles.lead, { color: colors.foreground }]}>
            {answered === 0
              ? `Tell it about your ${groups.length === 1 ? 'regular' : `${groups.length} regulars`} once, and their messages file themselves from now on.`
              : `${groups.length} to go.`}
          </Text>
          <View style={[styles.payee, { borderColor: colors.border, backgroundColor: colors.background }]} testID="teach-jamvi-payee">
            <Text style={[styles.payeeName, { color: colors.foreground }]} numberOfLines={2}>
              {group.label}{group.reference ? ` · ${group.reference}` : ''}
            </Text>
            <Text style={[styles.payeeMeta, { color: colors.mutedForeground }]}>
              {group.direction === 'in' ? 'Received' : 'Paid'} {group.count} times · {kes(group.total)}
            </Text>
            <Text style={[styles.question, { color: colors.foreground }]}>{question(group)}</Text>

            {group.direction === 'out' ? (
              <View style={styles.chips}>
                {suggestions(group).map((name) => chip(name, () => onCategory(group, name), `teach-jamvi-category-${name}`))}
                {mayBeOwnAccount(group) ? chip('My own account', () => setOwnOpen((open) => !open), 'teach-jamvi-own', 'credit-card') : null}
                {chip('Pick a category…', () => onPickCategory(group), 'teach-jamvi-pick', 'list')}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {/* Not income first: money moving between your own places, or borrowed, or paid back. */}
                {mayBeOwnAccount(group) || onDebt ? section('NOT INCOME', [
                  ...(mayBeOwnAccount(group) ? [chip('From my own account', () => setOwnOpen((open) => !open), 'teach-jamvi-own', 'credit-card')] : []),
                  ...(onDebt ? [
                    chip('A loan to me', () => void onDebt(group, 'borrowed'), 'teach-jamvi-debt-borrowed', 'arrow-down-left'),
                    chip('Someone paying me back', () => void onDebt(group, 'repaid'), 'teach-jamvi-debt-repaid', 'corner-down-left'),
                  ] : []),
                ], 'teach-jamvi-not-income') : null}
                {answers.income.length > 0 ? section('YOUR INCOME', listOf(answers.income, moreOf.income, 'income',
                  (source) => chip(source.name, () => onSource(group, source.id), `teach-jamvi-source-${source.id}`)), 'teach-jamvi-income') : null}
                {answers.sales.length > 0 ? section("A BUSINESS'S SALES", listOf(answers.sales, moreOf.sales, 'sales',
                  (business) => chip(business.name, () => onSource(group, business.id), `teach-jamvi-sales-${business.id}`, 'briefcase')),
                  'teach-jamvi-sales', 'A customer paying one of your businesses. Your pay from a business is under Your income.') : null}
              </View>
            )}

            {ownOpen ? (
              <View style={[styles.own, { borderColor: colors.border }]} testID="teach-jamvi-own-panel">
                <Text style={[styles.payeeMeta, { color: colors.mutedForeground }]}>
                  {ownByNumber(group)
                    ? `Money to and from account ${group.reference} will count as moving your own money: not spending, not income.`
                    : `Money from ${group.label} will count as moving your own money into M-Pesa: not income.`}
                </Text>
                {linkable.length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: colors.foreground }]}>It is one I already have</Text>
                    <View style={styles.chips}>
                      {linkable.map((account) => chip(account.name, () => void saveOwn({ accountId: account.id }), `teach-jamvi-own-account-${account.id}`))}
                    </View>
                  </>
                ) : null}
                <Text style={[styles.label, { color: colors.foreground }]}>{linkable.length > 0 ? 'Or add it' : 'Add it'}</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Name it, such as KCB savings"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  testID="teach-jamvi-own-name"
                />
                <Text style={[styles.label, { color: colors.foreground }]}>Whose is it?</Text>
                <View style={styles.chips}>
                  {chip('Mine', () => setBusinessId(null), 'teach-jamvi-own-personal', undefined, businessId === null)}
                  {businesses.map((business) => chip(business.name, () => setBusinessId(business.id), `teach-jamvi-own-business-${business.id}`, 'briefcase', businessId === business.id))}
                  {chip('A business of mine…', () => setBusinessId('new'), 'teach-jamvi-own-business-new', 'plus', businessId === 'new')}
                </View>
                {businessId === 'new' ? (
                  <TextInput
                    value={newBusinessName}
                    onChangeText={setNewBusinessName}
                    placeholder="The business's name"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                    testID="teach-jamvi-own-business-name"
                  />
                ) : null}
                <Pressable
                  onPress={() => {
                    if (!newName.trim()) { setError('Give the account a name.'); return; }
                    if (businessId === 'new' && !newBusinessName.trim()) { setError("Give the business a name."); return; }
                    void saveOwn(businessId === 'new'
                      ? { name: newName.trim(), businessId: null, newBusinessName: newBusinessName.trim() }
                      : { name: newName.trim(), businessId });
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  testID="teach-jamvi-own-save"
                  style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                >
                  {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
                    <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Add account</Text>
                  )}
                </Pressable>
                {error ? <Text style={[styles.payeeMeta, { color: colors.destructive }]}>{error}</Text> : null}
              </View>
            ) : null}

            <Pressable onPress={() => onSkip(group)} accessibilityRole="button" testID="teach-jamvi-skip" style={styles.skip} hitSlop={8}>
              <Text style={[styles.link, { color: colors.mutedForeground }]}>
                {group.direction === 'in' ? 'Not income, or it varies: skip' : 'It varies: skip'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={[styles.lead, { color: colors.foreground }]} testID="teach-jamvi-done">
          {doneText ?? `Done. Jamvi files your ${answered === 1 ? 'regular' : `${answered} regulars`} by itself from now on. Check the list below, then Save.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  known: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  lead: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  payee: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  payeeName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  payeeMeta: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  question: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  own: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4, gap: 8 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  save: { minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  skip: { alignSelf: 'flex-start', marginTop: 4 },
});
