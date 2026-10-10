import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useColors } from '@/hooks/useColors';
import { displayName, FAMILY_CATEGORY } from '@/lib/family';

/**
 * Your family, once (lib/family): the people money to whom is family support,
 * never a shop. People who share the person's surname are offered first; any
 * other name is typed as M-Pesa writes it. Each is filed under one of the
 * family categories - Parents, Siblings... when the budget has them.
 */
export function FamilyNamesCard({
  kept,
  categories,
  suggestions,
  onAdd,
  onRemove,
}: {
  /** Names already kept, with their category. */
  kept: Array<{ key: string; category: string }>;
  /** The family categories to choose from; empty makes Family support. */
  categories: string[];
  /** Likely relatives from the person's own payments. */
  suggestions: string[];
  onAdd: (name: string, category: string) => Promise<void>;
  onRemove: (key: string) => void;
}) {
  const colors = useColors();
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choices = categories.length > 0 ? categories : [FAMILY_CATEGORY];

  const add = async (name: string, category: string) => {
    setSaving(true);
    try {
      await onAdd(name, category);
      setPending(null);
      setTyped('');
    } catch (error) {
      Alert.alert('Could not add them', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };
  // Each person gets their own line under Family support (lib/familyPeople): added
  // at once, nothing to choose ("subcategories are the people", 10 Oct 2026).
  const choose = (name: string) => {
    if (!name.trim()) return;
    void add(name.trim(), choices[0]);
  };

  const chip = (label: string, onPress: () => void, testID: string, icon?: keyof typeof Feather.glyphMap) => (
    <Pressable key={testID} onPress={onPress} accessibilityRole="button" testID={testID} disabled={saving}
      style={({ pressed }) => [styles.chip, { borderColor: colors.primary, backgroundColor: `${colors.primary}10`, opacity: pressed || saving ? 0.7 : 1 }]}>
      {icon ? <Feather name={icon} size={13} color={colors.primary} /> : null}
      <Text style={[styles.chipText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="family-names">
      <View style={styles.head}>
        <Feather name="heart" size={15} color={colors.primary} />
        <Text style={[styles.kicker, { color: colors.primary }]}>YOUR FAMILY</Text>
      </View>
      <Text style={[styles.lead, { color: colors.foreground }]}>Who do you send money to in your family?</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Each gets their own line under Family support, so you see what goes to whom. Write each name as it shows in your M-Pesa messages.
      </Text>

      {kept.length > 0 ? (
        <View style={styles.chips}>
          {kept.map((one) => (
            <View key={one.key} style={[styles.kept, { borderColor: colors.border, backgroundColor: colors.muted }]} testID={`family-kept-${one.key}`}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{displayName(one.key)} · {one.category}</Text>
              <Pressable onPress={() => onRemove(one.key)} hitSlop={8} accessibilityLabel={`Remove ${displayName(one.key)}`}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {pending ? (
        <View style={{ gap: 6 }} testID="family-which">
          <Text style={[styles.hint, { color: colors.foreground }]}>{pending} is…</Text>
          <View style={styles.chips}>
            {choices.map((category) => chip(category, () => void add(pending, category), `family-category-${category}`))}
            {chip('Cancel', () => setPending(null), 'family-cancel')}
          </View>
        </View>
      ) : (
        <>
          {suggestions.length > 0 ? (
            <>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>You have paid these - family?</Text>
              <View style={styles.chips}>
                {suggestions.map((name) => chip(name, () => choose(name), `family-suggest-${name}`, 'plus'))}
              </View>
            </>
          ) : null}
          <View style={styles.row}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => choose(typed)}
              placeholder="e.g. JANE WANJIKU KAMAU"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              testID="family-name-input"
            />
            <Pressable onPress={() => choose(typed)} disabled={!typed.trim() || saving} accessibilityRole="button" testID="family-add"
              style={[styles.add, { backgroundColor: colors.primary, opacity: !typed.trim() || saving ? 0.5 : 1 }]}>
              {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }}>Add</Text>}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  kept: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  add: { borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
});
