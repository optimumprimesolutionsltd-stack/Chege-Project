import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { headingsOf, hasCategory, type CategoryLite, type StandardTarget } from '@/lib/standardCategory';
import { createInPlace } from '@/lib/createStandardCategory';
import { plainSaveError } from '@/lib/saveRetry';

type Tier = { priority: number; label: string };

/** The person's own tiers (the Budget tab's names), through the same query the Budget tab uses. */
export function useTiers(): Tier[] {
  const { data: group } = useGetGroup();
  const { data } = useQuery<{ tiers: Tier[] }>({
    queryKey: ['budget-priority-tiers', group?.id],
    queryFn: () => customFetch<{ tiers: Tier[] }>('/api/budget-priority-tiers'),
    staleTime: 5 * 60_000,
  });
  return (data?.tiers ?? [1, 2, 3, 4, 5].map((priority) => ({ priority, label: `Tier ${priority}` }))).filter((tier) => tier.priority < 999);
}

export const tierLabel = (tiers: readonly Tier[], priority: number): string =>
  tiers.find((tier) => tier.priority === priority)?.label ?? `Tier ${priority}`;

const lower = (name: string) => name.trim().toLocaleLowerCase('en-KE');

/**
 * "Change" on a new category: its name, its parent - one of the person's
 * headings, the suggested heading made new, or a new heading they name - and,
 * for a new heading, its tier. Nothing is made until Add.
 */
export function CreateCategorySheet({ target, rows, onClose, onCreated }: {
  /** The standard place for a payee Jamvi knows; none for any other entry, which starts blank. */
  target: StandardTarget | null;
  rows: readonly CategoryLite[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tiers = useTiers();
  const headings = useMemo(() => headingsOf(rows), [rows]);
  const suggestedHeading = target ? headings.find((row) => lower(row.name) === lower(target.parent)) : undefined;
  // A category with the suggested heading's name that is not a heading is not offered (lib/standardCategory placementFor).
  const canMakeSuggested = target !== null && !hasCategory(target.parent, rows);
  const [name, setName] = useState(target?.name ?? '');
  // 'h:<id>' an existing heading, 'suggested' the standard heading made new, 'new' a heading typed here.
  const [parent, setParent] = useState<string>(suggestedHeading ? `h:${suggestedHeading.id}` : canMakeSuggested ? 'suggested' : '');
  const [newHeading, setNewHeading] = useState('');
  // With nothing to go on, a new heading starts in the last tier, as onboarding files the unknown.
  const [tier, setTier] = useState(target?.priority ?? 4);
  const [saving, setSaving] = useState(false);

  const chosenHeading = parent.startsWith('h:') ? headings.find((row) => `h:${row.id}` === parent) : undefined;
  const typedName = name.trim();
  const problem = !typedName
    ? 'Give it a name.'
    : hasCategory(typedName, rows)
      ? `You already have a category called ${typedName}.`
      : !parent
        ? 'Choose where it goes.'
        : parent === 'new' && !newHeading.trim()
          ? 'Name the new heading.'
          : parent === 'new' && hasCategory(newHeading, rows)
            ? `${newHeading.trim()} already exists - choose it above instead.`
            : null;

  const add = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      const saved = chosenHeading
        ? await createInPlace(typedName, { kind: 'existing', parentId: chosenHeading.id, priority: chosenHeading.priority ?? tier })
        : await createInPlace(typedName, { kind: 'new-heading', parentName: parent === 'new' || !target ? newHeading : target.parent, priority: tier });
      onCreated(saved);
    } catch (error) {
      Alert.alert('Could not add it', plainSaveError(error));
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }) as const;
  const chipText = (on: boolean) => ({ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }) as const;
  const label = { color: colors.foreground, fontFamily: 'Inter_600SemiBold' } as const;
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground } as const;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 4, gap: 12, maxHeight: '85%' }} testID="create-category-sheet">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>New category</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="create-category-close">
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={label}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Groceries" placeholderTextColor={colors.mutedForeground} autoFocus={!target} style={input} testID="create-category-name" />
            <Text style={label}>Under</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {target && !suggestedHeading && canMakeSuggested ? (
                <Pressable onPress={() => { setParent('suggested'); setTier(target.priority); }} style={chip(parent === 'suggested')} accessibilityRole="button" testID="create-category-parent-suggested">
                  <Text style={chipText(parent === 'suggested')}>{target.parent} (new)</Text>
                </Pressable>
              ) : null}
              {headings.map((row) => (
                <Pressable key={row.id} onPress={() => setParent(`h:${row.id}`)} style={chip(parent === `h:${row.id}`)} accessibilityRole="button" testID={`create-category-parent-${row.id}`}>
                  <Text style={chipText(parent === `h:${row.id}`)}>{row.name}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setParent('new')} style={chip(parent === 'new')} accessibilityRole="button" testID="create-category-parent-new">
                <Text style={chipText(parent === 'new')}>New heading…</Text>
              </Pressable>
            </View>
            {parent === 'new' ? (
              <TextInput value={newHeading} onChangeText={setNewHeading} placeholder="Heading name, e.g. Shopping" placeholderTextColor={colors.mutedForeground} style={input} testID="create-category-new-heading" />
            ) : null}
            {parent === 'new' || parent === 'suggested' ? (
              <>
                <Text style={label}>Tier</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {tiers.map((option) => (
                    <Pressable key={option.priority} onPress={() => setTier(option.priority)} style={chip(tier === option.priority)} accessibilityRole="button" testID={`create-category-tier-${option.priority}`}>
                      <Text style={chipText(tier === option.priority)}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : chosenHeading ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>In {tierLabel(tiers, chosenHeading.priority ?? tier)}, like {chosenHeading.name}.</Text>
            ) : null}
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>It starts with no budget amount; set one on the Budget tab when you want to.</Text>
            {problem ? <Text style={{ color: colors.destructive, fontSize: 12 }}>{problem}</Text> : null}
          </ScrollView>
          <Pressable onPress={() => void add()} disabled={Boolean(problem) || saving} accessibilityRole="button" testID="create-category-add"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', opacity: problem || saving ? 0.5 : 1 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
