import React, { useState, useCallback } from 'react';
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
import { useColors } from '@/hooks/useColors';
import {
  useGetSavingsGoals,
  useCreateSavingsGoal,
  useContributeToSavingsGoal,
  getGetSavingsGoalsQueryKey,
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
  const [goalDeadline, setGoalDeadline] = useState('');
  const [submittingGoal, setSubmittingGoal] = useState(false);

  const { mutateAsync: createGoal } = useCreateSavingsGoal();

  const openNewGoal = () => {
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline('');
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
    // Basic date validation (YYYY-MM-DD)
    const deadlineValue = goalDeadline.trim() || undefined;
    if (deadlineValue && !/^\d{4}-\d{2}-\d{2}$/.test(deadlineValue)) {
      Alert.alert('Invalid date', 'Enter the deadline as YYYY-MM-DD, or leave it blank.');
      return;
    }

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
                    <View key={goal.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                    </View>
                  );
                })}
              </>
            )}

            {done.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>COMPLETED</Text>
                {done.map((goal) => (
                  <View key={goal.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.7 }]}>
                    <View style={styles.cardTop}>
                      <View style={[styles.iconCircle, { backgroundColor: '#1a2e10' }]}>
                        <Feather name="check-circle" size={18} color="#86efac" />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={[styles.cardName, { color: colors.foreground }]}>{goal.name}</Text>
                        <Text style={[styles.cardSub, { color: '#4ade80' }]}>Goal reached!</Text>
                      </View>
                      <Text style={[styles.cardPct, { color: '#86efac' }]}>
                        KES {formatKES(goal.currentAmount)}
                      </Text>
                    </View>
                  </View>
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
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEADLINE (optional, YYYY-MM-DD)</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. 2026-12-31"
                      placeholderTextColor={colors.mutedForeground}
                      value={goalDeadline}
                      onChangeText={setGoalDeadline}
                      returnKeyType="done"
                      onSubmitEditing={handleCreateGoal}
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
  cardRight: { alignItems: 'flex-end' },
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
});
