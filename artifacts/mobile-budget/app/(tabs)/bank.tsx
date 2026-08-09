import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGetJointAccount } from '@workspace/api-client-react';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDateTime(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

type Tx = {
  id: number;
  type: string;
  amount: number;
  description: string;
  madeByName?: string | null;
  createdAt?: string | null;
};

export default function BankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data, isLoading, refetch } = useGetJointAccount();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const transactions: Tx[] = data?.transactions ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky header */}
      <LinearGradient
        colors={['#0a1a10', '#0f2217', '#132a1c']}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <Text style={styles.headerTitle}>Joint Account</Text>
        {isLoading ? (
          <ActivityIndicator color="#4ade80" style={{ marginTop: 16, marginBottom: 8 }} />
        ) : (
          <>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balance}>KES {formatKES(data?.balance)}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Feather name="arrow-down-circle" size={14} color="#4ade80" />
                <Text style={styles.statLabel}>Deposits</Text>
                <Text style={styles.statValue}>KES {formatKES(data?.totalDeposits)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Feather name="arrow-up-circle" size={14} color="#f87171" />
                <Text style={styles.statLabel}>Disbursed</Text>
                <Text style={styles.statValue}>KES {formatKES(data?.totalDisbursements)}</Text>
              </View>
            </View>
          </>
        )}
      </LinearGradient>

      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          transactions.length > 0 ? (
            <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>TRANSACTIONS</Text>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No transactions yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Deposits and disbursements will appear here
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isDeposit = item.type === 'deposit';
          return (
            <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
              <View style={[
                styles.txIcon,
                { backgroundColor: isDeposit ? '#1a3320' : '#3a1a1a' },
              ]}>
                <Feather
                  name={isDeposit ? 'arrow-down-left' : 'arrow-up-right'}
                  size={18}
                  color={isDeposit ? '#4ade80' : '#f87171'}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                  {item.madeByName ? `${item.madeByName} · ` : ''}{formatDateTime(item.createdAt)}
                </Text>
              </View>
              <Text style={[styles.txAmount, { color: isDeposit ? '#4ade80' : '#f87171' }]}>
                {isDeposit ? '+' : '-'}KES {formatKES(item.amount)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balance: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  list: { paddingHorizontal: 16, paddingTop: 16 },
  listHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1 },
  txDesc: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  txMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 8,
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
