import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { longDay } from '@/lib/dayRange';
import { formatExact } from '@/lib/formatExact';
import { currentReview, endReview, reviewOrder, tickedIds, tickedTotal } from '@/lib/reviewChanges';

/**
 * The entries a "change them all?" question would change, one by one with a
 * tick box each (lib/reviewChanges): only the ticked ones change.
 */
export default function ReviewChangesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [review] = useState(currentReview);
  const rows = useMemo(() => reviewOrder(review?.rows ?? []), [review]);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Nothing handed over (opened again after the app restarted): nothing to review.
  useEffect(() => {
    if (!review) router.back();
    return () => endReview();
  }, [review]);
  if (!review) return null;

  const ids = tickedIds(rows, unticked);
  const allTicked = unticked.size === 0;
  const toggle = (id: number) => setUnticked((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const leave = () => {
    review.leave?.();
    router.back();
  };
  const change = async () => {
    if (ids.length === 0) {
      leave();
      return;
    }
    setSaving(true);
    try {
      await review.change(ids);
      router.back();
    } catch (error) {
      Alert.alert('Could not change them all', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }} testID="review-changes">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Go back without changing any" testID="review-changes-back" hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }} numberOfLines={2}>{review.title}</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingHorizontal: 16, marginBottom: 8 }}>{review.message}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }} testID="review-changes-count">
          {ids.length} of {rows.length} ticked · KES {formatExact(tickedTotal(rows, unticked))}
        </Text>
        <Pressable
          onPress={() => setUnticked(allTicked ? new Set(rows.map((row) => row.id)) : new Set())}
          accessibilityRole="button"
          testID="review-changes-tick-all"
          hitSlop={8}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{allTicked ? 'Untick all' : 'Tick all'}</Text>
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item }) => {
          const on = !unticked.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              testID={`review-changes-row-${item.id}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, opacity: on ? 1 : 0.6 }}
            >
              <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.foreground, fontSize: 14 }} numberOfLines={2}>{item.description}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {longDay(item.date.slice(0, 10))}{item.now ? ` · now ${item.now}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>KES {formatExact(Math.abs(item.amount))}</Text>
            </Pressable>
          );
        }}
      />
      <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderColor: colors.border }}>
        <Pressable
          onPress={() => void change()}
          disabled={saving}
          accessibilityRole="button"
          testID="review-changes-change"
          style={{ backgroundColor: ids.length > 0 ? colors.primary : colors.muted, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
        >
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : (
            <Text style={{ color: ids.length > 0 ? colors.primaryForeground : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
              {ids.length > 0 ? review.actionLabel(ids.length) : 'Change none'}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={leave} accessibilityRole="button" testID="review-changes-leave" style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Leave them all as they are</Text>
        </Pressable>
      </View>
    </View>
  );
}
