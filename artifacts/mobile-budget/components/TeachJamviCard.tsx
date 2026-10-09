import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useColors } from '@/hooks/useColors';
import { mayBeOwnAccount, type Known, type TeachGroup } from '@/lib/teachJamvi';

type Account = { id: number; name: string; accountNumber?: string | null };
type Named = { id: number; name: string };

/** The answer for a regular that is one of the person's own accounts. */
export type OwnAccountAnswer =
  | { accountId: number }
  | { name: string; businessId: number | null; newBusinessName?: string };

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;

function question(group: TeachGroup): string {
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
export function TeachJamviCard({
  groups,
  known,
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
}: {
  groups: TeachGroup[];
  known: Known;
  /** Regulars answered so far in this read. */
  answered: number;
  /** Categories to offer first for a regular (lib/teachJamvi suggestedCategories). */
  suggestions: (group: TeachGroup) => string[];
  incomeSources: Named[];
  accounts: Account[];
  businesses: Named[];
  onCategory: (group: TeachGroup, category: string) => void;
  onPickCategory: (group: TeachGroup) => void;
  onSource: (group: TeachGroup, incomeSourceId: number) => void;
  onOwnAccount: (group: TeachGroup, answer: OwnAccountAnswer) => Promise<void>;
  onSkip: (group: TeachGroup) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const group = groups[0] ?? null;
  const [ownOpen, setOwnOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [businessId, setBusinessId] = useState<number | null | 'new'>(null);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new regular starts with the own-account panel folded and its name suggested.
  useEffect(() => {
    setOwnOpen(false);
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
  const linkable = group ? accounts.filter((account) => {
    const digits = (account.accountNumber ?? '').replace(/\D/g, '');
    return !digits || digits === group.reference;
  }) : [];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="teach-jamvi">
      <View style={styles.headRow}>
        <Text style={[styles.kicker, { color: colors.primary }]}>TEACH JAMVI YOUR M-PESA</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Later" testID="teach-jamvi-later">
          <Text style={[styles.link, { color: colors.mutedForeground }]}>Later</Text>
        </Pressable>
      </View>

      {known.filed > 0 ? (
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

            <View style={styles.chips}>
              {group.direction === 'out'
                ? suggestions(group).map((name) => chip(name, () => onCategory(group, name), `teach-jamvi-category-${name}`))
                : incomeSources.map((source) => chip(source.name, () => onSource(group, source.id), `teach-jamvi-source-${source.id}`))}
              {mayBeOwnAccount(group) ? chip('My own account', () => setOwnOpen((open) => !open), 'teach-jamvi-own', 'credit-card') : null}
              {group.direction === 'out' ? chip('Pick a category…', () => onPickCategory(group), 'teach-jamvi-pick', 'list') : null}
            </View>

            {ownOpen ? (
              <View style={[styles.own, { borderColor: colors.border }]} testID="teach-jamvi-own-panel">
                <Text style={[styles.payeeMeta, { color: colors.mutedForeground }]}>
                  Money to and from account {group.reference} will count as moving your own money: not spending, not income.
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
          Done. Jamvi files your {answered === 1 ? 'regular' : `${answered} regulars`} by itself from now on. Check the list below, then Save.
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
