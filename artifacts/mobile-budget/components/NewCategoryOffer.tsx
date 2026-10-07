import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { CreateCategorySheet, tierLabel, useTiers } from '@/components/CreateCategorySheet';
import { createInPlace } from '@/lib/createStandardCategory';
import { hasCategory, placementFor, standardTargetFor, type CategoryLite } from '@/lib/standardCategory';
import { plainSaveError } from '@/lib/saveRetry';

/**
 * For a payee Jamvi knows when the budget has no category for it: "Looks like
 * Groceries. Add Food > Groceries (Essentials)" in one tap, or Change to rename
 * it, pick another heading or make a new one in a tier of their choosing
 * (lib/standardCategory). Nothing shows when the payee is not one Jamvi knows,
 * or the budget already has the category.
 */
export function NewCategoryOffer({ description, rows, onCreated, testID }: {
  description: string;
  rows: readonly CategoryLite[];
  onCreated: (name: string) => void;
  testID?: string;
}) {
  const colors = useColors();
  const tiers = useTiers();
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const target = standardTargetFor(description);
  if (!target || hasCategory(target.name, rows)) return null;
  const place = placementFor(target.parent, target.priority, rows);

  const addHere = async () => {
    if (place.kind === 'ask' || busy) return;
    setBusy(true);
    try {
      const saved = await createInPlace(target.name, place.kind === 'existing'
        ? { kind: 'existing', parentId: place.parentId, priority: place.priority }
        : { kind: 'new-heading', parentName: place.parentName, priority: place.priority });
      onCreated(saved);
    } catch (error) {
      Alert.alert('Could not add it', plainSaveError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 4 }} testID={testID}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
        Looks like {target.name}. You have no {target.name} category yet.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        {place.kind === 'ask' ? null : (
          <Pressable onPress={() => void addHere()} disabled={busy} accessibilityRole="button" hitSlop={6} testID={testID ? `${testID}-add` : undefined}>
            {busy ? <ActivityIndicator color={colors.primary} /> : (
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                Add {place.parentName} › {target.name} ({tierLabel(tiers, place.priority)}){place.kind === 'new-heading' ? ' - new heading' : ''}
              </Text>
            )}
          </Pressable>
        )}
        <Pressable onPress={() => setChanging(true)} disabled={busy} accessibilityRole="button" hitSlop={6} testID={testID ? `${testID}-change` : undefined}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{place.kind === 'ask' ? `Add ${target.name}…` : 'Change'}</Text>
        </Pressable>
      </View>
      {changing ? (
        <CreateCategorySheet
          target={target}
          rows={rows}
          onClose={() => setChanging(false)}
          onCreated={(name) => { setChanging(false); onCreated(name); }}
        />
      ) : null}
    </View>
  );
}
