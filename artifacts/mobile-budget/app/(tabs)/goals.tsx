import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColors } from '@/hooks/useColors';
import {
  useGetSavingsGoals,
  useCreateSavingsGoal,
  useUpdateSavingsGoal,
  useDeleteSavingsGoal,
  useContributeToSavingsGoal,
  useGetSavingsGoalContributions,
  getGetSavingsGoalsQueryKey,
  type SavingsGoalContribution,
} from '@workspace/api-client-react';

function formatKES(n?: number | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdToDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatDateObj(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── DeadlinePicker ────────────────────────────────────────────────────────────
type DeadlinePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  colors: ReturnType<typeof useColors>;
};

function DeadlinePicker({ value, onChange, colors }: DeadlinePickerProps) {
  const [showNativePicker, setShowNativePicker] = useState(false);
  const webInputRef = useRef<HTMLInputElement | null>(null);

  const displayText = value ? formatDateObj(value) : 'No deadline';
  const hasValue = value !== null;

  const handleNativeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowNativePicker(false);
    if (selected) onChange(selected);
  };

  const handleClear = () => {
    onChange(null);
    if (Platform.OS === 'android') setShowNativePicker(false);
  };

  if (Platform.OS === 'web') {
    // On web: a styled button overlaid with a transparent <input type="date">
    return (
      <View
        style={[
          deadlineStyles.row,
          {
            backgroundColor: colors.muted,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <Feather name="calendar" size={16} color={hasValue ? colors.foreground : colors.mutedForeground} style={{ marginRight: 8 }} />
        <Text style={[deadlineStyles.valueText, { color: hasValue ? colors.foreground : colors.mutedForeground, flex: 1 }]}>
          {displayText}
        </Text>
        {hasValue && (
          <TouchableOpacity onPress={handleClear} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        {/* Transparent date input overlaid on top */}
        {/* @ts-ignore – web-only DOM element */}
        <input
          ref={webInputRef}
          type="date"
          value={value ? dateToYMD(value) : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            onChange(v ? ymdToDate(v) : null);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
        />
      </View>
    );
  }

  // Native (iOS / Android)
  return (
    <>
      <View
        style={[
          deadlineStyles.row,
          {
            backgroundColor: colors.muted,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <TouchableOpacity
          style={deadlineStyles.nativeBtn}
          onPress={() => setShowNativePicker(true)}
          activeOpacity={0.7}
        >
          <Feather name="calendar" size={16} color={hasValue ? colors.foreground : colors.mutedForeground} style={{ marginRight: 8 }} />
          <Text style={[deadlineStyles.valueText, { color: hasValue ? colors.foreground : colors.mutedForeground, flex: 1 }]}>
            {displayText}
          </Text>
        </TouchableOpacity>
        {hasValue && (
          <TouchableOpacity onPress={handleClear} hitSlop={8} style={{ paddingRight: 14 }}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {showNativePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal transparent animationType="slide" visible>
              <View style={deadlineStyles.iosOverlay}>
                <View style={[deadlineStyles.iosSheet, { backgroundColor: colors.background }]}>
                  <View style={[deadlineStyles.iosSheetHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => { setShowNativePicker(false); onChange(null); }}>
                      <Text style={[deadlineStyles.iosCancelText, { color: colors.mutedForeground }]}>Clear</Text>
                    </TouchableOpacity>
                    <Text style={[deadlineStyles.iosSheetTitle, { color: colors.foreground }]}>Select Deadline</Text>
                    <TouchableOpacity onPress={() => setShowNativePicker(false)}>
                      <Text style={[deadlineStyles.iosDoneText, { color: colors.primary as string }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={value ?? new Date()}
                    mode="date"
                    display="spinner"
                    onChange={handleNativeChange}
                    style={{ width: '100%' }}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={value ?? new Date()}
              mode="date"
              display="default"
              onChange={handleNativeChange}
            />
          )}
        </>
      )}
    </>
  );
}

const deadlineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
    overflow: 'hidden',
  },
  nativeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  valueText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  iosOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  iosSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  iosSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iosSheetTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  iosCancelText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  iosDoneText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
});

type SavingsGoal = {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string | null;
  isCompleted: boolean;
};

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const queryClient = useQueryClient();

  const { data: goals = [], isLoading, refetch } = useGetSavingsGoals();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── New Goal modal ──────────────────────────────────────────────────────────
  const [newGoalVisible, setNewGoalVisible] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadlineDate, setGoalDeadlineDate] = useState<Date | null>(null);
  const [submittingGoal, setSubmittingGoal] = useState(false);

  const { mutateAsync: createGoal } = useCreateSavingsGoal();

  const openNewGoal = () => {
    setGoalName('');
    setGoalTarget('');
    setGoalDeadlineDate(null);
    setNewGoalVisible(true);
  };

  const closeNewGoal = () => {
    if (submittingGoal) return;
    setNewGoalVisible(false);
  };

  const handleCreateGoal = async () => {
    const target = parseFloat(goalTarget.replace(/,/g, ''));
    if (!goalName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the goal.');
      return;
    }
    if (!target || target <= 0) {
      Alert.alert('Target required', 'Please enter a valid target amount.');
      return;
    }
    const deadlineValue = goalDeadlineDate ? dateToYMD(goalDeadlineDate) : undefined;

    setSubmittingGoal(true);
    try {
      await createGoal({
        data: {
          name: goalName.trim(),
          targetAmount: target,
          deadline: deadlineValue,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
      setNewGoalVisible(false);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to create goal. Please try again.');
    } finally {
      setSubmittingGoal(false);
    }
  };

  // ── Edit Goal modal ─────────────────────────────────────────────────────────
  const [editGoalVisible, setEditGoalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editDeadlineDate, setEditDeadlineDate] = useState<Date | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const { mutateAsync: updateGoal } = useUpdateSavingsGoal();
  const { mutateAsync: deleteGoal } = useDeleteSavingsGoal();

  const openEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setEditName(goal.name);
    setEditTarget(String(goal.targetAmount));
    setEditDeadlineDate(ymdToDate(goal.deadline));
    setEditGoalVisible(true);
  };

  const closeEditGoal = () => {
    if (submittingEdit) return;
    setEditGoalVisible(false);
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;
    const target = parseFloat(editTarget.replace(/,/g, ''));
    if (!editName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the goal.');
      return;
    }
    if (!target || target <= 0) {
      Alert.alert('Target required', 'Please enter a valid target amount.');
      return;
    }
    const deadlineValue = editDeadlineDate ? dateToYMD(editDeadlineDate) : null;

    setSubmittingEdit(true);
    try {
      await updateGoal({
        id: editingGoal.id,
        data: {
          name: editName.trim(),
          targetAmount: target,
          deadline: deadlineValue,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
      setEditGoalVisible(false);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to update goal. Please try again.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const confirmDeleteGoal = (goal: SavingsGoal) => {
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${goal.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGoal({ id: goal.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', 'Failed to delete goal. Please try again.');
            }
          },
        },
      ],
    );
  };

  const openGoalActions = (goal: SavingsGoal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(goal.name, undefined, [
      { text: 'History', onPress: () => openHistory(goal) },
      { text: 'Edit', onPress: () => openEditGoal(goal) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteGoal(goal) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Rename completed goal ────────────────────────────────────────────────────
  const [renameVisible, setRenameVisible] = useState(false);
  const [renamingGoal, setRenamingGoal] = useState<SavingsGoal | null>(null);
  const [renameName, setRenameName] = useState('');
  const [submittingRename, setSubmittingRename] = useState(false);

  const openRenameGoal = (goal: SavingsGoal) => {
    setRenamingGoal(goal);
    setRenameName(goal.name);
    setRenameVisible(true);
  };

  const closeRenameGoal = () => {
    if (submittingRename) return;
    setRenameVisible(false);
  };

  const handleRenameGoal = async () => {
    if (!renamingGoal) return;
    if (!renameName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the goal.');
      return;
    }
    setSubmittingRename(true);
    try {
      await updateGoal({
        id: renamingGoal.id,
        data: {
          name: renameName.trim(),
          targetAmount: renamingGoal.targetAmount,
          deadline: renamingGoal.deadline ?? null,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
      setRenameVisible(false);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to rename goal. Please try again.');
    } finally {
      setSubmittingRename(false);
    }
  };

  const openCompletedGoalActions = (goal: SavingsGoal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(goal.name, undefined, [
      { text: 'Rename', onPress: () => openRenameGoal(goal) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteGoal(goal) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── History modal ───────────────────────────────────────────────────────────
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  const { data: contributions = [], isLoading: historyLoading, refetch: refetchHistory } = useGetSavingsGoalContributions(
    historyGoal?.id ?? 0,
    { query: { enabled: historyVisible && !!historyGoal } }
  );

  const openHistory = (goal: SavingsGoal) => {
    setHistoryGoal(goal);
    setHistoryVisible(true);
  };

  const closeHistory = () => setHistoryVisible(false);

  // ── Contribute modal ────────────────────────────────────────────────────────
  const [contributeVisible, setContributeVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [submittingContrib, setSubmittingContrib] = useState(false);

  const { mutateAsync: contribute } = useContributeToSavingsGoal();

  const openContribute = (goal: SavingsGoal) => {
    setSelectedGoal(goal);
    setContributeAmount('');
    setContributeVisible(true);
  };

  const closeContribute = () => {
    if (submittingContrib) return;
    setContributeVisible(false);
  };

  const handleContribute = async () => {
    if (!selectedGoal) return;
    const amount = parseFloat(contributeAmount.replace(/,/g, ''));
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount greater than zero.');
      return;
    }

    setSubmittingContrib(true);
    try {
      await contribute({ id: selectedGoal.id, data: { amount } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: getGetSavingsGoalsQueryKey() });
      setContributeVisible(false);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to record contribution. Please try again.');
    } finally {
      setSubmittingContrib(false);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const active = (goals as SavingsGoal[]).filter((g) => !g.isCompleted);
  const done = (goals as SavingsGoal[]).filter((g) => g.isCompleted);
  const totalSaved = (goals as SavingsGoal[]).reduce((s, g) => s + (g.currentAmount ?? 0), 0);
  const totalTarget = (goals as SavingsGoal[]).reduce((s, g) => s + (g.targetAmount ?? 0), 0);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
        }
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 }}
      >
        {/* Header */}
        <LinearGradient
          colors={['#0a1a10', '#0f2217', '#132a1c']}
          style={[styles.header, { paddingTop: topPad + 16 }]}
        >
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Savings Goals</Text>
            <TouchableOpacity style={styles.newGoalBtn} onPress={openNewGoal} activeOpacity={0.8}>
              <Feather name="plus" size={16} color="#0a1a10" />
              <Text style={styles.newGoalBtnText}>New Goal</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Saved</Text>
              <Text style={styles.headerStatValue}>KES {formatKES(totalSaved)}</Text>
            </View>
            <View style={styles.headerDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Target</Text>
              <Text style={styles.headerStatValue}>KES {formatKES(totalTarget)}</Text>
            </View>
            <View style={styles.headerDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatLabel}>Goals</Text>
              <Text style={styles.headerStatValue}>{goals.length}</Text>
            </View>
          </View>
        </LinearGradient>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : goals.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="target" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No savings goals yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Tap "New Goal" to create your first goal
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {active.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACTIVE</Text>
                {active.map((goal) => {
                  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
                  return (
                    <Pressable
                      key={goal.id}
                      onLongPress={() => openGoalActions(goal)}
                      delayLongPress={400}
                      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.cardTop}>
                        <View style={[styles.iconCircle, { backgroundColor: '#1a3320' }]}>
                          <Feather name="target" size={18} color="#4ade80" />
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={[styles.cardName, { color: colors.foreground }]}>{goal.name}</Text>
                          {goal.deadline ? (
                            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                              Due {formatDate(goal.deadline)}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.cardRight}>
                          <Text style={[styles.cardPct, { color: '#4ade80' }]}>{Math.round(pct * 100)}%</Text>
                          <TouchableOpacity
                            onPress={() => openGoalActions(goal)}
                            hitSlop={8}
                            style={styles.kebabBtn}
                          >
                            <Feather name="more-vertical" size={18} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: '#4ade80' }]} />
                      </View>

                      <View style={styles.cardBottom}>
                        <View style={styles.cardAmounts}>
                          <Text style={[styles.cardAmountSaved, { color: colors.foreground }]}>
                            KES {formatKES(goal.currentAmount)} saved
                          </Text>
                          <Text style={[styles.cardAmountTarget, { color: colors.mutedForeground }]}>
                            of KES {formatKES(goal.targetAmount)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => openContribute(goal)}
                          style={({ pressed }) => [
                            styles.contributeBtn,
                            { backgroundColor: '#1a3320', opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <Feather name="plus-circle" size={13} color="#4ade80" />
                          <Text style={styles.contributeBtnText}>Contribute</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}

            {done.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>COMPLETED</Text>
                {done.map((goal) => (
                  <Pressable
                    key={goal.id}
                    onLongPress={() => openCompletedGoalActions(goal)}
                    delayLongPress={400}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.7 }]}
                  >
                    <View style={styles.cardTop}>
                      <View style={[styles.iconCircle, { backgroundColor: '#1a2e10' }]}>
                        <Feather name="check-circle" size={18} color="#86efac" />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={[styles.cardName, { color: colors.foreground }]}>{goal.name}</Text>
                        <Text style={[styles.cardSub, { color: '#4ade80' }]}>Goal reached!</Text>
                      </View>
                      <View style={styles.cardRight}>
                        <Text style={[styles.cardPct, { color: '#86efac' }]}>
                          KES {formatKES(goal.currentAmount)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => openCompletedGoalActions(goal)}
                          hitSlop={8}
                          style={styles.kebabBtn}
                        >
                          <Feather name="more-vertical" size={18} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── New Goal Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={newGoalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeNewGoal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeNewGoal} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Savings Goal</Text>
                    <TouchableOpacity
                      onPress={handleCreateGoal}
                      disabled={submittingGoal}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingGoal ? 0.7 : 1 }]}
                    >
                      {submittingGoal ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Create</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalBody}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Goal name */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GOAL NAME</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. Emergency Fund"
                      placeholderTextColor={colors.mutedForeground}
                      value={goalName}
                      onChangeText={setGoalName}
                      autoFocus
                      returnKeyType="next"
                    />

                    {/* Target amount */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TARGET AMOUNT (KES)</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. 50000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={goalTarget}
                      onChangeText={setGoalTarget}
                      returnKeyType="next"
                    />

                    {/* Deadline */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEADLINE (optional)</Text>
                    <DeadlinePicker
                      value={goalDeadlineDate}
                      onChange={setGoalDeadlineDate}
                      colors={colors}
                    />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Contribute Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={contributeVisible}
        animationType="slide"
        transparent
        onRequestClose={closeContribute}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeContribute} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                      Contribute
                    </Text>
                    <TouchableOpacity
                      onPress={handleContribute}
                      disabled={submittingContrib}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingContrib ? 0.7 : 1 }]}
                    >
                      {submittingContrib ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalBody}>
                    {/* Goal context pill */}
                    {selectedGoal && (
                      <View style={[styles.goalPill, { backgroundColor: '#1a3320' }]}>
                        <Feather name="target" size={14} color="#4ade80" />
                        <Text style={styles.goalPillText} numberOfLines={1}>
                          {selectedGoal.name}
                        </Text>
                        <Text style={styles.goalPillSub}>
                          KES {formatKES(selectedGoal.currentAmount)} / {formatKES(selectedGoal.targetAmount)}
                        </Text>
                      </View>
                    )}

                    {/* Amount input */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT (KES)</Text>
                    <View style={styles.amountRow}>
                      <Text style={[styles.currencyLabel, { color: colors.mutedForeground }]}>KES</Text>
                      <TextInput
                        style={[styles.amountInput, { color: colors.foreground }]}
                        placeholder="0"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numeric"
                        value={contributeAmount}
                        onChangeText={setContributeAmount}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleContribute}
                      />
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── History Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        transparent
        onRequestClose={closeHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.historySheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={closeHistory} style={styles.modalHeaderBtn}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {historyGoal?.name}
                </Text>
                <Text style={[styles.historySubtitle, { color: colors.mutedForeground }]}>Contribution history</Text>
              </View>
              <TouchableOpacity
                onPress={() => refetchHistory()}
                style={[styles.modalHeaderBtn, { opacity: historyLoading ? 0.4 : 1 }]}
                disabled={historyLoading}
              >
                <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            {historyLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
            ) : contributions.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Feather name="clock" size={36} color={colors.mutedForeground} />
                <Text style={[styles.historyEmptyTitle, { color: colors.foreground }]}>No contributions yet</Text>
                <Text style={[styles.historyEmptyText, { color: colors.mutedForeground }]}>
                  Tap "Contribute" on the goal card to start saving
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.historyList}
              >
                {(contributions as SavingsGoalContribution[]).map((c, idx) => (
                  <View
                    key={c.id}
                    style={[
                      styles.historyRow,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth: idx < contributions.length - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <View style={[styles.historyDot, { backgroundColor: '#1a3320' }]}>
                      <Feather name="arrow-up-circle" size={16} color="#4ade80" />
                    </View>
                    <View style={styles.historyRowInfo}>
                      <Text style={[styles.historyAmount, { color: colors.foreground }]}>
                        + KES {formatKES(c.amount)}
                      </Text>
                      <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                        {formatDate(c.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Edit Goal Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={editGoalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeEditGoal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeEditGoal} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Goal</Text>
                    <TouchableOpacity
                      onPress={handleUpdateGoal}
                      disabled={submittingEdit}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingEdit ? 0.7 : 1 }]}
                    >
                      {submittingEdit ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalBody}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Goal name */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GOAL NAME</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. Emergency Fund"
                      placeholderTextColor={colors.mutedForeground}
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      returnKeyType="next"
                    />

                    {/* Target amount */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TARGET AMOUNT (KES)</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. 50000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={editTarget}
                      onChangeText={setEditTarget}
                      returnKeyType="next"
                    />

                    {/* Deadline */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEADLINE (optional)</Text>
                    <DeadlinePicker
                      value={editDeadlineDate}
                      onChange={setEditDeadlineDate}
                      colors={colors}
                    />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Rename Completed Goal Modal ────────────────────────────────────── */}
      <Modal
        visible={renameVisible}
        animationType="slide"
        transparent
        onRequestClose={closeRenameGoal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeRenameGoal} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rename Goal</Text>
                    <TouchableOpacity
                      onPress={handleRenameGoal}
                      disabled={submittingRename}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingRename ? 0.7 : 1 }]}
                    >
                      {submittingRename ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalBody}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GOAL NAME</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. Emergency Fund"
                      placeholderTextColor={colors.mutedForeground}
                      value={renameName}
                      onChangeText={setRenameName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleRenameGoal}
                    />
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  newGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4ade80',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newGoalBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  headerStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerStatValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  headerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  list: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  kebabBtn: { padding: 4 },
  cardPct: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: { height: '100%', borderRadius: 4 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardAmounts: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  cardAmountSaved: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  cardAmountTarget: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    flexShrink: 0,
  },
  contributeBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#4ade80',
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
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
  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalAvoid: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalHeaderBtn: { padding: 4 },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 68,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
  },
  // Contribute modal
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  goalPillText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#4ade80',
    flex: 1,
  },
  goalPillSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#7aaa8a',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  currencyLabel: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 6,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '800' as const,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    letterSpacing: -1,
  },
  // History modal
  historySheet: {
    maxHeight: '80%',
  },
  historySubtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 40,
    gap: 10,
  },
  historyEmptyTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  historyEmptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  historyList: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  historyDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  historyRowInfo: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  historyDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
