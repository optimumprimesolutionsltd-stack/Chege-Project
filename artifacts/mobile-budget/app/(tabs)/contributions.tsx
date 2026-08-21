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
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  useGetDashboardSummary,
  useGetGroup,
  customFetch,
} from '@workspace/api-client-react';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
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

// ── Member card (tappable) ────────────────────────────────────────────────────

function MemberCard({
  userId,
  name,
  initial,
  contributed,
  spent,
  net,
  target,
  accentColor,
  gradientColors,
  onPress,
}: {
  userId: string;
  name: string;
  initial: string;
  contributed: number;
  spent: number;
  net: number;
  target: number;
  accentColor: string;
  gradientColors: [string, string];
  onPress: () => void;
}) {
  const pct = target > 0 ? Math.min((contributed / target) * 100, 100) : 0;
  const netPositive = net >= 0;

  return (
    <Pressable onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
      <LinearGradient colors={gradientColors} style={styles.memberCard}>
        <View style={styles.memberCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{name}</Text>
            <Text style={styles.memberTarget}>Target: KES {formatKES(target)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.memberAvatar, { backgroundColor: accentColor + '33' }]}>
              <Text style={[styles.memberInitial, { color: accentColor }]}>{initial}</Text>
            </View>
            <Feather name="chevron-right" size={16} color="rgba(247,250,246,0.35)" />
          </View>
        </View>

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
    </Pressable>
  );
}

// ── Breakdown types ───────────────────────────────────────────────────────────

type BreakdownExpense = { id: number; description: string; amount: number; category: string; date: string | null; paidFromBank: boolean };
type BreakdownDeposit = { id: number; description: string; amount: number; date: string | null };
type BreakdownSavings = { id: number; goalName: string | null; amount: number; date: string | null };
type Breakdown = {
  expenses: BreakdownExpense[];
  deposits: BreakdownDeposit[];
  savingsContributions: BreakdownSavings[];
  totals: { expenses: number; deposits: number; savings: number; grand: number };
};

// ── Breakdown modal ───────────────────────────────────────────────────────────

