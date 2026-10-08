/**
 * A business's cost categories, ticked several at a time.
 *
 * "Can you attach a category to a business like the way we were linking to an
 * income stream ... yes add it to the business report" (8 Oct 2026). It was on
 * Reports, under each income stream; an income stream is never a business now
 * (api-server lib/business-streams), so the same sheet opens from the business
 * itself - on the Business report, and on My businesses for one whose profit
 * is not counted.
 *
 * Spending in a ticked category is that business's: out of personal spending,
 * and on its profit and loss as cost of goods sold (stock, fuel) or a running
 * expense (repairs, rent). Each tick saves as it is tapped and shows at once.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getGetBudgetCategoriesQueryKey,
  getGetDashboardBusinessQueryKey,
  useGetBudgetCategories,
  useUpdateBudgetCategory,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useBusinesses } from '@/hooks/useBusinesses';

type Category = { id: number; name: string; parentId?: number | null; reducesIncomeSourceId?: number | null; costKind?: string | null };

export function BusinessCostCategories({ business, onClose }: {
  /** The business whose costs are being chosen; null keeps the sheet closed. */
  business: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const businesses = useBusinesses();
  const { data: rawCategories = [] } = useGetBudgetCategories();
  const categories = rawCategories as unknown as Category[];
  const updateCategory = useUpdateBudgetCategory();
  const [pendingLink, setPendingLink] = useState<Record<number, number | null>>({});
  const [pendingKind, setPendingKind] = useState<Record<number, 'cogs' | 'expense'>>({});

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
    // Every period's statement, and every personal figure the cost leaves or joins.
    void queryClient.invalidateQueries({ queryKey: getGetDashboardBusinessQueryKey() });
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/dashboard') });
  }, [queryClient]);

  // A link to anything but a business (an income stream, from before) is no link.
  const linkOf = (category: Category) => {
    const link = category.id in pendingLink ? pendingLink[category.id] : category.reducesIncomeSourceId ?? null;
    return link != null && businesses.ids.has(link) ? link : null;
  };
  const kindOf = (category: Category) => pendingKind[category.id] ?? (category.costKind === 'expense' ? 'expense' : 'cogs');
  const nameOf = (id: number) => businesses.list.find((one) => one.id === id)?.name ?? 'another business';

  // A cost linked to an income stream before income streams stopped being
  // businesses (#674): it counts as personal spending now, so it is named and
  // listed first, ready to move to a business with one tap - "we agreed stock
  // expenses should not show in personal expenses" (8 Oct 2026).
  const { data: streams = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['income-sources', '__group__'],
    queryFn: () => customFetch<Array<{ id: number; name: string }>>('/api/income-sources'),
    staleTime: 30_000,
  });
  const oldStreamOf = (category: Category): string | null => {
    if (category.id in pendingLink) return null;
    const link = category.reducesIncomeSourceId ?? null;
    if (link == null || businesses.ids.has(link)) return null;
    return streams.find((stream) => stream.id === link)?.name ?? 'an income stream';
  };

  const applyLink = useCallback(async (categoryId: number, reducesIncomeSourceId: number | null) => {
    setPendingLink((current) => ({ ...current, [categoryId]: reducesIncomeSourceId }));
    try {
      await updateCategory.mutateAsync({ id: categoryId, data: { reducesIncomeSourceId } });
      await refresh();
    } catch {
      Alert.alert('Could not update the cost category', 'Please try again.');
    } finally {
      setPendingLink((current) => {
        const next = { ...current };
        delete next[categoryId];
        return next;
      });
    }
  }, [updateCategory, refresh]);

  const applyKind = useCallback(async (categoryId: number, costKind: 'cogs' | 'expense') => {
    setPendingKind((current) => ({ ...current, [categoryId]: costKind }));
    try {
      await updateCategory.mutateAsync({ id: categoryId, data: { costKind } });
      await refresh();
    } catch {
      Alert.alert('Could not change the kind of cost', 'Please try again.');
    } finally {
      setPendingKind((current) => {
        const next = { ...current };
        delete next[categoryId];
        return next;
      });
    }
  }, [updateCategory, refresh]);

  // Any number of categories can be one business's costs; a category is only
  // ever one business's, so one ticked for another asks before it moves, and
  // unticking asks first too - it puts the spending back into personal.
  const toggle = (category: Category) => {
    if (!business) return;
    const linkedTo = linkOf(category);
    if (linkedTo === business.id) {
      Alert.alert(
        `Stop counting ${category.name} as ${business.name}'s cost?`,
        'Its spending would count as your personal spending again.',
        [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Stop counting it', style: 'destructive', onPress: () => void applyLink(category.id, null) },
        ],
      );
      return;
    }
    if (linkedTo != null) {
      Alert.alert(
        'Move this category?',
        `"${category.name}" is ${nameOf(linkedTo)}'s cost. Making it ${business.name}'s takes it off ${nameOf(linkedTo)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Move it', onPress: () => void applyLink(category.id, business.id) },
        ],
      );
      return;
    }
    void applyLink(category.id, business.id);
  };

  // A category holding sub-categories carries no spending itself.
  const leaves = categories
    .filter((category) => !categories.some((other) => other.parentId === category.id))
    .sort((a, b) => Number(oldStreamOf(b) != null) - Number(oldStreamOf(a) != null));
  const saving = Object.keys(pendingLink).length > 0 || Object.keys(pendingKind).length > 0;

  return (
    <Modal visible={business !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ maxHeight: '88%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.card }} testID="business-cost-categories">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '18' }}>
              <Feather name="link-2" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>{business?.name ?? 'Business'}: cost categories</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                Spending in a ticked category is {business?.name ?? 'the business'}&rsquo;s, not yours. Tick as many as apply, and say whether each is a cost of goods sold (stock, fuel) or an expense (repairs, rent).
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
            {leaves.map((category) => {
              const linkedTo = linkOf(category);
              const selected = business !== null && linkedTo === business.id;
              const elsewhere = linkedTo != null && !selected;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => toggle(category)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  testID={`business-cost-category-${category.id}`}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: selected ? `${colors.primary}18` : 'transparent' }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
                    {category.name}{selected ? '  ✓' : ''}
                  </Text>
                  {!selected && oldStreamOf(category) ? (
                    <Text style={{ color: '#d97706', fontSize: 12, marginTop: 2 }} testID={`business-cost-was-stream-${category.id}`}>
                      Was a cost of {oldStreamOf(category)} - it counts as your personal spending now. Tap to make it {business?.name ?? 'this business'}&rsquo;s.
                    </Text>
                  ) : null}
                  {elsewhere ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{nameOf(linkedTo)}&rsquo;s cost - tap to move it here</Text>
                  ) : null}
                  {selected ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {([['cogs', 'Cost of goods sold'], ['expense', 'Expense']] as const).map(([kind, label]) => {
                        const on = kindOf(category) === kind;
                        return (
                          <Pressable
                            key={kind}
                            onPress={() => { if (!on) void applyKind(category.id, kind); }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`${category.name} is ${label}`}
                            testID={`business-cost-kind-${category.id}-${kind}`}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}
                          >
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? colors.primaryForeground : colors.foreground }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={onClose} accessibilityRole="button" testID="business-cost-categories-done"
            style={{ margin: 16, marginBottom: Math.max(insets.bottom, 16), borderRadius: 8, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>{saving ? 'Saving…' : 'Done'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
