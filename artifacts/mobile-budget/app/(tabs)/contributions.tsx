import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Pressable,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CHEGE_ID = '63497598';
const LYDIAH_ID = '63570605';


const MEMBER_NAMES: Record<string, string> = {
  [CHEGE_ID]: 'Chege',
  [LYDIAH_ID]: 'Lydiah',
};

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = value > max;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: over ? '#ef4444' : color }]} />
    </View>
  );
}

function MemberCard({
  name,
  initial,
  contributed,
  spent,
  net,
  target,
  accentColor,
  gradientColors,
}: {
  name: string;
  initial: string;
  contributed: number;
  spent: number;
  net: number;
  target: number;
  accentColor: string;
  gradientColors: [string, string];
}) {
  const pct = target > 0 ? Math.min((contributed / target) * 100, 100) : 0;
  const netPositive = net >= 0;

  return (
    <LinearGradient colors={gradientColors} style={styles.memberCard}>
      <View style={styles.memberCardTop}>
        <View>
          <Text style={styles.memberName}>{name}</Text>
          <Text style={styles.memberTarget}>Target: KES {formatKES(target)}</Text>
        </View>
        <View style={[styles.memberAvatar, { backgroundColor: accentColor + '33' }]}>
          <Text style={[styles.memberInitial, { color: accentColor }]}>{initial}</Text>
        </View>
      </View>

      {/* Three-column stats */}
      <View style={styles.memberStats}>
        <View style={styles.memberStatCell}>
          <Text style={styles.memberStatLabel}>Contributed</Text>
          <Text style={[styles.memberStatValue, { color: accentColor }]}>KES {formatKES(contributed)}</Text>
        </View>
        <View style={styles.memberStatDivider} />
        <View style={styles.memberStatCell}>
          <Text style={styles.memberStatLabel}>Spent</Text>
          <Text style={[styles.memberStatValue, { color: '#f87171' }]}>KES {formatKES(spent)}</Text>
        </View>
        <View style={styles.memberStatDivider} />
        <View style={styles.memberStatCell}>
          <Text style={styles.memberStatLabel}>Net</Text>
          <Text style={[styles.memberStatValue, { color: netPositive ? '#4ade80' : '#f87171' }]}>
            {netPositive ? '+' : ''}KES {formatKES(net)}
          </Text>
        </View>
      </View>

      <ProgressBar value={contributed} max={target} color={accentColor} />

      <View style={styles.memberFooter}>
        <Text style={styles.memberPct}>{Math.round(pct)}% of target</Text>
        <Text style={[styles.memberRemaining, { color: netPositive ? 'rgba(247,250,246,0.55)' : '#f87171' }]}>
          {netPositive ? `KES ${formatKES(Math.max(target - contributed, 0))} to go` : `Deficit KES ${formatKES(Math.abs(net))}`}
        </Text>
      </View>
    </LinearGradient>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ContributionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pickerVisible, setPickerVisible] = useState(false);
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const monthOptions = useMemo(() => {
    const result: { month: number; year: number; label: string }[] = [];
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      result.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        label: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`,
      });
      d.setMonth(d.getMonth() - 1);
    }
    return result;
  }, []);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function jumpToMonth(m: number, y: number) {
    setMonth(m); setYear(y); setPickerVisible(false);
  }

  const { data: summary, isLoading, refetch } = useGetDashboardSummary({ month, year });
  const chegeNet = (summary?.chegeContributed ?? 0) - (summary?.chegeSpent ?? 0);
  const lydiahNet = (summary?.lydiahContributed ?? 0) - (summary?.lydiahSpent ?? 0);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0a1a10', '#0f2217', '#132a1c']}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Contributions</Text>
          <View style={styles.monthNav}>
            <Pressable onPress={prevMonth} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-left" size={20} color="rgba(247,250,246,0.7)" />
            </Pressable>
            <Pressable onPress={() => setPickerVisible(true)} hitSlop={6} style={styles.monthLabelBtn}>
              <Text style={styles.monthLabel}>{MONTHS_SHORT[month - 1]} {year}</Text>
              <Feather name="chevron-down" size={12} color="rgba(247,250,246,0.5)" style={{ marginLeft: 3 }} />
            </Pressable>
            <Pressable onPress={nextMonth} hitSlop={10} style={styles.navBtn} disabled={isCurrentMonth}>
              <Feather name="chevron-right" size={20} color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'} />
            </Pressable>
          </View>
        </View>

        {!isLoading && summary && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total contributed</Text>
            <Text style={styles.totalAmount}>KES {formatKES((summary.chegeContributed ?? 0) + (summary.lydiahContributed ?? 0))}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Month Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Jump to month</Text>
            <FlatList
              data={monthOptions}
              keyExtractor={(item) => `${item.year}-${item.month}`}
              showsVerticalScrollIndicator={false}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const selected = item.month === month && item.year === year;
                return (
                  <Pressable
                    onPress={() => jumpToMonth(item.month, item.year)}
                    style={[styles.pickerItem, selected && { backgroundColor: '#1a3320' }]}
                  >
                    <Text style={[styles.pickerItemText, { color: selected ? '#4ade80' : colors.foreground }, selected && { fontFamily: 'Inter_700Bold' }]}>
                      {item.label}
                    </Text>
                    {selected && <Feather name="check" size={16} color="#4ade80" />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
        contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }]}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.secondary} style={{ marginTop: 40 }} />
        ) : summary ? (
          <View style={styles.cards}>
            <MemberCard
              name="Chege"
              initial="C"
              contributed={summary.chegeContributed ?? 0}
              spent={summary.chegeSpent ?? 0}
              net={chegeNet}
              target={summary.chegeTarget ?? 0}
              accentColor="#4ade80"
              gradientColors={['#132a1c', '#0f2217']}
            />
            <MemberCard
              name="Lydiah"
              initial="L"
              contributed={summary.lydiahContributed ?? 0}
              spent={summary.lydiahSpent ?? 0}
              net={lydiahNet}
              target={summary.lydiahTarget ?? 0}
              accentColor="#cf7217"
              gradientColors={['#2a1c0a', '#1c130a']}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: { padding: 6 },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  monthLabel: { fontSize: 14, fontWeight: '600' as const, color: '#f7faf6', fontFamily: 'Inter_600SemiBold', minWidth: 64, textAlign: 'center' },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center', paddingVertical: 12 },
  pickerList: { flexGrow: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginHorizontal: 12, marginVertical: 1 },
  pickerItemText: { fontSize: 16, fontFamily: 'Inter_500Medium' },

  totalRow: { alignItems: 'center' },
  totalLabel: { fontSize: 11, color: '#7aaa8a', fontFamily: 'Inter_400Regular', letterSpacing: 0.5, marginBottom: 2 },
  totalAmount: { fontSize: 28, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 20 },
  cards: { gap: 12 },

  memberCard: { borderRadius: 18, padding: 20 },
  memberCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memberStats: { flexDirection: 'row' as const, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, paddingVertical: 10, marginBottom: 12 },
  memberStatCell: { flex: 1, alignItems: 'center' as const },
  memberStatLabel: { fontSize: 9, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular', marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  memberStatValue: { fontSize: 11, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  memberStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  memberInitial: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  memberName: { fontSize: 18, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  memberTarget: { fontSize: 12, color: 'rgba(247,250,246,0.55)', fontFamily: 'Inter_400Regular', marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  memberFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  memberPct: { fontSize: 12, color: 'rgba(247,250,246,0.55)', fontFamily: 'Inter_400Regular' },
  memberRemaining: { fontSize: 12, color: 'rgba(247,250,246,0.55)', fontFamily: 'Inter_400Regular' },
});
