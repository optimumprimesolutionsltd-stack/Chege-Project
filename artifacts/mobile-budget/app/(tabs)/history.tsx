import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  useGetExpenses,
  useGetDashboardActivity,
  useUpdateExpense,
  useDeleteExpense,
  useApplyRecurringExpenses,
  useGetBudgetCategories,
  useGetMembers,
  getGetExpensesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardCategoryBreakdownQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import ActivityCard, { type ActivityItem } from '@/components/ActivityCard';
import { ACTIVITY_TYPE } from '@/lib/activityTypes';

const MONTH_PREF_KEY = 'expenses_month_pref';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Food: 'shopping-cart', Transport: 'truck', Health: 'heart', Education: 'book',
  Utilities: 'zap', Entertainment: 'tv', Clothing: 'tag', Savings: 'archive',
  Housing: 'home', Communication: 'phone', Other: 'more-horizontal',
};

const PALETTE = ['#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#3b82f6', '#a855f7', '#ef4444'];
type IncomeSource = { id: number; name: string; isMain: boolean; userId: string };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatKES(n: number) {
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Expense = {
  id: number;
  amount: number;
  category: string;
  description: string;
  notes?: string | null;
  paidById: string;
  paidByName: string;
  isRecurring: boolean;
  date: string;
  createdAt: string;
};

type EditForm = {
  amount: string;
  category: string;
  description: string;
  notes: string;
  paidById: string;
  date: string;
};

type FeedTab = 'expenses' | 'activity';

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<FeedTab>('expenses');

  // Restore last-viewed month from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(MONTH_PREF_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { m, y } = JSON.parse(raw);
        if (typeof m === 'number' && typeof y === 'number') {
          setMonth(m);
          setYear(y);
        }
      } catch {}
    });
  }, []);

  // Persist selected month whenever it changes
  useEffect(() => {
    AsyncStorage.setItem(MONTH_PREF_KEY, JSON.stringify({ m: month, y: year })).catch(() => {});
  }, [month, year]);

  // Build list of last 24 months (most-recent first)
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

  function jumpToMonth(m: number, y: number) {
    setMonth(m);
    setYear(y);
    setPickerVisible(false);
  }

  const { data: expenses = [], isLoading, refetch } = useGetExpenses({ month, year });
  const prevMonthNum = month === 1 ? 12 : month - 1;
  const prevYearNum = month === 1 ? year - 1 : year;
  const { data: prevExpenses = [] } = useGetExpenses({ month: prevMonthNum, year: prevYearNum });
  const recurringFromPrev = prevExpenses.filter((e: Expense) => e.isRecurring);
  const alreadyApplied = expenses.some((e: Expense) => e.isRecurring);
  const showRecurringBanner = recurringFromPrev.length > 0 && !alreadyApplied &&
    month === now.getMonth() + 1 && year === now.getFullYear();
  const applyRecurring = useApplyRecurringExpenses();
  const [applyingRecurring, setApplyingRecurring] = useState(false);
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: members = [] } = useGetMembers();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const handleApplyRecurring = async () => {
    setApplyingRecurring(true);
    try {
      await applyRecurring.mutateAsync({ data: { month, year } });
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    } catch {
      Alert.alert('Error', 'Could not apply recurring expenses.');
    } finally {
      setApplyingRecurring(false);
    }
  };

  // Activity feed (for the "Activity" tab)
  const { data: activityFeed = [], isLoading: activityLoading, refetch: refetchActivity } = useGetDashboardActivity();

  // Grouped activity — collapsed by default, tap header to expand
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((date: string) => {
    setExpandedGroups(s => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }, []);

  type GroupHeaderRow = {
    _kind: 'header';
    date: string; dateLabel: string;
    items: ActivityItem[];
    totalExpenses: number; totalDeposits: number; count: number;
  };
  type GroupChildRow = { _kind: 'child'; groupDate: string; item: ActivityItem };
  type ActivityRow = GroupHeaderRow | GroupChildRow;

  const activityRows = useMemo((): ActivityRow[] => {
    const groups = new Map<string, ActivityItem[]>();
    for (const raw of activityFeed) {
      const item = raw as ActivityItem;
      const day = (item.date ?? '').slice(0, 10);
      if (!day) continue;
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(item);
    }
    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const rows: ActivityRow[] = [];
    for (const date of sortedDates) {
      const items = groups.get(date)!;
      const totalExpenses = items
        .filter(i => i.type === ACTIVITY_TYPE.EXPENSE)
        .reduce((s, i) => s + (i.amount ?? 0), 0);
      const totalDeposits = items
        .filter(i => i.type !== ACTIVITY_TYPE.EXPENSE)
        .reduce((s, i) => s + (i.amount ?? 0), 0);
      let dateLabel: string;
      if (date === todayStr) dateLabel = 'Today';
      else if (date === yesterdayStr) dateLabel = 'Yesterday';
      else {
        const d = new Date(date + 'T12:00:00');
        dateLabel = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
      }
      rows.push({ _kind: 'header', date, dateLabel, items, totalExpenses, totalDeposits, count: items.length });
      if (expandedGroups.has(date)) {
        for (const item of items) rows.push({ _kind: 'child', groupDate: date, item });
      }
    }
    return rows;
  }, [activityFeed, expandedGroups]);

  // Grouped expenses — same expand/collapse pattern as activity
  type ExpGroupHeader = {
    _kind: 'exp-header';
    date: string; dateLabel: string;
    items: Expense[];
    total: number; count: number;
  };
  type ExpGroupChild = { _kind: 'exp-child'; groupDate: string; item: Expense };
  type ExpGroupRow = ExpGroupHeader | ExpGroupChild;

  const expenseRows = useMemo((): ExpGroupRow[] => {
    const groups = new Map<string, Expense[]>();
    for (const exp of expenses as Expense[]) {
      const day = (exp.date ?? '').slice(0, 10);
      if (!day) continue;
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(exp);
    }
    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const result: ExpGroupRow[] = [];
    for (const date of sortedDates) {
      const items = groups.get(date)!;
      const total = items.reduce((s, e) => s + e.amount, 0);
      let dateLabel: string;
      if (date === todayStr) dateLabel = 'Today';
      else if (date === yesterdayStr) dateLabel = 'Yesterday';
      else {
        const d = new Date(date + 'T12:00:00');
        dateLabel = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
      }
      result.push({ _kind: 'exp-header', date, dateLabel, items, total, count: items.length });
      if (expandedGroups.has(date)) {
        for (const item of items) result.push({ _kind: 'exp-child', groupDate: date, item });
      }
    }
    return result;
  }, [expenses, expandedGroups]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'activity') {
      await refetchActivity();
    } else {
      await refetch();
    }
    setRefreshing(false);
  }, [refetch, refetchActivity, activeTab]);

  // Edit modal state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ amount: '', category: '', description: '', notes: '', paidById: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [editPaidFromBank, setEditPaidFromBank] = useState(false);
  const [editSelectedSources, setEditSelectedSources] = useState<string[]>([]);
  const [editSplitAmounts, setEditSplitAmounts] = useState<Record<string, string>>({});
  const [editShowDatePicker, setEditShowDatePicker] = useState(false);

  // Load income sources for whoever paid the expense being edited
  const { data: editSources = [], isLoading: editSourcesLoading } = useQuery<IncomeSource[]>({
    queryKey: ['income-sources', editForm.paidById],
    queryFn: async () => {
      if (!editForm.paidById) return [];
      const res = await fetch(`/api/income-sources?userId=${editForm.paidById}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!editForm.paidById,
    staleTime: 60_000,
  });

  const openEdit = (exp: Expense) => {
    setEditForm({
      amount: String(exp.amount),
      category: exp.category,
      description: exp.description,
      notes: exp.notes ?? '',
      // Fall back to the logged-in user when paidById is missing on old expenses
      paidById: exp.paidById ?? user?.userId ?? '',
      date: exp.date,
    });
    setEditPaidFromBank(false);
    setEditSelectedSources([]);
    setEditSplitAmounts({});
    setEditShowDatePicker(false);
    setEditingExpense(exp);
  };

  const closeEdit = () => { setEditingExpense(null); setSaving(false); };

  const handleSave = async () => {
    if (!editingExpense) return;
    const parsed = parseFloat(editForm.amount);
    if (!parsed || parsed <= 0 || !editForm.category || !editForm.description || !editForm.date) {
      Alert.alert('Missing fields', 'Please fill in amount, category, description and date.');
      return;
    }
    if (!editForm.paidById) {
      Alert.alert('Paid by required', 'Please choose who paid for this expense.');
      return;
    }
    if (editForm.date > todayIso()) {
      Alert.alert('Future date not allowed', 'Expenses must be today or earlier.');
      return;
    }
    // Validate split amounts if multiple personal sources chosen
    if (editSelectedSources.length > 1) {
      const splitsTotal = editSelectedSources.reduce((s, k) => s + (parseFloat(editSplitAmounts[k] || '0') || 0), 0);
      if (Math.abs(splitsTotal - parsed) >= 1) {
        Alert.alert("Amounts don't add up", `Sources total KES ${splitsTotal.toLocaleString()} but expense is KES ${parsed.toLocaleString()}.`);
        return;
      }
    }
    const isSplit = editSelectedSources.length > 1;
    const incomeSplits = editSelectedSources.map(name => ({
      label: name,
      amount: isSplit ? (parseFloat(editSplitAmounts[name] || '0') || 0) : parsed,
    })).filter(s => s.amount > 0);
    setSaving(true);
    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        data: {
          amount: parsed,
          category: editForm.category,
          description: editForm.description,
          notes: editForm.notes || undefined,
          paidById: editForm.paidById,
          date: editForm.date,
          isRecurring: editingExpense.isRecurring,
          paidFromBank: editPaidFromBank,
          ...(incomeSplits.length > 0 ? { incomeSplits } : {}),
        } as Parameters<typeof updateExpense.mutateAsync>[0]['data'],
      });
      queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
      closeEdit();
    } catch {
      Alert.alert('Error', 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (exp: Expense) => {
    Alert.alert('Delete expense', `Delete "${exp.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteExpense.mutateAsync({ id: exp.id });
            queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey({ month, year }) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
          } catch {
            Alert.alert('Error', 'Could not delete expense.');
          }
        },
      },
    ]);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {/* Title row */}
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {activeTab === 'expenses' ? 'Expenses' : 'Activity'}
          </Text>
          {activeTab === 'expenses' && expenses.length > 0 && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {expenses.length} entries · KES {formatKES(totalSpent)}
            </Text>
          )}
          {activeTab === 'activity' && activityFeed.length > 0 && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Recent {activityFeed.length} items
            </Text>
          )}
        </View>

        {/* Segment switcher + month nav */}
        <View style={styles.headerControls}>
          {/* Tab toggle */}
          <View style={[styles.segmentBar, { backgroundColor: colors.muted }]}>
            <Pressable
              onPress={() => setActiveTab('expenses')}
              style={[styles.segmentBtn, activeTab === 'expenses' && { backgroundColor: colors.card, borderRadius: 8 }]}
            >
              <Feather name="list" size={13} color={activeTab === 'expenses' ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: activeTab === 'expenses' ? colors.foreground : colors.mutedForeground }]}>Expenses</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('activity')}
              style={[styles.segmentBtn, activeTab === 'activity' && { backgroundColor: colors.card, borderRadius: 8 }]}
            >
              <Feather name="activity" size={13} color={activeTab === 'activity' ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: activeTab === 'activity' ? colors.foreground : colors.mutedForeground }]}>Activity</Text>
            </Pressable>
          </View>

          {/* Month nav — only in expenses tab */}
          {activeTab === 'expenses' && (
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => setPickerVisible(true)} hitSlop={6} style={styles.monthLabelBtn}>
                <Text style={[styles.monthLabel, { color: colors.foreground }]}>{MONTHS_SHORT[month - 1]} {year}</Text>
                <Feather name="chevron-down" size={12} color={colors.mutedForeground} style={{ marginLeft: 3 }} />
              </Pressable>
              <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8} disabled={isCurrentMonth}>
                <Feather name="chevron-right" size={20} color={isCurrentMonth ? colors.border : colors.mutedForeground} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Month Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
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
                        style={[styles.pickerItem, selected && { backgroundColor: colors.accent }]}
                      >
                        <Text style={[styles.pickerItemText, { color: selected ? colors.accentForeground : colors.foreground }, selected && { fontFamily: 'Inter_700Bold' }]}>
                          {item.label}
                        </Text>
                        {selected && <Feather name="check" size={16} color={colors.accentForeground} />}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Recurring banner — expenses tab only */}
      {activeTab === 'expenses' && showRecurringBanner && (
        <Pressable
          onPress={handleApplyRecurring}
          disabled={applyingRecurring}
          style={[styles.recurringBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="refresh-cw" size={15} color={colors.primary} />
          <Text style={[styles.recurringBannerText, { color: colors.foreground }]}>
            {recurringFromPrev.length} repeating expense{recurringFromPrev.length !== 1 ? 's' : ''} from last month — tap to add them
          </Text>
          <Text style={[styles.recurringBannerAction, { color: colors.primary }]}>
            {applyingRecurring ? 'Adding…' : 'Add now'}
          </Text>
        </Pressable>
      )}

      {activeTab === 'expenses' ? (
        isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : (
          <FlatList
            data={expenseRows}
            keyExtractor={(row) =>
              row._kind === 'exp-header'
                ? `ehdr-${row.date}`
                : `echild-${row.groupDate}-${row.item.id}`
            }
            renderItem={({ item: row }) => {
              if (row._kind === 'exp-header') {
                const expanded = expandedGroups.has(row.date);
                return (
                  <Pressable
                    onPress={() => toggleGroup(row.date)}
                    style={[styles.groupHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.groupHeaderLeft}>
                      <Text style={[styles.groupDate, { color: colors.foreground }]}>{row.dateLabel}</Text>
                      <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
                        {row.count} expense{row.count !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.groupHeaderRight}>
                      <Text style={[styles.groupExpenseTotal, { color: colors.foreground }]}>
                        −{row.total.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </Text>
                      <Feather
                        name={expanded ? 'chevron-down' : 'chevron-right'}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </View>
                  </Pressable>
                );
              }
              return (
                <View style={styles.groupChild}>
                  <View style={[styles.groupChildLine, { backgroundColor: colors.border }]} />
                  <View style={styles.groupChildCard}>
                    <ExpenseRow
                      expense={row.item}
                      colors={colors}
                      onEdit={() => openEdit(row.item)}
                      onDelete={() => handleDelete(row.item)}
                    />
                  </View>
                </View>
              );
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="inbox" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No expenses</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{MONTHS_SHORT[month - 1]} {year} is empty</Text>
              </View>
            }
          />
        )
      ) : (
        activityLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : (
          <FlatList
            data={activityRows}
            keyExtractor={(row) =>
              row._kind === 'header' ? `hdr-${row.date}` : `child-${row.groupDate}-${row.item.id}`
            }
            renderItem={({ item: row }) => {
              if (row._kind === 'header') {
                const expanded = expandedGroups.has(row.date);
                return (
                  <Pressable
                    onPress={() => toggleGroup(row.date)}
                    style={[styles.groupHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    {/* Left: date + count */}
                    <View style={styles.groupHeaderLeft}>
                      <Text style={[styles.groupDate, { color: colors.foreground }]}>{row.dateLabel}</Text>
                      <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
                        {row.count} item{row.count !== 1 ? 's' : ''}
                      </Text>
                    </View>

                    {/* Right: totals + chevron */}
                    <View style={styles.groupHeaderRight}>
                      {row.totalExpenses > 0 && (
                        <Text style={[styles.groupExpenseTotal, { color: colors.foreground }]}>
                          −{row.totalExpenses.toLocaleString()}
                        </Text>
                      )}
                      {row.totalDeposits > 0 && (
                        <Text style={styles.groupDepositTotal}>
                          +{row.totalDeposits.toLocaleString()}
                        </Text>
                      )}
                      <Feather
                        name={expanded ? 'chevron-down' : 'chevron-right'}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </View>
                  </Pressable>
                );
              }
              // Child row — indented ActivityCard
              return (
                <View style={styles.groupChild}>
                  <View style={[styles.groupChildLine, { backgroundColor: colors.border }]} />
                  <View style={styles.groupChildCard}>
                    <ActivityCard item={row.item} colors={colors} />
                  </View>
                </View>
              );
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="activity" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No activity yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Expenses and contributions will appear here</Text>
              </View>
            }
          />
        )
      )}

      {/* Edit Modal */}
      <Modal visible={!!editingExpense} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              {/* Handle bar */}
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Expense</Text>
                <Pressable onPress={closeEdit} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                {/* Amount */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (KES)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.amount}
                  onChangeText={v => setEditForm(f => ({ ...f, amount: v }))}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Description */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.description}
                  onChangeText={v => setEditForm(f => ({ ...f, description: v }))}
                  placeholder="e.g. School fees"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Category */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {categories.map(c => {
                    const sel = editForm.category === c.name;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setEditForm(f => ({ ...f, category: c.name }))}
                        style={[styles.chip, { backgroundColor: sel ? colors.secondary : colors.muted, borderColor: sel ? colors.secondary : colors.border }]}
                      >
                        <Feather name={CATEGORY_ICONS[c.name] ?? 'tag'} size={12} color={sel ? '#fff' : colors.mutedForeground} />
                        <Text style={[styles.chipText, { color: sel ? '#fff' : colors.foreground }]}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Paid by */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Paid by <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <View style={styles.memberRow}>
                  {members.map(m => {
                    const sel = editForm.paidById === m.userId;
                    const name = m.userName?.split(' ')[0] ?? 'Member';
                    return (
                      <Pressable
                        key={m.userId}
                        onPress={() => setEditForm(f => ({ ...f, paidById: m.userId }))}
                        style={[styles.memberPill, { backgroundColor: sel ? '#4ade80' : colors.muted, borderColor: sel ? '#4ade80' : colors.border }]}
                      >
                        <Feather name="user" size={12} color={sel ? '#0a1a10' : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: sel ? '#0a1a10' : colors.foreground }]}>{name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!editForm.paidById && (
                  <Text style={[styles.memberPillText, { color: colors.mutedForeground, marginTop: 4 }]}>
                    Tap to choose who paid
                  </Text>
                )}

                {/* Funded From — optional when editing */}
                <View style={[styles.editFundingCard, { backgroundColor: colors.muted, borderColor: colors.primary + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Feather name="layers" size={13} color={colors.primary} />
                    <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>FUNDED FROM</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>(optional)</Text>
                  </View>

                  {/* Joint bank — standalone toggle */}
                  <Pressable
                    onPress={() => setEditPaidFromBank(b => !b)}
                    style={[styles.sourceChip, {
                      backgroundColor: editPaidFromBank ? 'rgba(56,189,248,0.15)' : colors.background,
                      borderColor: editPaidFromBank ? '#38bdf8' : colors.border,
                      alignSelf: 'flex-start', marginBottom: 8,
                    }]}
                  >
                    <Feather name="credit-card" size={12} color={editPaidFromBank ? '#38bdf8' : colors.mutedForeground} />
                    <Text style={[styles.sourceChipText, { color: editPaidFromBank ? '#38bdf8' : colors.foreground }]}>Joint bank</Text>
                    {editPaidFromBank && <Feather name="check" size={10} color="#38bdf8" />}
                  </Pressable>

                  {/* Personal income sources from DB */}
                  {editSourcesLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                  ) : editSources.length === 0 ? (
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                      No income sources — add them in Settings
                    </Text>
                  ) : (
                    <View style={styles.sourceChipsGrid}>
                      {editSources.map((src, idx) => {
                        const color = PALETTE[idx % PALETTE.length];
                        const selected = editSelectedSources.includes(src.name);
                        return (
                          <Pressable
                            key={src.id}
                            onPress={() => setEditSelectedSources(prev =>
                              prev.includes(src.name) ? prev.filter(k => k !== src.name) : [...prev, src.name]
                            )}
                            style={[styles.sourceChip, {
                              backgroundColor: selected ? color + '22' : colors.background,
                              borderColor: selected ? color : colors.border,
                            }]}
                          >
                            <Feather name="briefcase" size={12} color={selected ? color : colors.mutedForeground} />
                            <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>
                              {src.name}
                            </Text>
                            {selected && <Feather name="check" size={10} color={color} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {editSelectedSources.length > 1 && (
                    <View style={{ marginTop: 10, gap: 6 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                        How much from each source?
                      </Text>
                      {editSelectedSources.map((name, idx) => {
                        const color = PALETTE[idx % PALETTE.length];
                        return (
                          <View key={name} style={[styles.splitAmountRow, { backgroundColor: colors.background, borderColor: color + '44' }]}>
                            <Feather name="briefcase" size={13} color={color} />
                            <Text style={[styles.splitAmountLabel, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
                            <View style={styles.splitAmountInputBox}>
                              <Text style={[styles.splitCurrency, { color: colors.mutedForeground }]}>KES</Text>
                              <TextInput
                                style={[styles.splitAmountInput, { color }]}
                                placeholder="0"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="numeric"
                                value={editSplitAmounts[name] || ''}
                                onChangeText={v => setEditSplitAmounts(prev => ({ ...prev, [name]: v }))}
                              />
                            </View>
                          </View>
                        );
                      })}
                      {(() => {
                        const total = editSelectedSources.reduce((s, k) => s + (parseFloat(editSplitAmounts[k] || '0') || 0), 0);
                        const expAmt = parseFloat(editForm.amount) || 0;
                        const ok = expAmt > 0 && Math.abs(total - expAmt) < 1;
                        return (
                          <Text style={{ fontSize: 12, fontFamily: ok ? 'Inter_600SemiBold' : 'Inter_400Regular', color: ok ? '#4ade80' : '#f87171' }}>
                            {ok ? `✓ Sources add up to KES ${total.toLocaleString()}` : `Total: KES ${total.toLocaleString()} · need KES ${expAmt.toLocaleString()}`}
                          </Text>
                        );
                      })()}
                    </View>
                  )}
                </View>

                {/* Notes */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.notes}
                  onChangeText={v => setEditForm(f => ({ ...f, notes: v }))}
                  placeholder="Any extra details"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Date */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>
                    Date <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                    No future dates
                  </Text>
                </View>
                <Pressable
                  onPress={() => setEditShowDatePicker(true)}
                  style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                >
                  <Feather name="calendar" size={15} color={colors.primary} />
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                    {editForm.date
                      ? new Date(editForm.date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Select date'}
                  </Text>
                  {editForm.date === todayIso()
                    ? <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary, backgroundColor: colors.primary + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' }}>Today</Text>
                    : editForm.date
                    ? <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' }}>Backdated</Text>
                    : null}
                </Pressable>
                {editShowDatePicker && (
                  <DateTimePicker
                    value={editForm.date ? new Date(editForm.date + 'T00:00:00') : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    maximumDate={new Date()}
                    onChange={(_e: DateTimePickerEvent, sel?: Date) => {
                      setEditShowDatePicker(Platform.OS === 'ios');
                      if (sel) {
                        const y = sel.getFullYear();
                        const mo = String(sel.getMonth() + 1).padStart(2, '0');
                        const d = String(sel.getDate()).padStart(2, '0');
                        setEditForm(f => ({ ...f, date: `${y}-${mo}-${d}` }));
                      }
                    }}
                  />
                )}

                {/* Save */}
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function ExpenseRow({
  expense, colors, onEdit, onDelete,
}: {
  expense: Expense;
  colors: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const icon: keyof typeof Feather.glyphMap = CATEGORY_ICONS[expense.category] ?? 'shopping-bag';
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon} size={16} color={colors.accentForeground} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>{expense.description}</Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
          {expense.paidByName} · {expense.category} · {formatDate(expense.date)}
        </Text>
        {expense.notes ? <Text style={[styles.rowNotes, { color: colors.mutedForeground }]}>{expense.notes}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: colors.foreground }]}>
          −{expense.amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
        </Text>
        <View style={styles.rowActions}>
          <Pressable onPress={onEdit} hitSlop={6} style={styles.actionBtn}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={6} style={styles.actionBtn}>
            <Feather name="trash-2" size={14} color="#ef4444" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  headerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  segmentBar: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: { padding: 4 },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  monthLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', minWidth: 56, textAlign: 'center' },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center', paddingVertical: 12 },
  pickerList: { flexGrow: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginHorizontal: 12, marginVertical: 1 },
  pickerItemText: { fontSize: 16, fontFamily: 'Inter_500Medium' },

  recurringBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  recurringBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  recurringBannerAction: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  list: { paddingHorizontal: 14, paddingTop: 14 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 10, gap: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowInfo: { flex: 1 },
  rowDesc: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  rowNotes: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1, fontStyle: 'italic' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 14, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 2 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handleBar: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  modalBody: { paddingHorizontal: 20, paddingBottom: 40 },

  label: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },

  chipScroll: { marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  memberRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  memberPillText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },

  saveBtn: { marginTop: 24, backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', color: '#0a1a10' },

  // Grouped activity
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 4,
  },
  groupHeaderLeft: { gap: 2 },
  groupDate: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  groupCount: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  groupHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupExpenseTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  groupDepositTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#22c55e' },
  groupChild: { flexDirection: 'row', marginBottom: 0 },
  groupChildLine: { width: 2, marginLeft: 20, marginRight: 10, borderRadius: 1 },
  groupChildCard: { flex: 1 },

  // Funding card + source chips (edit modal)
  editFundingCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 4 },
  sourceChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderRadius: 8 },
  sourceChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  splitAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  splitAmountLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  splitAmountInputBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  splitCurrency: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  splitAmountInput: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 80, textAlign: 'right' as const },
});
