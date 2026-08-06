import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import ActivityCard from '@/components/ActivityCard';
import { useGetExpenses } from '@workspace/api-client-react';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: expenses = [], isLoading, refetch } = useGetExpenses({ month, year });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Convert Expense[] to ActivityItem[] shape for ActivityCard
  const items = expenses.map((e) => ({
    id: String(e.id),
    type: 'expense' as const,
    amount: e.amount,
    description: e.description,
    userName: e.paidByName,
    category: e.category,
    date: e.createdAt,
  }));

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Expenses</Text>
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
            <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {MONTHS_SHORT[month - 1]} {year}
          </Text>
          <Pressable
            onPress={nextMonth}
            style={styles.navBtn}
            hitSlop={8}
            disabled={isCurrentMonth}
          >
            <Feather
              name="chevron-right"
              size={20}
              color={isCurrentMonth ? colors.border : colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 60 }}
          size="large"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ActivityCard item={item} colors={colors} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100,
            },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No expenses
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {MONTHS_SHORT[month - 1]} {year} is empty
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: colors.secondary,
            bottom: Platform.OS === 'web' ? 100 : insets.bottom + 70,
          },
        ]}
        onPress={() => router.push('/add-expense')}
        hitSlop={8}
      >
        <Feather name="plus" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: { padding: 4 },
  monthLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    minWidth: 64,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
});
