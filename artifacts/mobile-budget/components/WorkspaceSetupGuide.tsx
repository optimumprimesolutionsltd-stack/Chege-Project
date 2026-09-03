import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useGetJointAccounts,
  useGetMembers,
  useGetSavingsGoals,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  deriveWorkspaceSetup,
  firstIncompleteWorkspaceSetupStep,
  workspaceSetupStorageKey,
} from '@/lib/workspaceSetup';

export function WorkspaceSetupGuide() {
  const colors = useColors();
  const { user } = useAuth();
  const groupQuery = useGetGroup();
  const categoriesQuery = useGetBudgetCategories();
  const incomeQuery = useGetIncomeSources();
  const accountsQuery = useGetJointAccounts();
  const goalsQuery = useGetSavingsGoals();
  const membersQuery = useGetMembers();
  const group = groupQuery.data;
  const isShared = group?.isPrivate === false;
  const canManage = !isShared || group?.role === 'owner' || group?.role === 'admin'
    || (membersQuery.data ?? []).some((member) =>
      member.userId === user?.id && (member.role === 'owner' || member.role === 'admin'),
    );
  const workspaceId = group?.id;
  const storageKey = workspaceId == null ? null : workspaceSetupStorageKey(workspaceId);
  const [collapsed, setCollapsed] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setStorageReady(false);
    setReviewIndex(null);
    if (!storageKey) return () => { active = false; };
    AsyncStorage.getItem(storageKey)
      .then((value) => { if (active) setCollapsed(value === 'true'); })
      .catch(() => { if (active) setCollapsed(false); })
      .finally(() => { if (active) setStorageReady(true); });
    return () => { active = false; };
  }, [storageKey]);

  const queries = [groupQuery, categoriesQuery, incomeQuery, accountsQuery, goalsQuery, membersQuery];
  const checking = queries.some((query) => query.isLoading) || !storageReady;
  const errored = queries.some((query) => query.isError);
  const steps = useMemo(() => deriveWorkspaceSetup({
    categories: categoriesQuery.data,
    incomeSources: incomeQuery.data,
    bankAccounts: accountsQuery.data,
    goals: goalsQuery.data,
    members: membersQuery.data,
    isShared,
  }), [accountsQuery.data, categoriesQuery.data, goalsQuery.data, incomeQuery.data, isShared, membersQuery.data]);
  const nextStep = firstIncompleteWorkspaceSetupStep(steps);
  const completed = steps.filter((step) => step.complete).length;
  const nextStepIndex = steps.findIndex((step) => step.id === nextStep?.id);
  const activeIndex = reviewIndex == null ? nextStepIndex : reviewIndex;
  const reviewedStep = steps[Math.max(0, activeIndex)] ?? nextStep;
  const reviewingCompletedStep = reviewedStep?.id !== nextStep?.id && reviewedStep?.complete;

  if (!canManage || !workspaceId || (!checking && !errored && !nextStep)) return null;

  const retry = () => Promise.all(queries.map((query) => query.refetch()));
  const skip = () => {
    if (!storageKey) return;
    setCollapsed(true);
    AsyncStorage.setItem(storageKey, 'true').catch(() => {});
  };
  const expand = () => {
    if (!storageKey) return;
    setCollapsed(false);
    AsyncStorage.setItem(storageKey, 'false').catch(() => {});
  };

  return (
    <View testID="workspace-setup-guide" style={[styles.card, { backgroundColor: colors.card, borderColor: `${colors.secondary}88` }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${colors.secondary}20` }]}>
          <Feather name="compass" size={18} color={colors.secondary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>START HERE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Set up this budget</Text>
        </View>
        {collapsed && !checking && !errored ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open workspace setup" onPress={expand} style={[styles.startButton, { borderColor: colors.primary }]}>
            <Text style={[styles.startButtonText, { color: colors.primary }]}>Start here</Text>
          </Pressable>
        ) : null}
      </View>

      {checking ? (
        <View style={styles.status}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>Checking your setup…</Text></View>
      ) : errored ? (
        <View style={styles.status}>
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>We could not check your workspace setup.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry workspace setup" onPress={retry}><Text style={[styles.retry, { color: colors.primary }]}>Retry</Text></Pressable>
        </View>
      ) : !collapsed && nextStep && reviewedStep ? (
        <>
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: colors.mutedForeground }]}>{completed} of {steps.length} complete</Text>
            <Text style={[styles.progressText, { color: colors.primary }]}>{Math.round((completed / steps.length) * 100)}%</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: completed }} style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { backgroundColor: colors.secondary, width: `${(completed / steps.length) * 100}%` }]} />
          </View>
           <Text style={[styles.support, { color: colors.mutedForeground }]}>{completed === 0 ? 'A few quick choices will make this budget ready for you.' : completed === steps.length - 1 ? 'One more step and this budget is ready.' : completed >= 2 ? 'Almost there — this budget is taking shape.' : 'Great start — keep building this budget.'}</Text>
           <Text style={[styles.stepLabel, { color: colors.primary }]}>{reviewingCompletedStep ? 'COMPLETED STEP' : `STEP ${nextStepIndex + 1} OF ${steps.length}`}</Text>
           <Text style={[styles.step, { color: colors.foreground }]}>{reviewedStep.title}</Text>
          <View style={styles.actions}>
            {activeIndex > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Review previous setup step" onPress={() => setReviewIndex(activeIndex - 1)} style={styles.back}><Feather name="arrow-left" size={16} color={colors.primary} /><Text style={[styles.backText, { color: colors.primary }]}>Back</Text></Pressable> : <View />}
             <Pressable accessibilityRole="button" accessibilityLabel={reviewingCompletedStep ? 'Continue to next setup step' : nextStep.action} onPress={() => reviewingCompletedStep ? setReviewIndex(nextStepIndex) : router.push(nextStep.route)} style={[styles.primary, { backgroundColor: colors.primary }]}>
               <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{reviewingCompletedStep ? 'Continue to next step' : nextStep.action}</Text><Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip workspace setup for now" onPress={skip} style={styles.skip}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text></Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, borderWidth: 1, borderRadius: 16, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  headerCopy: { flex: 1 }, eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: .7 }, title: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 2 },
  startButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }, startButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 }, statusText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' }, retry: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }, progressText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 7 }, fill: { height: '100%', borderRadius: 4 },
  support: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 12 }, stepLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .6, marginTop: 12 }, step: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }, back: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10 }, backText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11 }, primaryText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  skip: { alignSelf: 'flex-end', marginTop: 7, paddingVertical: 5 }, skipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});