function BreakdownModal({
  visible,
  member,
  onClose,
  colors,
}: {
  visible: boolean;
  member: { userId: string; name: string; accentColor: string; month: number; year: number; setMonth: (m: number) => void; setYear: (y: number) => void } | null;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const now = new Date();

  const monthOptions = useMemo(() => {
    const result: { month: number; year: number; label: string }[] = [];
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      result.push({ month: d.getMonth() + 1, year: d.getFullYear(), label: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` });
      d.setMonth(d.getMonth() - 1);
    }
    return result;
  }, []);

  const { data: breakdown, isLoading } = useQuery<Breakdown>({
    queryKey: ['member-breakdown', member?.userId, member?.month, member?.year],
    queryFn: () => customFetch(`/api/dashboard/member-breakdown?userId=${member!.userId}&month=${member!.month}&year=${member!.year}`),
    enabled: !!member && visible,
  });

  if (!member) return null;

  const isCurrentMonth = member.month === now.getMonth() + 1 && member.year === now.getFullYear();

  function prevMonth() {
    if (!member) return;
    if (member.month === 1) { member.setMonth(12); member.setYear(member.year - 1); }
    else member.setMonth(member.month - 1);
  }
  function nextMonth() {
    if (!member || isCurrentMonth) return;
    if (member.month === 12) { member.setMonth(1); member.setYear(member.year + 1); }
    else member.setMonth(member.month + 1);
  }

  const hasData = breakdown && (breakdown.expenses.length > 0 || breakdown.deposits.length > 0 || breakdown.savingsContributions.length > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={bStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[bStyles.sheet, { backgroundColor: '#0a1a10' }]}>
          {/* Handle */}
          <View style={[bStyles.handle, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />

          {/* Header */}
          <View style={bStyles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={bStyles.closeBtn}>
              <Feather name="x" size={20} color="rgba(247,250,246,0.6)" />
            </Pressable>
            <Text style={bStyles.headerTitle}>{member.name}'s breakdown</Text>
            <View style={bStyles.monthNav}>
              <Pressable onPress={prevMonth} hitSlop={10}>
                <Feather name="chevron-left" size={18} color="rgba(247,250,246,0.7)" />
              </Pressable>
              <Pressable onPress={() => setPickerVisible(true)} style={bStyles.monthBtn}>
                <Text style={bStyles.monthLabel}>{MONTHS_SHORT[member.month - 1]} {member.year}</Text>
                <Feather name="chevron-down" size={10} color="rgba(247,250,246,0.5)" style={{ marginLeft: 2 }} />
              </Pressable>
              <Pressable onPress={nextMonth} hitSlop={10} disabled={isCurrentMonth}>
                <Feather name="chevron-right" size={18} color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'} />
              </Pressable>
            </View>
          </View>

          {/* Month picker sub-modal */}
          <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
            <Pressable style={bStyles.pickerOverlay} onPress={() => setPickerVisible(false)}>
              <Pressable style={[bStyles.pickerSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
                <View style={[bStyles.pickerHandle, { backgroundColor: colors.border }]} />
                <Text style={[bStyles.pickerTitle, { color: colors.foreground }]}>Jump to month</Text>
                <FlatList
                  data={monthOptions}
                  keyExtractor={item => `${item.year}-${item.month}`}
                  showsVerticalScrollIndicator={false}
                  style={{ flexGrow: 0 }}
                  renderItem={({ item }) => {
                    const selected = item.month === member.month && item.year === member.year;
                    return (
                      <Pressable
                        onPress={() => { member.setMonth(item.month); member.setYear(item.year); setPickerVisible(false); }}
                        style={[bStyles.pickerItem, selected && { backgroundColor: '#1a3320' }]}
                      >
                        <Text style={[bStyles.pickerItemText, { color: selected ? '#4ade80' : colors.foreground }, selected && { fontFamily: 'Inter_700Bold' }]}>
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

          {/* Content */}
          {isLoading ? (
            <View style={bStyles.loadingBox}>
              <ActivityIndicator color={member.accentColor} />
              <Text style={bStyles.loadingText}>Loading breakdown…</Text>
            </View>
          ) : !hasData ? (
            <View style={bStyles.emptyBox}>
              <Feather name="inbox" size={32} color="rgba(122,170,138,0.4)" />
              <Text style={bStyles.emptyText}>No contributions in {MONTHS_SHORT[member.month - 1]} {member.year}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={bStyles.content}>
              {/* Expenses section */}
              {breakdown.expenses.length > 0 && (
                <Section
                  title="Expenses paid"
                  total={breakdown.totals.expenses}
                  accentColor={member.accentColor}
                  rows={breakdown.expenses.map(e => ({
                    key: String(e.id),
                    label: e.description || e.category,
                    sub: e.category,
                    amount: e.amount,
                    date: e.date,
                  }))}
                />
              )}

              {/* Deposits section */}
              {breakdown.deposits.length > 0 && (
                <Section
                  title="Bank deposits"
                  total={breakdown.totals.deposits}
                  accentColor={member.accentColor}
                  rows={breakdown.deposits.map(d => ({
                    key: String(d.id),
                    label: d.description || 'Deposit',
                    amount: d.amount,
                    date: d.date,
                  }))}
                />
              )}

              {/* Savings section */}
              {breakdown.savingsContributions.length > 0 && (
                <Section
                  title="Savings goals"
                  total={breakdown.totals.savings}
                  accentColor={member.accentColor}
                  rows={breakdown.savingsContributions.map(s => ({
                    key: String(s.id),
                    label: s.goalName || 'Savings',
                    amount: s.amount,
                    date: s.date,
                  }))}
                />
              )}

              {/* Grand total */}
              <View style={[bStyles.grandTotal, { borderColor: 'rgba(255,255,255,0.1)' }]}>
                <Text style={bStyles.grandLabel}>Total contribution</Text>
                <Text style={[bStyles.grandAmount, { color: member.accentColor }]}>
                  KES {formatKES(breakdown.totals.grand)}
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, total, accentColor, rows }: {
  title: string;
  total: number;
  accentColor: string;
  rows: { key: string; label: string; sub?: string; amount: number; date: string | null }[];
}) {
  return (
    <View style={bStyles.section}>
      <View style={bStyles.sectionHeader}>
        <Text style={bStyles.sectionTitle}>{title}</Text>
        <Text style={[bStyles.sectionTotal, { color: accentColor }]}>KES {formatKES(total)}</Text>
      </View>
      {rows.map(row => (
        <View key={row.key} style={bStyles.row}>
          <View style={{ flex: 1 }}>
            <Text style={bStyles.rowLabel} numberOfLines={1}>{row.label}</Text>
            {row.sub && row.sub !== row.label && (
              <Text style={bStyles.rowSub} numberOfLines={1}>{row.sub}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={bStyles.rowAmount}>KES {formatKES(row.amount)}</Text>
            {row.date && <Text style={bStyles.rowDate}>{formatDate(row.date)}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ContributionsScreen() {
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pickerVisible, setPickerVisible] = useState(false);
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  // Breakdown modal state
  const [bMember, setBMember] = useState<{ userId: string; name: string; accentColor: string } | null>(null);
  const [bMonth, setBMonth] = useState(month);
  const [bYear, setBYear] = useState(year);

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
  function jumpToMonth(m: number, y: number) { setMonth(m); setYear(y); setPickerVisible(false); }

  const { data: summary, isLoading, refetch } = useGetDashboardSummary({ month, year });

  type MemberContrib = { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };
  const memberContribs = ((summary as any)?.memberContributions ?? []) as MemberContrib[];

  const MEMBER_PALETTE = [
    { accent: '#4ade80', gradient: ['#132a1c', '#0f2217'] as [string, string] },
    { accent: '#f97316', gradient: ['#2a1c0a', '#1c130a'] as [string, string] },
    { accent: '#38bdf8', gradient: ['#0e2030', '#0a1c2a'] as [string, string] },
    { accent: '#f472b6', gradient: ['#2a0a1a', '#1c0a14'] as [string, string] },
    { accent: '#a78bfa', gradient: ['#1a0a2a', '#12081c'] as [string, string] },
  ];

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function openBreakdown(userId: string, name: string, accentColor: string) {
    setBMonth(month);
    setBYear(year);
    setBMember({ userId, name, accentColor });
  }

  // Breakdown member object with setter callbacks
  const breakdownMember = bMember ? {
    ...bMember,
    month: bMonth,
    year: bYear,
    setMonth: setBMonth,
    setYear: setBYear,
  } : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0a1a10', '#0f2217', '#132a1c']}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{isSharedWorkspace ? 'Group Contributions' : 'My Contributions'}</Text>
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
            <Text style={styles.totalAmount}>KES {formatKES(memberContribs.reduce((s, m) => s + m.contributed, 0))}</Text>
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

      {/* Breakdown Modal */}
      <BreakdownModal
        visible={!!bMember}
        member={breakdownMember}
        onClose={() => setBMember(null)}
        colors={colors}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
        contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }]}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.secondary} style={{ marginTop: 40 }} />
        ) : summary ? (
          <View style={styles.cards}>
            {memberContribs.map((m, idx) => {
              const palette = MEMBER_PALETTE[idx % MEMBER_PALETTE.length];
              return (
                <MemberCard
                  key={m.userId}
                  userId={m.userId}
                  name={m.name}
                  initial={m.name[0]?.toUpperCase() ?? '?'}
                  contributed={m.contributed}
                  spent={m.spent}
                  net={m.net}
                  target={m.target ?? 0}
                  accentColor={palette.accent}
                  gradientColors={palette.gradient}
                  onPress={() => openBreakdown(m.userId, m.name, palette.accent)}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

const bStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%', minHeight: 300 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  closeBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3 },
  monthLabel: { fontSize: 13, fontWeight: '600' as const, color: '#f7faf6', fontFamily: 'Inter_600SemiBold', minWidth: 56, textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 0 },

  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 11, color: 'rgba(122,170,138,0.8)', fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  sectionTotal: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  rowLabel: { fontSize: 14, color: '#f7faf6', fontFamily: 'Inter_500Medium' },
  rowSub: { fontSize: 11, color: 'rgba(247,250,246,0.45)', fontFamily: 'Inter_400Regular', marginTop: 1 },
  rowAmount: { fontSize: 14, fontWeight: '600' as const, color: '#f7faf6', fontFamily: 'Inter_600SemiBold' },
  rowDate: { fontSize: 11, color: 'rgba(247,250,246,0.4)', fontFamily: 'Inter_400Regular', marginTop: 1, textAlign: 'right' },

  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 4, borderTopWidth: 1 },
  grandLabel: { fontSize: 14, fontWeight: '600' as const, color: 'rgba(247,250,246,0.7)', fontFamily: 'Inter_600SemiBold' },
  grandAmount: { fontSize: 20, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  loadingText: { fontSize: 13, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyText: { fontSize: 14, color: 'rgba(247,250,246,0.5)', fontFamily: 'Inter_400Regular', textAlign: 'center' },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center', paddingVertical: 12 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginHorizontal: 12, marginVertical: 1 },
  pickerItemText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
});
