import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetBudgetCategoriesQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Suggestions = {
  applicable: boolean;
  matched: Array<{ categoryId: number; categoryName: string; parentName: string }>;
  unparented: Array<{ categoryId: number; categoryName: string }>;
  parentOptions: Array<{ id: number; name: string }>;
};

type Move = { categoryId: number; parentName?: string; parentId?: number };

/**
 * Reviewed tidy-up of sub-categories - the web's "Tidy up sub-categories"
 * (components/subcategory-suggestions-card.tsx), which the phone did not have.
 * Categories the pack knows as children ("Wi-Fi", "Rent") sitting at the top
 * level are offered a move under their usual parent, ticked; anything else at
 * the top level can be given a parent. Nothing moves until Apply, and nothing
 * shows when there is nothing to suggest.
 */
export function SubcategorySuggestions({ canManage }: { canManage: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<Record<number, number | null>>({});
  const [choosingFor, setChoosingFor] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);

  const { data, isLoading, refetch } = useQuery<Suggestions>({
    queryKey: ['subcategory-suggestions'],
    queryFn: () => customFetch<Suggestions>('/api/budget-categories/subcategory-suggestions'),
    retry: false,
  });

  // Matched moves start ticked; the others start kept at the top level.
  useEffect(() => {
    if (!data) return;
    setChecked(Object.fromEntries(data.matched.map((row) => [row.categoryId, true])));
    setPicked(Object.fromEntries(data.unparented.map((row) => [row.categoryId, null])));
  }, [data]);

  const moves = useMemo<Move[]>(() => {
    if (!data) return [];
    return [
      ...data.matched.filter((row) => checked[row.categoryId]).map((row) => ({ categoryId: row.categoryId, parentName: row.parentName })),
      ...data.unparented.filter((row) => picked[row.categoryId] != null).map((row) => ({ categoryId: row.categoryId, parentId: picked[row.categoryId]! })),
    ];
  }, [data, checked, picked]);

  if (isLoading || !data?.applicable || (data.matched.length === 0 && data.unparented.length === 0)) return null;

  const apply = async () => {
    if (moves.length === 0 || applying) return;
    setApplying(true);
    try {
      await customFetch('/api/budget-categories/subcategory-suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves }),
      });
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() })]);
      Alert.alert('Sub-categories tidied', `${moves.length} ${moves.length === 1 ? 'category' : 'categories'} moved. History and budgets are unchanged.`);
    } catch (error) {
      Alert.alert('Could not apply', error instanceof Error ? error.message : 'Nothing has been changed.');
    } finally {
      setApplying(false);
    }
  };

  const parentName = (id: number | null | undefined) => data.parentOptions.find((option) => option.id === id)?.name;
  const chip = (on: boolean) => ({
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + '18' : 'transparent',
  });

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 }} testID="subcategory-suggestions">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="git-merge" size={16} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Tidy up sub-categories</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
        Categories that belong inside another one, so reports read as a short list rather than forty rows. Moving a category keeps its history and budget.
      </Text>

      {data.matched.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Move under their usual parent</Text>
          {data.matched.map((row) => {
            const on = checked[row.categoryId] ?? false;
            return (
              <Pressable key={row.categoryId} disabled={!canManage || applying}
                onPress={() => setChecked((previous) => ({ ...previous, [row.categoryId]: !on }))}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                accessibilityLabel={`Move ${row.categoryName} under ${row.parentName}`}
                testID={`subcat-match-${row.categoryId}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? colors.primary : colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold' }}>{row.categoryName}</Text>
                  <Text style={{ color: colors.mutedForeground }}> under </Text>
                  <Text style={{ fontFamily: 'Inter_600SemiBold' }}>{row.parentName}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {data.unparented.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Other top-level categories</Text>
          {data.unparented.map((row) => {
            const chosen = parentName(picked[row.categoryId]);
            const open = choosingFor === row.categoryId;
            return (
              <View key={row.categoryId} style={{ gap: 6, paddingVertical: 4 }}>
                <Pressable disabled={!canManage || applying} onPress={() => setChoosingFor(open ? null : row.categoryId)}
                  accessibilityRole="button" accessibilityLabel={`Parent for ${row.categoryName}`} testID={`subcat-pick-${row.categoryId}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }} numberOfLines={1}>{row.categoryName}</Text>
                  <Text style={{ color: chosen ? colors.primary : colors.mutedForeground, fontSize: 12 }}>{chosen ? `Move under ${chosen}` : 'Keep at top level'}</Text>
                  <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </Pressable>
                {open ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <Pressable onPress={() => { setPicked((previous) => ({ ...previous, [row.categoryId]: null })); setChoosingFor(null); }} style={chip(picked[row.categoryId] == null)}>
                      <Text style={{ color: colors.foreground, fontSize: 12 }}>Keep at top level</Text>
                    </Pressable>
                    {data.parentOptions.filter((option) => option.id !== row.categoryId).map((option) => (
                      <Pressable key={option.id} onPress={() => { setPicked((previous) => ({ ...previous, [row.categoryId]: option.id })); setChoosingFor(null); }}
                        style={chip(picked[row.categoryId] === option.id)} testID={`subcat-pick-${row.categoryId}-${option.id}`}>
                        <Text style={{ color: colors.foreground, fontSize: 12 }}>{option.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {canManage ? (
        <Pressable onPress={() => void apply()} disabled={applying || moves.length === 0} accessibilityRole="button" testID="button-apply-subcategory-suggestions"
          style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: moves.length === 0 ? 0.5 : 1 }}>
          {applying ? <ActivityIndicator color={colors.primary} /> : (
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
              {moves.length === 0 ? 'Nothing selected' : `Apply ${moves.length} ${moves.length === 1 ? 'move' : 'moves'}`}
            </Text>
          )}
        </Pressable>
      ) : (
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>An owner or admin can apply these.</Text>
      )}
    </View>
  );
}
