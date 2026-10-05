import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getGetExpensesQueryKey, getGetJointAccountQueryKey, useUpdateJointAccountTransaction } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { categoryToKeep, deletePathFor, duplicatesTitle, pairKey, sameQuestion, type DuplicatePair, type DuplicateSide } from '@/lib/possibleDuplicates';
import { plainSaveError } from '@/lib/saveRetry';
import { formatDisplayDate } from '@/lib/displayFormat';

const kes = (value: number) => `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

/**
 * One payment recorded twice - typed by hand and brought in from M-Pesa - one
 * pair at a time (lib/possibleDuplicates). Nothing is removed until the person
 * says it is the same payment.
 */
export default function PossibleDuplicatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { mutateAsync: updateTransaction } = useUpdateJointAccountTransaction();

  const { data, isLoading, isError, refetch } = useQuery<{ pairs: DuplicatePair[] }>({
    queryKey: ['possible-duplicates'],
    queryFn: () => customFetch('/api/possible-duplicates'),
    retry: false,
  });
  const pairs = data?.pairs ?? [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['possible-duplicates'] }),
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() }),
    ]);

  const same = (pair: DuplicatePair) => {
    Alert.alert('Same payment?', sameQuestion(pair), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Keep the M-Pesa one',
        onPress: async () => {
          setBusy(pairKey(pair));
          try {
            const category = categoryToKeep(pair);
            if (category) {
              await updateTransaction({ id: pair.imported.id, data: { amount: pair.imported.amount, date: pair.imported.date, expenseCategory: category } as never });
            }
            await customFetch(deletePathFor(pair.typed), { method: 'DELETE' });
            await refresh();
          } catch (error) {
            Alert.alert('Could not change it', plainSaveError(error));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const different = async (pair: DuplicatePair) => {
    setBusy(pairKey(pair));
    try {
      await customFetch('/api/possible-duplicates/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typedKind: pair.typed.kind, typedId: pair.typed.id, importedId: pair.imported.id }),
      });
      await queryClient.invalidateQueries({ queryKey: ['possible-duplicates'] });
    } catch (error) {
      Alert.alert('Could not save that', plainSaveError(error));
    } finally {
      setBusy(null);
    }
  };

  const side = (label: string, entry: DuplicateSide, accent: string) => (
    <View style={[styles.side, { borderColor: colors.border }]}>
      <Text style={[styles.sideLabel, { color: accent }]}>{label}</Text>
      <Text style={[styles.sideName, { color: colors.foreground }]} numberOfLines={2}>{entry.description || 'No description'}</Text>
      <Text style={[styles.sideMeta, { color: colors.mutedForeground }]}>
        {kes(entry.amount)} · {formatDisplayDate(entry.date)}
      </Text>
      <Text style={[styles.sideMeta, { color: colors.mutedForeground }]}>
        {entry.category ?? 'No category'}{entry.receipt ? ` · ${entry.receipt}` : ''}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Possible duplicates</Text>
      </View>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Each pair looks like one payment recorded twice: once typed by hand, once from M-Pesa. Same amount, within a day. Say which it is - nothing is removed until you do.
      </Text>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : isError ? (
        <Pressable onPress={() => refetch()} style={{ padding: 16 }}>
          <Text style={{ color: colors.destructive }}>Could not load them. Tap to try again.</Text>
        </Pressable>
      ) : pairs.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={36} color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.foreground }]}>Nothing recorded twice.</Text>
        </View>
      ) : (
        <FlatList
          data={pairs}
          keyExtractor={pairKey}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          ListHeaderComponent={<Text style={[styles.count, { color: colors.foreground }]} testID="possible-duplicates-count">{duplicatesTitle(pairs.length)}</Text>}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`possible-duplicate-${pairKey(item)}`}>
              <View style={styles.sides}>
                {side('TYPED BY HAND', item.typed, '#D97706')}
                {side('FROM M-PESA', item.imported, colors.primary)}
              </View>
              {busy === pairKey(item) ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={styles.actions}>
                  <Pressable onPress={() => same(item)} style={[styles.button, { backgroundColor: colors.primary }]} testID={`possible-duplicate-same-${pairKey(item)}`}>
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Same payment</Text>
                  </Pressable>
                  <Pressable onPress={() => void different(item)} style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]} testID={`possible-duplicate-different-${pairKey(item)}`}>
                    <Text style={[styles.buttonText, { color: colors.foreground }]}>Different payments</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  intro: { fontSize: 13, lineHeight: 19, paddingHorizontal: 16, marginTop: 8 },
  count: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  empty: { alignItems: 'center', gap: 10, marginTop: 48 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 12 },
  sides: { flexDirection: 'row', gap: 8 },
  side: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  sideLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  sideName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sideMeta: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
