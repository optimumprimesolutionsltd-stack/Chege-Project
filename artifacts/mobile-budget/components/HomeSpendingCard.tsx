import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { homeVsOutside, type BreakdownRow, type SideItem } from '@/lib/homeSpending';

type Places = { ready: boolean; places: Array<{ categoryId: number; atHome: boolean }> };

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;
const SHOWN = 5;

/**
 * Household upkeep against spending outside the home, for the month (lib/homeSpending).
 * Reports only: the categories themselves do not change. Each line can be moved
 * to the other side, kept for the whole budget (api-server lib/category-places).
 */
export function HomeSpendingCard({
  breakdown,
  categories,
  onScreen,
}: {
  breakdown: readonly BreakdownRow[];
  categories: ReadonlyArray<{ id: number; name: string }>;
  /** Follows the server only while Reports is in view (hooks/useOnScreen). */
  onScreen: boolean;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data } = useQuery<Places>({
    queryKey: ['category-places'],
    queryFn: () => customFetch<Places>('/api/category-places'),
    staleTime: 5 * 60_000,
    retry: false,
    subscribed: onScreen,
  });
  const [moving, setMoving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const chosen = useMemo(() => {
    const nameById = new Map(categories.map((row) => [row.id, row.name]));
    const map = new Map<string, boolean>();
    for (const place of data?.places ?? []) {
      const name = nameById.get(place.categoryId);
      if (name) map.set(name, place.atHome);
    }
    return map;
  }, [data, categories]);
  const sides = useMemo(() => homeVsOutside(breakdown, chosen), [breakdown, chosen]);

  if (sides.home.total + sides.outside.total <= 0) return null;

  const move = async (item: SideItem) => {
    const category = categories.find((row) => row.name === item.category);
    if (!category) return;
    setMoving(item.category);
    try {
      await customFetch(`/api/category-places/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atHome: !item.atHome }),
      });
      queryClient.setQueryData<Places>(['category-places'], (cached) => ({
        ready: cached?.ready ?? true,
        places: [...(cached?.places ?? []).filter((one) => one.categoryId !== category.id), { categoryId: category.id, atHome: !item.atHome }],
      }));
    } catch (error) {
      Alert.alert('Could not move it', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setMoving(null);
    }
  };

  const side = (title: string, hint: string, total: number, items: SideItem[], atHome: boolean) => (
    <View style={{ gap: 6 }} testID={`home-spending-${atHome ? 'home' : 'outside'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{kes(total)}</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>{hint}</Text>
      {(showAll ? items : items.slice(0, SHOWN)).map((item) => (
        <View key={item.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={1}>
              {item.category}
              {item.parentName ? <Text style={{ color: colors.mutedForeground }}> · {item.parentName}</Text> : null}
            </Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 13 }}>{kes(item.spent)}</Text>
          <Pressable
            onPress={() => void move(item)}
            disabled={moving != null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={atHome ? `Move ${item.category} to outside the home` : `Move ${item.category} to at home`}
            testID={`home-spending-move-${item.category}`}
            style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}
          >
            {moving === item.category
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name={atHome ? 'arrow-down' : 'arrow-up'} size={15} color={colors.primary} />}
          </Pressable>
        </View>
      ))}
      {items.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Nothing this month.</Text> : null}
    </View>
  );

  const more = Math.max(sides.home.items.length, sides.outside.items.length) > SHOWN;
  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 14 }} testID="home-spending-card">
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }}>AT HOME VS OUTSIDE</Text>
        <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
          {sides.homePercent}% of this month's spending went on running the home.
        </Text>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.muted, marginTop: 4 }}>
          <View style={{ width: `${sides.homePercent}%`, backgroundColor: colors.primary }} />
        </View>
      </View>
      {side('Household upkeep', 'Rent, food shopping, bills, house help, school.', sides.home.total, sides.home.items, true)}
      {side('Outside the home', 'Eating out, transport, outings and the rest.', sides.outside.total, sides.outside.items, false)}
      {more ? (
        <Pressable onPress={() => setShowAll((open) => !open)} hitSlop={8} accessibilityRole="button" testID="home-spending-show-all">
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{showAll ? 'Show fewer' : 'Show all'}</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
        The arrow moves a line to the other side; Jamvi remembers it. Your categories stay as they are - this only changes how Reports adds them up.
      </Text>
    </View>
  );
}
