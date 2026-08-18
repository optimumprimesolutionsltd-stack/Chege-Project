import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  useGetDashboardCategoryBreakdown,
  useGetDashboardSummary,
} from '@workspace/api-client-react';

type BudgetCategory = { id: number; name: string; budgetAmount: number; priority: number; color: string };

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Survival Essentials',
  2: 'Health & Education',
  3: 'Household',
  4: 'Connectivity & Grooming',
  5: 'Discretionary',
};

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Food: 'shopping-cart', Transport: 'truck', Health: 'heart', Education: 'book',
  Utilities: 'zap', Entertainment: 'tv', Clothing: 'tag', Savings: 'archive',
  Housing: 'home', Communication: 'phone', Other: 'more-horizontal',
  'Nanny salary': 'users', 'School fees': 'book', 'Water & electricity': 'zap',
  'Household supplies': 'box', 'Kids clothes': 'tag', 'Medical insurance': 'shield',
  'Medical outpatient': 'heart', 'Uniform replenishment': 'book',
  'Wifi/data': 'wifi', 'Pocket money': 'dollar-sign', Grooming: 'scissors', Rent: 'home',
};

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

export default function BudgetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    useGetDashboardSummary({ month, year });
  const { data: breakdown = [], isLoading: breakdownLoading, refetch: refetchBreakdown } =
    useGetDashboardCategoryBreakdown({ month, year });
  const { data: allCategories = [], refetch: refetchCats } = useQuery<BudgetCategory[]>({
    queryKey: ['budget-categories-full'],
    queryFn: async () => {
      const res = await fetch('/api/budget-categories', { credentials: 'include' });
      return res.json();
    },
    staleTime: 30_000,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchBreakdown(), refetchCats()]);
    setRefreshing(false);
  }, [refetchSummary, refetchBreakdown, refetchCats]);

  // Add / Edit modal state
  const [editTarget, setEditTarget] = useState<BudgetCategory | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPriority, setFormPriority] = useState('1');
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditTarget(null);
    setFormName(''); setFormAmount(''); setFormPriority('1');
    setAddOpen(true);
  };
  const openEdit = (cat: BudgetCategory) => {
    setEditTarget(cat);
    setFormName(cat.name);
    setFormAmount(cat.budgetAmount.toString());
    setFormPriority(cat.priority.toString());
    setAddOpen(true);
  };
  const closeModal = () => { setAddOpen(false); setEditTarget(null); };

  const refreshAll = () => {
    refetchCats();
    refetchBreakdown();
    refetchSummary();
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleSave = async () => {
    const amt = parseInt(formAmount, 10);
    if (!formName.trim() || isNaN(amt) || amt < 0) {
      Alert.alert('Missing fields', 'Name and a valid amount are required.');
      return;
    }
    setSaving(true);
    try {
      const url = editTarget ? `/api/budget-categories/${editTarget.id}` : '/api/budget-categories';
      const res = await fetch(url, {
        method: editTarget ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), budgetAmount: amt, priority: parseInt(formPriority, 10) || 1 }),
      });
      if (!res.ok) throw new Error('Failed');
      closeModal();
      refreshAll();
    } catch {
      Alert.alert('Error', 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cat: BudgetCategory) => {
    Alert.alert(
      `Remove "${cat.name}"?`,
      'This removes the budget limit. Existing expenses in this category are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`/api/budget-categories/${cat.id}`, { method: 'DELETE', credentials: 'include' });
              refreshAll();
            } catch {
              Alert.alert('Error', 'Could not remove category.');
            }
          },
        },
      ],
    );
  };

  const isLoading = summaryLoading || breakdownLoading;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const overallPct = summary && summary.totalBudget > 0
    ? Math.min(summary.totalSpent / summary.totalBudget, 1) : 0;

  // Categories that exist but have no spending this month
  const catNamesInBreakdown = new Set(breakdown.map(b => b.category));
  const unusedCats = allCategories.filter(c => !catNamesInBreakdown.has(c.name));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Add / Edit Modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {editTarget ? 'Edit category' : 'Add category'}
                </Text>
                <Pressable onPress={closeModal} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY NAME</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. Transport"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>MONTHLY BUDGET (KES)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="e.g. 15000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PRIORITY TIER</Text>
                <View style={styles.priorityRow}>
                  {[1, 2, 3, 4, 5].map(p => (
                    <Pressable
                      key={p}
                      onPress={() => setFormPriority(p.toString())}
                      style={[styles.priorityChip, {
                        backgroundColor: formPriority === p.toString() ? colors.primary + '22' : colors.muted,
                        borderColor: formPriority === p.toString() ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={[styles.priorityChipText, {
                        color: formPriority === p.toString() ? colors.primary : colors.mutedForeground,
                      }]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.priorityHint, { color: colors.mutedForeground }]}>
                  {PRIORITY_LABELS[parseInt(formPriority, 10)] ?? ''}
                </Text>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>{editTarget ? 'Save changes' : 'Add category'}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }}
      >
        {/* Header */}
        <LinearGradient colors={['#0a1a10', '#0f2217', '#132a1c']} style={[styles.header, { paddingTop: topPad + 16 }]}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Budget</Text>
            <View style={styles.headerRight}>
              <View style={styles.monthNav}>
                <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                  <Feather name="chevron-left" size={20} color="rgba(247,250,246,0.7)" />
                </Pressable>
                <Text style={styles.monthLabel}>{MONTHS_SHORT[month - 1]} {year}</Text>
                <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8} disabled={isCurrentMonth}>
                  <Feather name="chevron-right" size={20} color={isCurrentMonth ? 'rgba(247,250,246,0.2)' : 'rgba(247,250,246,0.7)'} />
                </Pressable>
              </View>
              <Pressable onPress={openAdd} style={styles.addBtn} hitSlop={4}>
                <Feather name="plus" size={18} color="#4ade80" />
              </Pressable>
            </View>
          </View>

          {!summaryLoading && summary ? (
            <View style={styles.overallCard}>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>Total Spent</Text>
                <Text style={styles.overallPct}>{Math.round(overallPct * 100)}%</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.barFill, { width: `${overallPct * 100}%`, backgroundColor: overallPct >= 1 ? '#f87171' : '#4ade80' }]} />
              </View>
              <View style={styles.overallAmounts}>
                <Text style={styles.overallSpent}>KES {formatKES(summary.totalSpent)}</Text>
                <Text style={styles.overallTarget}>of KES {formatKES(summary.totalBudget)}</Text>
              </View>
            </View>
          ) : summaryLoading ? <ActivityIndicator color="#4ade80" style={{ marginVertical: 16 }} /> : null}
        </LinearGradient>

        {/* Category list */}
        <View style={styles.list}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY CATEGORY</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
          ) : breakdown.length === 0 && unusedCats.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="bar-chart-2" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No categories yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Tap + to add your first budget category
              </Text>
            </View>
          ) : (
            <>
              {breakdown.map((cat) => {
                const pct = cat.budgetAmount > 0 ? Math.min(cat.spentAmount / cat.budgetAmount, 1) : 0;
                const isOver = cat.spentAmount > cat.budgetAmount && cat.budgetAmount > 0;
                const icon = CATEGORY_ICONS[cat.category] ?? 'more-horizontal';
                const fullCat = allCategories.find(c => c.name === cat.category);

                return (
                  <Pressable
                    key={cat.category}
                    onLongPress={() => fullCat && Alert.alert(cat.category, undefined, [
                      { text: 'Edit', onPress: () => fullCat && openEdit(fullCat) },
                      { text: 'Remove', style: 'destructive', onPress: () => fullCat && handleDelete(fullCat) },
                      { text: 'Cancel', style: 'cancel' },
                    ])}
                    style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.catTop}>
                      <View style={[styles.catIcon, { backgroundColor: isOver ? '#3a1a1a' : '#1a3320' }]}>
                        <Feather name={icon} size={16} color={isOver ? '#f87171' : '#4ade80'} />
                      </View>
                      <View style={styles.catInfo}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat.category}</Text>
                        <Text style={[styles.catRemaining, { color: isOver ? '#f87171' : colors.mutedForeground }]}>
                          {isOver ? `KES ${formatKES(cat.spentAmount - cat.budgetAmount)} over` : `KES ${formatKES(cat.remaining)} left`}
                        </Text>
                      </View>
                      <View style={styles.catActions}>
                        <View style={styles.catAmounts}>
                          <Text style={[styles.catSpent, { color: colors.foreground }]}>{formatKES(cat.spentAmount)}</Text>
                          <Text style={[styles.catBudget, { color: colors.mutedForeground }]}>/ {formatKES(cat.budgetAmount)}</Text>
                        </View>
                        {fullCat && (
                          <Pressable onPress={() => openEdit(fullCat)} hitSlop={8} style={styles.editBtn}>
                            <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: isOver ? '#f87171' : '#4ade80' }]} />
                    </View>
                  </Pressable>
                );
              })}
              {unusedCats.map(cat => {
                const icon = CATEGORY_ICONS[cat.name] ?? 'more-horizontal';
                return (
                  <Pressable
                    key={cat.id}
                    onLongPress={() => Alert.alert(cat.name, undefined, [
                      { text: 'Edit', onPress: () => openEdit(cat) },
                      { text: 'Remove', style: 'destructive', onPress: () => handleDelete(cat) },
                      { text: 'Cancel', style: 'cancel' },
                    ])}
                    style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.6 }]}
                  >
                    <View style={styles.catTop}>
                      <View style={[styles.catIcon, { backgroundColor: '#1a1a2a' }]}>
                        <Feather name={icon} size={16} color={colors.mutedForeground} />
                      </View>
                      <View style={styles.catInfo}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat.name}</Text>
                        <Text style={[styles.catRemaining, { color: colors.mutedForeground }]}>No spending yet</Text>
                      </View>
                      <View style={styles.catActions}>
                        <Text style={[styles.catBudget, { color: colors.mutedForeground }]}>KES {formatKES(cat.budgetAmount)}</Text>
                        <Pressable onPress={() => openEdit(cat)} hitSlop={8} style={styles.editBtn}>
                          <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.barFill, { width: '0%', backgroundColor: colors.border }]} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 14, color: '#f7faf6', fontFamily: 'Inter_500Medium', minWidth: 64, textAlign: 'center' },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center' },
  overallCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16 },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overallLabel: { fontSize: 12, color: '#7aaa8a', fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  overallPct: { fontSize: 14, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  overallAmounts: { flexDirection: 'row', gap: 6, marginTop: 10 },
  overallSpent: { fontSize: 16, fontWeight: '700' as const, color: '#f7faf6', fontFamily: 'Inter_700Bold' },
  overallTarget: { fontSize: 14, color: '#7aaa8a', fontFamily: 'Inter_400Regular', alignSelf: 'flex-end' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  list: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  catCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  catTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  catRemaining: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  catActions: { alignItems: 'flex-end', gap: 4 },
  catAmounts: { alignItems: 'flex-end' },
  catSpent: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  catBudget: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  editBtn: { padding: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, maxHeight: '85%' },
  handleBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  modalBody: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: 'Inter_400Regular' },
  priorityRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  priorityChipText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  priorityHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
