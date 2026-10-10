import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const pad = (value: number) => String(value).padStart(2, '0');
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** The earliest a budget can be set to finish: one ending today has no room
 *  left to record anything in. */
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
};
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useGetWorkspaces,
  useCreateSharedGroup,
  useSelectWorkspace,
  customFetch,
  type Workspace,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { BackToSignIn, SwitchAccountLink } from '@/components/SwitchAccountLink';
import {
  activateMobileWorkspace,
  completeMobileBudgetChooser,
  noAnswerFromServer,
  switchMobileWorkspace,
} from '@/lib/workspace';
import {
  SHARED_GROUP_KINDS,
  sharedGroupKindDetails,
  type SharedGroupKind,
} from '@/lib/groupKinds';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import {
  BUSINESS_PRESELECTED_CATEGORIES,
  COMMON_INCOME_STREAMS,
  GENERIC_BUSINESS_INCOME_STREAM,
  businessNameFromDraft,
  businessNamesFromDraft,
  businessesFromDraft,
  costsBusinessName,
  salaryIncomeName,
  BUSINESS_PAY_CHOICES,
  type BusinessPay,
  MAX_ONBOARDING_BUSINESSES,
  isBusinessCostCategory,
  budgetDurationLabels,
  incomeStreamsForMode,
  ALL_ONBOARDING_CATEGORIES,
  CATEGORY_HINTS,
  ONBOARDING_CATEGORY_TIERS,
  PURPOSE_OPTIONS,
  canonicalCategoryName,
  clearOnboardingDraft,
  dedupeCategoryNames,
  dedupeIncomeStreamNames,
  normalizeCategoryName,
  normalizeIncomeStreamName,
  onboardingSubcategoriesFor,
  plannedCategoryAmount,
  budgetingAppliesTo,
  groupKindForPersona,
  readOnboardingDraft,
  recommendedCategoriesForPurpose,
  saveOnboardingDraft,
  type MobileBudgetDuration,
  type MobileOnboardingDraft,
  type MobileOnboardingMode,
} from '@/lib/onboarding';
import { applyMobileOnboardingToWorkspace, saveMobileOnboardingPreferences, saveMobileOnboardingProgress } from '@/lib/onboarding-api';
import { usePrices } from '@/hooks/usePrices';
import { kesLabel } from '@/lib/pricing';

function sharedWorkspaceIcon(icon?: string | null): keyof typeof Feather.glyphMap {
  const icons: Record<string, keyof typeof Feather.glyphMap> = {
    users: 'users',
    home: 'home',
    heart: 'heart',
    briefcase: 'briefcase',
    award: 'award',
    star: 'star',
  };
  return icons[icon ?? ''] ?? 'users';
}

export default function BudgetChooserScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: workspaceList, isLoading: loadingWorkspaces, isPaused: workspacesPaused, error: workspaceError, refetch: refetchWorkspaces } = useGetWorkspaces();
  const workspaces = workspaceList ?? [];
  // Offline, or the server restarting: the list is unknown, not empty, and
  // nobody is sent through onboarding to make a second budget because of it
  // (9 Oct 2026). React Query pauses rather than fails a request made offline.
  const workspacesUnreachable = workspaceList === undefined && (workspacesPaused || noAnswerFromServer(workspaceError));
  const [unreachable, setUnreachable] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  const [error, setError] = useState<string | null>(null);
  const [createSharedOpen, setCreateSharedOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupKind, setNewGroupKind] = useState<SharedGroupKind | null>(null);
  // Whether the person has asked to override what onboarding implied.
  const [editingGroupKind, setEditingGroupKind] = useState(false);
  const [impliedGroupKind, setImpliedGroupKind] = useState<SharedGroupKind | null>(null);
  const [newGroupPurpose, setNewGroupPurpose] = useState<'budgeting' | 'saving' | 'debt' | null>(null);
  const [newGroupContribution, setNewGroupContribution] = useState('');
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [pendingOnboardingDraft, setPendingOnboardingDraft] = useState<MobileOnboardingDraft | null>(null);
  const [acceptingInviteId, setAcceptingInviteId] = useState<number | null>(null);
  const [invitesDismissed, setInvitesDismissed] = useState(false);

  type PendingInvite = { id: number; groupId: number; groupName: string; role: string; expiresAt: string };
  const { data: pendingInvites = [], refetch: refetchInvites } = useQuery<PendingInvite[]>({
    queryKey: ['group-invitations-mine'],
    queryFn: () => customFetch<PendingInvite[]>('/api/group-invitations/mine', { responseType: 'json' }),
    enabled: !!user?.id,
    retry: false,
  });

  const acceptInvite = async (invite: PendingInvite) => {
    if (acceptingInviteId) return;
    setError(null);
    setAcceptingInviteId(invite.id);
    try {
      await customFetch(`/api/group-invitations/mine/${invite.id}/accept`, { method: 'POST', responseType: 'json' });
      const { data: fresh } = await refetchWorkspaces();
      await refetchInvites();
      const joined = (fresh ?? []).find((workspace) => workspace.id === invite.groupId);
      if (joined) {
        await chooseWorkspace(joined);
      } else {
        setOnboardingComplete(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not accept this invitation. Please try again.');
    } finally {
      setAcceptingInviteId(null);
    }
  };

  useEffect(() => {
    let active = true;
    if (!user?.id || loadingWorkspaces) return () => { active = false; };
    if (workspacesUnreachable) {
      setUnreachable(true);
      setCheckingOnboarding(false);
      return () => { active = false; };
    }
    setCheckingOnboarding(true);
    let preferencesUnreachable = false;
    void Promise.all([
      customFetch<{ completed?: boolean } | null>('/api/onboarding/preferences', { responseType: 'json' }).catch((reason: unknown) => {
        preferencesUnreachable = noAnswerFromServer(reason);
        return null;
      }),
      readOnboardingDraft({ userId: user.id, storage: AsyncStorage }),
    ])
      .then(([preferences, savedDraft]) => {
        if (!active) return;
        // Whether onboarding was finished is unknown, not "no".
        setUnreachable(preferencesUnreachable);
        if (preferencesUnreachable) return;
        // Carry what onboarding already established, so creating a group does
        // not ask the same question a second time.
        setNewGroupPurpose(savedDraft?.budgetGoal ?? null);
        const implied = groupKindForPersona(savedDraft?.persona ?? null) as SharedGroupKind | null;
        if (implied) {
          setImpliedGroupKind(implied);
          setNewGroupKind((current) => current ?? implied);
        }
        const onboardingStartedButIncomplete = Boolean(savedDraft) || preferences?.completed === false;
        // Existing workspaces remain proof of completion only for legacy users
        // who have no explicit incomplete setup or saved draft.
        setOnboardingComplete(Boolean(preferences?.completed) || (workspaces.length > 0 && !onboardingStartedButIncomplete));
      })
      .catch(() => {
        if (active) setOnboardingComplete(workspaces.length > 0);
      })
      .finally(() => {
        if (active) setCheckingOnboarding(false);
      });
    return () => { active = false; };
  }, [loadingWorkspaces, user?.id, workspaces.length, workspacesUnreachable, recheck]);

  const privateWorkspace = workspaces.find((workspace) => workspace.isPrivate);
  const sharedWorkspaces = workspaces.filter((workspace) => !workspace.isPrivate);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  // Someone who told onboarding "shared" should not land on their Personal
  // budget by default just because it happens to exist — the chooser should
  // point at what they said they came here to do, not at whatever workspace
  // is first in an arbitrary priority order.
  const prefersShared = pendingOnboardingDraft?.usageMode === 'shared';
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
    ?? (prefersShared ? sharedWorkspaces[0] ?? null : privateWorkspace ?? sharedWorkspaces[0] ?? null);
  const selectedName = selectedWorkspace?.isPrivate ? 'Personal budget' : selectedWorkspace?.name ?? '';
  const finish = async () => {
    if (!user?.id) throw new Error('Your account could not be identified. Please sign in again.');
    await completeMobileBudgetChooser({ userId: user.id, storage: AsyncStorage });
    router.replace('/(tabs)');
  };
  const continueToWorkspaceChooser = async (draft: MobileOnboardingDraft) => {
    setPendingOnboardingDraft(draft);
    await refetchWorkspaces();
    setOnboardingComplete(true);
  };
  // Setup is a convenience, never a gate. Somebody here to run a group can step
  // straight to choosing or creating one; the questions can be answered later.
  const skipOnboarding = async () => {
    if (!user?.id) {
      setError('Your account could not be identified. Please sign in again.');
      return;
    }
    const skipped: MobileOnboardingDraft = {
      usageMode: 'shared',
      persona: null,
      coupleStage: null,
      budgetDuration: 'ongoing',
      customEndDate: '',
      lastStep: 0,
      selectedCategories: [],
      customCategories: [],
      categoryBudgets: {},
      selectedIncomeStreams: [],
      incomeAmounts: {},
    };
    try {
      await saveMobileOnboardingPreferences(skipped);
      await clearOnboardingDraft({ userId: user.id, storage: AsyncStorage });
      setPendingOnboardingDraft(null);
      await refetchWorkspaces();
      setOnboardingComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not skip setup right now. Please try again.');
    }
  };
  const chooseWorkspace = async (workspace: Workspace) => {
    if (selectWorkspace.isPending) return;
    setError(null);
    try {
      await switchMobileWorkspace({
        groupId: workspace.id,
        select: (groupId) => selectWorkspace.mutateAsync({ data: { groupId } }),
        storage: AsyncStorage,
        resetQueries: () => queryClient.resetQueries(),
      });
      if (pendingOnboardingDraft && user?.id) {
        await applyMobileOnboardingToWorkspace({ workspace, draft: pendingOnboardingDraft, userId: user.id });
        await clearOnboardingDraft({ userId: user.id, storage: AsyncStorage });
        setPendingOnboardingDraft(null);
      }
      await finish();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this budget. Please try again.');
    }
  };
  const createSharedBudget = async () => {
    const name = newGroupName.trim();
    if (name.length < 2) {
      setError('Enter a Shared group name with at least two characters.');
      return;
    }
    if (!newGroupKind) {
      setError('Choose what this Shared group is for.');
      return;
    }
    setError(null);
    try {
      // Carries what onboarding established, so the new budget starts with the
      // sections its purpose implies rather than every section by default.
      const workspace = await createSharedGroup.mutateAsync({
        data: { name, kind: newGroupKind, ...(newGroupPurpose ? { purpose: newGroupPurpose } : {}) },
      });
      await activateMobileWorkspace({
        groupId: workspace.id,
        storage: AsyncStorage,
        resetQueries: () => queryClient.resetQueries(),
      });
      // A group is never left as just a name: seed the categories Jamvi
      // recommends for this kind (additive only — never touches an existing
      // category) and, if given, set what each member owes. Creating a group
      // from the chooser is not run through the six-step wizard, so this is
      // the only chance those get set unless the treasurer visits Budget or
      // Contributions afterwards.
      try {
        await customFetch('/api/budget-categories/recommendations/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch {
        // Not fatal — Budget still offers these as recommendations.
      }
      const perMember = Math.max(0, Math.round(Number(newGroupContribution.replace(/[^0-9]/g, '')) || 0));
      if (perMember > 0) {
        try {
          await customFetch('/api/contribution-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultMonthlyTarget: perMember, applyToEveryone: true }),
          });
        } catch {
          // Not fatal to the group, but the treasurer typed a figure and it did
          // not take. Staying quiet leaves them believing every member owes an
          // amount that was never saved, and arrears measured against nothing.
          Alert.alert(
            'Group created, but the amount was not saved',
            `Set what each member contributes per month in Contributions → Expected. Nothing else about ${name} was affected.`,
          );
        }
      }
      if (pendingOnboardingDraft && user?.id) {
        await applyMobileOnboardingToWorkspace({ workspace, draft: pendingOnboardingDraft, userId: user.id });
        await clearOnboardingDraft({ userId: user.id, storage: AsyncStorage });
        setPendingOnboardingDraft(null);
      }
      await finish();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create this Shared group. Please try again.');
    }
  };
  const [creatingPersonal, setCreatingPersonal] = useState(false);
  const createPersonalBudget = async () => {
    if (creatingPersonal) return;
    setError(null);
    setCreatingPersonal(true);
    try {
      const created = await customFetch<{ id: number }>('/api/workspaces/personal', {
        method: 'POST',
        responseType: 'json',
      });
      await activateMobileWorkspace({
        groupId: created.id,
        storage: AsyncStorage,
        resetQueries: () => queryClient.resetQueries(),
      });
      await finish();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create your Personal budget. Please try again.');
    } finally {
      setCreatingPersonal(false);
    }
  };
  const workspaceRow = (workspace: Workspace, personal = false) => {
    const selected = selectedWorkspace?.id === workspace.id;
    const photoUrl = personal ? user?.profileImageUrl : workspace.photoUrl;
    return (
    <Pressable
      key={workspace.id}
      testID={`workspace-${workspace.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Select ${personal ? 'Personal budget' : workspace.name}`}
      accessibilityState={{ selected }}
      disabled={selectWorkspace.isPending}
      onPress={() => { setError(null); setSelectedWorkspaceId(workspace.id); void chooseWorkspace(workspace); }}
      style={({ pressed }) => [styles.workspace, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1 }, pressed && styles.pressed]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          accessibilityIgnoresInvertColors
          style={[styles.workspacePhoto, { borderColor: colors.primary }]}
        />
      ) : personal ? (
        <View style={[styles.workspaceIcon, { backgroundColor: colors.accent }]}>
          <Feather name="lock" size={19} color={colors.accentForeground} />
        </View>
      ) : workspace.emoji ? (
        <View style={[styles.workspaceIcon, { backgroundColor: `${colors.primary}20` }]}>
          <Text style={styles.workspaceEmoji}>{workspace.emoji}</Text>
        </View>
      ) : (
        <View style={[styles.workspaceIcon, { backgroundColor: `${colors.primary}20` }]}>
          <Feather
            name={sharedWorkspaceIcon(workspace.icon)}
            size={19}
            color={colors.primary}
          />
        </View>
      )}
      <View style={styles.workspaceText}>
        <Text
          style={[
            styles.workspaceTitle,
            { color: colors.foreground },
            personal ? null : workspaceNameTextStyle(workspace.nameStyle),
          ]}
        >
          {personal ? 'My Budget' : workspace.name}
        </Text>
        <Text style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>
          {personal ? 'Private to you' : `${sharedGroupKindDetails(workspace.kind).label} · Shared with members`}
        </Text>
      </View>
      {selectWorkspace.isPending ? <ActivityIndicator color={colors.primary} /> : selected ? <Feather name="check" size={20} color={colors.primary} /> : <Feather name="chevron-right" size={20} color={colors.mutedForeground} />}
    </Pressable>
    );
  };

  if (checkingOnboarding || loadingWorkspaces) {
    return <View style={[styles.page, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (unreachable) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="wifi-off" size={22} color={colors.primaryForeground} /></View>
          <Text style={[styles.title, { color: colors.foreground }]}>Jamvi can't connect.</Text>
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>
            Check your internet, then try again. Your budgets are safe - they open as soon as Jamvi is back online.
          </Text>
          <Pressable
            testID="budget-chooser-try-again"
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => { void refetchWorkspaces(); setRecheck((count) => count + 1); }}
            style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
          >
            <Feather name="refresh-cw" size={18} color={colors.primaryForeground} />
            <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // Someone invited to their first group should land on the invitation, not a
  // six-step personal-budget wizard they did not ask for.
  if (pendingInvites.length > 0 && workspaces.length === 0 && !invitesDismissed) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="user-plus" size={22} color={colors.primaryForeground} /></View>
          <Text style={[styles.eyebrow, { color: colors.brandTeal }]}>YOU'VE BEEN INVITED</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {pendingInvites.length === 1 ? 'Join this budget.' : 'Join a budget.'}
          </Text>
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>
            Accepting adds you as a {pendingInvites[0].role === 'admin' ? 'admin' : 'member'}. You keep your own Personal budget separate.
          </Text>
          {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: colors.destructive + '14' }]}><Feather name="alert-circle" size={17} color={colors.destructive} /><Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text></View> : null}
          {pendingInvites.map((invite) => (
            <View key={invite.id} style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.createCardCopy}>
                <Text style={[styles.createTitle, { color: colors.foreground }]}>{invite.groupName}</Text>
                <Text style={[styles.createText, { color: colors.mutedForeground }]}>Shared group · joining as {invite.role === 'admin' ? 'admin' : 'member'}</Text>
              </View>
              <Pressable
                testID={`accept-invite-${invite.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Join ${invite.groupName}`}
                disabled={acceptingInviteId != null}
                onPress={() => void acceptInvite(invite)}
                style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, (pressed || acceptingInviteId != null) && styles.pressed]}
              >
                {acceptingInviteId === invite.id ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={18} color={colors.primaryForeground} />}
                <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>{acceptingInviteId === invite.id ? 'Joining…' : 'Join'}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => setInvitesDismissed(true)} hitSlop={8} style={{ paddingVertical: 12, alignSelf: 'center' }}>
            <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>Not now — set up my own budget</Text>
          </Pressable>
          <SwitchAccountLink color={colors.mutedForeground} />
        </ScrollView>
      </View>
    );
  }

  if (!onboardingComplete) {
    return (
      <MobileOnboardingFlow
        colors={colors}
        insets={insets}
        user={user}
        onComplete={continueToWorkspaceChooser}
        onSkip={skipOnboarding}
      />
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="layers" size={22} color={colors.primaryForeground} /></View>
        <Text style={[styles.eyebrow, { color: colors.brandTeal }]}>YOUR WORKSPACES</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Choose where to work.</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Select one to open it.</Text>

        <TrialNote colors={colors} />

        {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: colors.destructive + '14' }]}><Feather name="alert-circle" size={17} color={colors.destructive} /><Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text></View> : null}

        {pendingInvites.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.brandTeal }]}>INVITATIONS</Text>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.createCardCopy}>
                  <Text style={[styles.createTitle, { color: colors.foreground }]}>{invite.groupName}</Text>
                  <Text style={[styles.createText, { color: colors.mutedForeground }]}>Invited as {invite.role === 'admin' ? 'admin' : 'member'}</Text>
                </View>
                <Pressable
                  testID={`accept-invite-${invite.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Join ${invite.groupName}`}
                  disabled={acceptingInviteId != null}
                  onPress={() => void acceptInvite(invite)}
                  style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, (pressed || acceptingInviteId != null) && styles.pressed]}
                >
                  {acceptingInviteId === invite.id ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={18} color={colors.primaryForeground} />}
                  <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>{acceptingInviteId === invite.id ? 'Joining…' : 'Join'}</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        {loadingWorkspaces ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (() => {
          const personalSection = (
            <React.Fragment key="personal-section">
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERSONAL BUDGET</Text>
              {privateWorkspace ? workspaceRow(privateWorkspace, true) : (
                <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.createCardCopy}>
                    <Text style={[styles.createTitle, { color: colors.foreground }]}>Add a Personal budget</Text>
                    <Text style={[styles.createText, { color: colors.mutedForeground }]}>A private budget for your own money, covered by your Jamvi subscription. Optional — you can run Shared groups without one.</Text>
                  </View>
                  <Pressable
                    testID="create-personal-budget"
                    accessibilityRole="button"
                    accessibilityLabel="Create my Personal budget"
                    disabled={creatingPersonal}
                    onPress={() => void createPersonalBudget()}
                    style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, (pressed || creatingPersonal) && styles.pressed]}
                  >
                    {creatingPersonal ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="plus" size={18} color={colors.primaryForeground} />}
                    <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>{creatingPersonal ? 'Creating…' : 'Create Personal budget'}</Text>
                  </Pressable>
                </View>
              )}
            </React.Fragment>
          );
          const sharedSection = (
            <React.Fragment key="shared-section">
              <View style={styles.sectionHead}><Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SHARED GROUPS</Text></View>
              {sharedWorkspaces.length ? sharedWorkspaces.map((workspace) => workspaceRow(workspace)) : null}
              <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.createCardCopy}>
                  <Text style={[styles.createTitle, { color: colors.foreground }]}>{sharedWorkspaces.length ? 'Create another Shared group' : 'Create a Shared group'}</Text>
                  <Text style={[styles.createText, { color: colors.mutedForeground }]}>A group budget you own — for a chama, family, church, or team. Add members after it is made, or join one from an invite link.</Text>
                </View>
                <Pressable
                  testID="create-shared-budget"
                  accessibilityRole="button"
                  accessibilityLabel="Create a Shared group"
                  onPress={() => { setError(null); setCreateSharedOpen(true); }}
                  style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                >
                  <Feather name="plus" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Create Shared group</Text>
                </Pressable>
              </View>
            </React.Fragment>
          );
          return (
            <>
              {/* Tapping a workspace below opens it, so a "Ready to open" card here only
                  asked the same question twice. What is left is the one thing the
                  list cannot say: somebody who wants a group and has none yet. */}
              {!selectedWorkspace && prefersShared ? (
                <View style={[styles.selectedPanel, { backgroundColor: colors.card, borderColor: colors.border }]} testID="chooser-next-step">
                  <View style={styles.selectedHeader}>
                    <View style={[styles.selectedIcon, { backgroundColor: colors.accent }]}><Feather name="users" size={19} color={colors.accentForeground} /></View>
                    <View style={styles.workspaceText}>
                      <Text style={[styles.selectedLabel, { color: colors.primary }]}>YOUR NEXT STEP</Text>
                      <Text style={[styles.selectedTitle, { color: colors.foreground }]}>Create your Shared group</Text>
                    </View>
                  </View>
                  <Pressable testID="create-shared-budget-primary" accessibilityRole="button" accessibilityLabel="Create a Shared group" onPress={() => { setError(null); setCreateSharedOpen(true); }} style={[styles.openButton, { backgroundColor: colors.accent }]}><Text style={[styles.openButtonText, { color: colors.accentForeground }]}>Create Shared group</Text><Feather name="arrow-up-right" size={18} color={colors.accentForeground} /></Pressable>
                </View>
              ) : null}

              <Text style={[styles.sectionLabel, { color: colors.brandTeal }]}>YOUR WORKSPACES</Text>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a workspace</Text>
              <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Tap one to open it.</Text>
              {prefersShared ? <>{sharedSection}{personalSection}</> : <>{personalSection}{sharedSection}</>}
              {workspaceError ? <Text style={[styles.errorText, { color: colors.destructive }]}>Could not load your budgets. Pull down or reopen the app to try again.</Text> : null}
            </>
          );
        })()}
        <SwitchAccountLink color={colors.mutedForeground} />
      </ScrollView>
      <Modal visible={createSharedOpen} transparent animationType="fade" onRequestClose={() => setCreateSharedOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.scrim}>
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={styles.workspaceText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create a Shared group</Text>
                <Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>You can use expenses, contributions, goals, and bank activity as its owner—even before inviting anyone.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close Shared group creation" hitSlop={10} onPress={() => setCreateSharedOpen(false)}>
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                testID="new-shared-budget-name"
                autoFocus
                maxLength={60}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="e.g. Mwangaza Chama"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Shared group name"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              />
              {/* Onboarding already asked who this budget is for. Asking the
                  same question again as "kind" reads as the app not having
                  listened, so a remembered answer is applied and simply
                  stated — with a way to change it, because a mis-tap in
                  onboarding should not be permanent. */}
              {impliedGroupKind && !editingGroupKind ? (
                <View style={[styles.kind, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}>
                  <View style={styles.workspaceText}>
                    <Text style={[styles.kindTitle, { color: colors.primary }]}>
                      {sharedGroupKindDetails(impliedGroupKind).label}
                    </Text>
                    <Text style={[styles.kindDescription, { color: colors.mutedForeground }]}>
                      From what you told us at the start. Tap change if that is not right.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setEditingGroupKind(true)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Change what this group is for"
                    testID="shared-budget-kind-change"
                  >
                    <Text style={[styles.secondaryText, { color: colors.primary }]}>Change</Text>
                  </Pressable>
                </View>
              ) : null}
              {impliedGroupKind && !editingGroupKind ? null : (
                <Text style={[styles.kindTitle, { color: colors.foreground }]}>What is this group for?</Text>
              )}
              {impliedGroupKind && !editingGroupKind ? [] : SHARED_GROUP_KINDS.map((choice) => {
                const selected = newGroupKind === choice.value;
                return <Pressable key={choice.value} testID={`shared-budget-kind-${choice.value}`}
                  accessibilityRole="radio" accessibilityState={{ checked: selected }}
                  accessibilityLabel={choice.label} onPress={() => setNewGroupKind(choice.value)}
                  style={[styles.kind, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.background }]}>
                  <View style={styles.workspaceText}><Text style={[styles.kindTitle, { color: selected ? colors.primary : colors.foreground }]}>{choice.label}</Text><Text style={[styles.kindDescription, { color: colors.mutedForeground }]}>{choice.description}</Text></View>
                  {selected ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
                </Pressable>;
              })}
              <View style={[styles.customBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.choiceTitle, { color: colors.foreground }]}>What should each member contribute each month?</Text>
                <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>Optional — sets the target for everyone. You can set or change this later in Contributions.</Text>
                <View style={[styles.incomeAmountRow, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 6 }]}>
                  <Text style={[styles.amountLabel, { color: colors.foreground }]}>Per member</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text>
                    <TextInput
                      testID="new-shared-budget-contribution"
                      keyboardType="number-pad"
                      value={newGroupContribution}
                      onChangeText={(value) => setNewGroupContribution(value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]}
                    />
                  </View>
                </View>
              </View>
              <Text style={[styles.modalCopy, { color: colors.mutedForeground, fontSize: 12 }]}>
                Jamvi adds the categories groups like this usually track — nothing is locked in, add, rename, or remove them anytime in Budget.
              </Text>
            </ScrollView>
            <Pressable testID="confirm-create-shared-budget" accessibilityRole="button"
              accessibilityLabel="Create Shared group" disabled={createSharedGroup.isPending}
              onPress={() => void createSharedBudget()}
              style={[styles.primaryButton, { backgroundColor: colors.primary }, createSharedGroup.isPending && styles.disabled]}>
              {createSharedGroup.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Create and open Shared group</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

type MobileColorPalette = ReturnType<typeof useColors>;
type MobileUser = { id?: string | null; firstName?: string | null } | null;

type ChoiceRowProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  colors: MobileColorPalette;
  testID?: string;
};

function ChoiceRow({ title, description, selected, onPress, colors, testID }: ChoiceRowProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.onboardingChoice,
        { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.primary : colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, { color: colors.foreground }]}>{title}</Text>
        {description ? <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      <View style={[styles.choiceIndicator, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>
        {selected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * Says plainly, during setup, that Jamvi is a paid app on a free trial — so a
 * new person is not surprised later. Links to the full pricing / pay screen.
 */
function TrialNote({ colors }: { colors: MobileColorPalette }) {
  const prices = usePrices();
  return (
    <Pressable
      onPress={() => router.push('/subscription')}
      style={[styles.trialNote, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="onboarding-trial-note"
      accessibilityRole="button"
      accessibilityLabel="See what Jamvi includes and how to subscribe"
    >
      <Feather name="gift" size={16} color={colors.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.trialNoteTitle, { color: colors.foreground }]}>Free for your first 14 days</Text>
        <Text style={[styles.trialNoteText, { color: colors.mutedForeground }]}>
          Then {kesLabel(prices.monthly)}/month or {kesLabel(prices.annual)}/year — one subscription covers your Personal budget and every group.
          Nothing is ever deleted if you don't subscribe; recording just goes read-only until you do.
        </Text>
        <Text style={[styles.trialNoteLink, { color: colors.primary }]}>See what's included →</Text>
      </View>
    </Pressable>
  );
}

function MobileOnboardingFlow({
  colors,
  insets,
  user,
  onComplete,
  onSkip,
}: {
  colors: MobileColorPalette;
  insets: { top: number; bottom: number; left: number; right: number };
  user: MobileUser;
  onComplete: (draft: MobileOnboardingDraft) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const prices = usePrices();
  const [skipping, setSkipping] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<MobileOnboardingDraft>({
    usageMode: 'personal',
    persona: null,
    // Everyday budgeting unless somebody says otherwise (5 Oct 2026): most
    // people are budgeting their money as it comes, not for one event.
    budgetDuration: 'ongoing',
    customEndDate: '',
    lastStep: 0,
    coupleStage: null,
    selectedCategories: [],
    customCategories: [],
    categoryBudgets: {},
    selectedIncomeStreams: [],
    incomeAmounts: {},
    memberContribution: '',
    expectedMemberCount: '',
  });
  const [customCategory, setCustomCategory] = useState('');
  const [customIncomeStream, setCustomIncomeStream] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void readOnboardingDraft({ userId: user.id, storage: AsyncStorage }).then((saved) => {
      if (active && saved) {
        setDraft(saved);
        // A resumed draft must not land on a step this budget no longer has.
        const resumeCeiling = budgetingAppliesTo(saved.budgetGoal ?? null) ? 5 : 4;
        setStep(Math.max(0, Math.min(resumeCeiling, saved.lastStep ?? 0)));
        setRestoredDraft(true);
      }
    });
    return () => { active = false; };
  }, [user?.id]);

  const recommendedCategories = useMemo(
    () => dedupeCategoryNames([
      ...recommendedCategoriesForPurpose(draft.persona, draft.coupleStage, draft.usageMode !== 'shared' && draft.runsBusiness === true),
      ...draft.customCategories,
    ]),
    [draft.persona, draft.coupleStage, draft.usageMode, draft.runsBusiness, draft.customCategories],
  );
  // "There should be more categories, e.g. education, emergency" and "people
  // sometimes don't know what they want, it's good to give them everything"
  // (5 Oct 2026): every category is shown, the ones suited to this budget first.
  const visibleTiers = useMemo(() => {
    const suited = (category: string) => (recommendedCategories.includes(category) ? 0 : 1);
    const tiers: Array<{ priority: number; label: string; description: string; categories: string[] }> = ONBOARDING_CATEGORY_TIERS
      .map((tier) => ({ priority: tier.priority, label: tier.label, description: tier.description, categories: [...tier.categories].sort((a, b) => suited(a) - suited(b)) }));
    // A wedding's or a student group's own categories are in no tier, and were
    // never shown at all.
    const inTiers = new Set<string>(ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories));
    const ownKind = recommendedCategories.filter((category) => !inTiers.has(category) && !draft.customCategories.includes(category));
    if (ownKind.length > 0) {
      tiers.unshift({ priority: 0, label: 'For this budget', description: 'Made for what you are setting up.', categories: ownKind });
    }
    if (draft.customCategories.length > 0) {
      tiers.push({ priority: 5, label: 'Your categories', description: 'Custom categories for your own situation.', categories: draft.customCategories });
    }
    return tiers;
  }, [draft.customCategories, recommendedCategories]);

  const updateDraft = (updater: (current: MobileOnboardingDraft) => MobileOnboardingDraft) => {
    setDraft((current) => {
      const next = updater(current);
      if (user?.id) void saveOnboardingDraft({ userId: user.id, draft: next, storage: AsyncStorage });
      return next;
    });
    setError(null);
  };
  const setDraftValue = <K extends keyof MobileOnboardingDraft>(key: K, value: MobileOnboardingDraft[K]) => {
    updateDraft((current) => ({ ...current, [key]: value } as MobileOnboardingDraft));
  };
  // Saying yes ticks the business's costs, so they can be linked to it at the
  // end; saying no takes them back off. The named business replaces the
  // generic "Business or side hustle" income option.
  const withBusinessAnswer = (current: MobileOnboardingDraft, runsBusiness: boolean): MobileOnboardingDraft => ({
    ...current,
    runsBusiness,
    selectedCategories: runsBusiness
      ? dedupeCategoryNames([...current.selectedCategories, ...BUSINESS_PRESELECTED_CATEGORIES])
      : current.selectedCategories.filter((category) => !isBusinessCostCategory(category)),
    selectedIncomeStreams: runsBusiness
      ? current.selectedIncomeStreams.filter((income) => income !== GENERIC_BUSINESS_INCOME_STREAM)
      : current.selectedIncomeStreams,
  });
  const businessName = businessNameFromDraft(draft);
  const businessNames = businessNamesFromDraft(draft);
  const costsName = costsBusinessName(draft);
  const profitBusinessName = businessesFromDraft(draft).find((business) => business.pay !== 'passThrough')?.name ?? null;
  // "How does it pay you?" under each business's name: answered here, the
  // Business screen never has to ask whether it pays a salary.
  const setBusinessPay = (box: number, pay: BusinessPay) => updateDraft((current) => {
    const businessPay = [...(current.businessPay ?? [])];
    while (businessPay.length <= box) businessPay.push(null);
    businessPay[box] = pay;
    return { ...current, businessPay };
  });
  const payQuestion = (box: number, name: string) => (
    <View style={{ marginTop: 8, gap: 6 }} testID={`onboarding-business-pay-${box}`}>
      <Text style={[styles.choiceTitle, { color: colors.foreground }]}>How does {name.trim() || 'it'} pay you?</Text>
      {BUSINESS_PAY_CHOICES.map((choice) => (
        <ChoiceRow key={choice.pay} testID={`onboarding-business-pay-${box}-${choice.pay}`} title={choice.title} description={choice.description} selected={(draft.businessPay?.[box] ?? null) === choice.pay} onPress={() => setBusinessPay(box, choice.pay)} colors={colors} />
      ))}
    </View>
  );

  // Step 5 asks a monthly amount per category — the budgeting step. Somebody
  // here to save towards something, or to clear a loan, will not sit and set a
  // ceiling per category, and a budget of zeros reads as "KES 0 of KES 0 (0%)"
  // on every screen afterwards: the app looks broken rather than empty. So the
  // step is skipped rather than shown and ignored.
  const budgetingApplies = budgetingAppliesTo(draft.budgetGoal ?? null);
  const lastStep = budgetingApplies ? 5 : 4;

  const goBack = () => {
    setError(null);
    const previousStep = Math.max(0, step - 1);
    updateDraft((current) => ({ ...current, lastStep: previousStep }));
    setStep(previousStep);
  };

  const goNext = async () => {
    if (step === 0 && !draft.usageMode) {
      setError('Choose how you will use Jamvi to continue.');
      return;
    }
    if (step === 1 && !draft.persona) {
      setError('Choose what you are using Jamvi for to continue.');
      return;
    }
    if (step === 1 && draft.usageMode !== 'shared' && draft.runsBusiness == null) {
      setError('Tell Jamvi whether you run a business to continue.');
      return;
    }
    const unpaid = step === 1 && draft.usageMode !== 'shared' ? businessesFromDraft(draft).find((business) => business.pay == null) : undefined;
    if (unpaid) {
      setError(`Tell Jamvi how ${unpaid.name} pays you to continue.`);
      return;
    }
    if (step === 2 && draft.budgetDuration === 'custom') {
      if (!draft.customEndDate) {
        setError('Choose an end date for this budget.');
        return;
      }
      // A finish line already behind you is not a finish line. The picker
      // refuses these, but a restored draft can still carry one.
      if (draft.customEndDate <= isoDate(new Date())) {
        setError('Choose an end date in the future.');
        return;
      }
    }
    if (step === 3 && draft.selectedCategories.length === 0) {
      setError('Choose at least one category, or select all recommended categories.');
      return;
    }
    if (step < lastStep) {
      const nextStep = step + 1;
      updateDraft((current) => ({ ...current, lastStep: nextStep }));
      void saveMobileOnboardingProgress({ ...draft, lastStep: nextStep }).catch(() => undefined);
      setStep(nextStep);
      return;
    }

    if (!user?.id) {
      setError('Your account could not be identified. Please sign in again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveOnboardingDraft({ userId: user.id, draft, storage: AsyncStorage });
      await saveMobileOnboardingPreferences(draft);
      await onComplete(draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your onboarding choices. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (category: string) => {
    setDraftValue('selectedCategories', draft.selectedCategories.includes(category)
      ? draft.selectedCategories.filter((item) => item !== category)
      : [...draft.selectedCategories, category]);
  };
  // What is being typed into each category's "Add a subcategory" field.
  const [newSubcategory, setNewSubcategory] = useState<Record<string, string>>({});
  const addSubcategory = (category: string) => {
    const name = (newSubcategory[category] ?? '').trim();
    if (!name) return;
    // A budget allows each name once, so it cannot repeat a category or
    // another subcategory anywhere in this plan.
    const key = normalizeCategoryName(name);
    const taken = [...draft.selectedCategories, ...draft.selectedCategories.flatMap((item) => onboardingSubcategoriesFor(item, draft))];
    if (taken.some((item) => normalizeCategoryName(item) === key)) {
      setError(`${name} is already in this plan.`);
      return;
    }
    updateDraft((current) => ({
      ...current,
      customSubcategories: { ...(current.customSubcategories ?? {}), [category]: [...(current.customSubcategories?.[category] ?? []), name] },
    }));
    setNewSubcategory((current) => ({ ...current, [category]: '' }));
  };
  const toggleIncome = (income: string) => {
    const normalized = normalizeIncomeStreamName(income);
    setError(null);
    setDraftValue('selectedIncomeStreams', draft.selectedIncomeStreams.some((item) => normalizeIncomeStreamName(item) === normalized)
      ? draft.selectedIncomeStreams.filter((item) => normalizeIncomeStreamName(item) !== normalized)
      : [...draft.selectedIncomeStreams, income]);
  };
  const addCustomCategory = () => {
    const value = customCategory.trim();
    if (!value) return;
    const canonical = canonicalCategoryName(value);
    const normalized = normalizeCategoryName(canonical);
    if (recommendedCategories.some((item) => normalizeCategoryName(item) === normalized)) {
      setError(`${canonical} is already in the recommended categories.`);
      return;
    }
    updateDraft((current) => ({
      ...current,
      customCategories: dedupeCategoryNames([...current.customCategories, canonical]),
      selectedCategories: dedupeCategoryNames([...current.selectedCategories, canonical]),
    }));
    setCustomCategory('');
  };
  const addCustomIncome = () => {
    const value = customIncomeStream.trim();
    if (!value) return;
    const normalized = normalizeIncomeStreamName(value);
    const existing = draft.selectedIncomeStreams.find((item) => normalizeIncomeStreamName(item) === normalized);
    if (existing) {
      setError(`${existing} is already selected.`);
      return;
    }
    const preset = incomeStreamsForMode(draft.usageMode, draft.persona, draft.coupleStage).find((item) => normalizeIncomeStreamName(item) === normalized);
    updateDraft((current) => ({
      ...current,
      selectedIncomeStreams: dedupeIncomeStreamNames([...current.selectedIncomeStreams, preset ?? value]),
    }));
    setError(preset ? `${preset} was already listed, so Jamvi selected it for you.` : null);
    setCustomIncomeStream('');
  };
  const firstName = user?.firstName?.trim();
  const headingName = firstName ? `${firstName}, ` : '';
  const isShared = draft.usageMode === 'shared';
  const stepTitles = isShared
    ? ['Your starting point', 'What is the group?', 'How long does it run?', 'What the group spends on', 'What funds the group', 'Plan the amounts']
    : ['Your starting point', 'Make it yours', 'Choose your horizon', 'Personalize your budget', 'Add income streams', 'Set your plan'];
  const modeOptions: Array<[MobileOnboardingMode, string, string]> = [
    ['personal', 'My money', 'A private budget for my income, spending, and goals.'],
    ['shared', 'Money with others', 'Set up a group you run first; your Personal budget stays private.'],
    ['both', 'Both', 'Keep my personal money private and manage shared money too.'],
  ];
  const purposeOptions = draft.usageMode === 'shared' ? PURPOSE_OPTIONS.shared : PURPOSE_OPTIONS.personal;
  const durationLabels = budgetDurationLabels(isShared);
  const durationOptions: Array<[MobileBudgetDuration, string, string]> = (
    ['ongoing', 'week', 'month', 'quarter', 'custom'] as MobileBudgetDuration[]
  ).map((value) => [value, durationLabels[value].title, durationLabels[value].description]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.onboardingPage, { backgroundColor: colors.background, paddingTop: insets.top + 18 }]}>
      <ScrollView contentContainerStyle={[styles.onboardingContent, { paddingBottom: insets.bottom + 26 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.onboardingTopRow}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="sliders" size={22} color={colors.primaryForeground} /></View>
          <Pressable
            testID="onboarding-skip"
            accessibilityRole="button"
            accessibilityLabel="Skip setup for now"
            disabled={skipping}
            onPress={() => { setSkipping(true); void onSkip().finally(() => setSkipping(false)); }}
            hitSlop={10}
          >
            <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>{skipping ? 'Skipping…' : 'Skip for now'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.eyebrow, { color: colors.brandTeal }]}>WELCOME TO JAMVI · STEP {step + 1} OF 6</Text>
        <Text style={[styles.onboardingTitle, { color: colors.foreground }]}>{headingName}{stepTitles[step]}</Text>
        <Text style={[styles.onboardingIntro, { color: colors.mutedForeground }]}>
          {isShared
            ? "You're setting up a group you'll run as its treasurer. Answer a few questions so it's ready — you can change everything later."
            : 'Your Jamvi subscription covers a private Personal budget and every group you’re in. Answer a few questions so the budget you use first is ready.'}
        </Text>
        <View style={[styles.benefitsCard, { backgroundColor: colors.accent, borderColor: colors.primary + '45' }]}>
          <Text style={[styles.choiceTitle, { color: colors.foreground }]}>
            {restoredDraft ? 'Welcome back — your setup is saved.' : 'Why personalize your setup?'}
          </Text>
          <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>
            {isShared
              ? 'These answers set up the right categories, income sources, and contribution target for the group. You can change everything later.'
              : 'Personalizing helps Jamvi recommend the right categories, priorities, income streams, and plan for your life. You can change everything later.'}
          </Text>
        </View>
        <TrialNote colors={colors} />
        <View style={styles.progressTrack}><View style={[styles.progressFill, { backgroundColor: colors.brandTeal, width: `${((step + 1) / 6) * 100}%` }]} /></View>

        {step === 0 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>How will you use Jamvi?</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>Your choice does not lock you in. You can add another budget later.</Text>
          {modeOptions.map(([value, title, description]) => <ChoiceRow key={value} testID={`onboarding-mode-${value}`} title={title} description={description} selected={draft.usageMode === value} onPress={() => { updateDraft((current) => ({ ...current, usageMode: value, persona: null })); }} colors={colors} />)}
        </> : null}

        {step === 1 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>{headingName}{isShared ? 'what kind of group is it?' : 'what are you using Jamvi for?'}</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>{isShared ? 'This helps Jamvi recommend the right categories for the group.' : 'This helps Jamvi recommend categories that fit your life instead of showing a generic budget.'}</Text>
          {purposeOptions.map(([value, title, description]) => <ChoiceRow key={value} testID={`onboarding-purpose-${value}`} title={title} description={description} selected={draft.persona === value} onPress={() => updateDraft((current) => {
            const next = { ...current, persona: value, coupleStage: value === 'couple' ? current.coupleStage : null };
            return !isShared && value === 'business' && current.runsBusiness !== true ? withBusinessAnswer(next, true) : next;
          })} colors={colors} />)}

          {/* Asked of everybody budgeting their own money, not only "a business
              owner": a student with a duka or an employee with a side hustle
              runs a business too. Yes sets one up with its costs linked, so
              the Business screen shows a profit and loss from the start.
              It lives inside the Personal budget, not a group of its own:
              most small businesses run through the owner's one M-Pesa line,
              and sorting each line there is what pulls the two apart. */}
          {!isShared && draft.persona ? (
            <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.choiceTitle, { color: colors.foreground }]}>Do you run a business or side hustle?</Text>
              <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>A shop, a stall, a boda, a salon, farming for sale, freelance work. If business and home money both go through your M-Pesa, Jamvi sorts each line into one or the other and shows what the business makes.</Text>
              {([
                [true, 'Yes, I run a business', 'Track its sales and costs, and see its profit each month.'],
                [false, 'No, not right now', 'You can add one later on the Business screen.'],
              ] as const).map(([value, title, description]) => (
                <ChoiceRow key={String(value)} testID={`onboarding-runs-business-${value ? 'yes' : 'no'}`} title={title} description={description} selected={draft.runsBusiness === value} onPress={() => updateDraft((current) => withBusinessAnswer(current, value))} colors={colors} />
              ))}
              {draft.runsBusiness ? (
                <>
                  <Text style={[styles.choiceTitle, { color: colors.foreground, marginTop: 8 }]}>What is your business called?</Text>
                  <TextInput
                    testID="onboarding-business-name"
                    value={draft.businessName ?? ''}
                    onChangeText={(value) => setDraftValue('businessName', value.slice(0, 80))}
                    placeholder="e.g. Mama Njeri's shop"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.onboardingInput, { borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
                  />
                  {payQuestion(0, draft.businessName ?? '')}
                  {/* More than one business - a shop and a boda - each named here,
                      each with its own profit on the Business screen. */}
                  {(draft.moreBusinessNames ?? []).map((name, index) => (
                    <View key={index} style={{ marginTop: 12 }}>
                      <View style={styles.inlineInput}>
                        <TextInput
                          testID={`onboarding-more-business-${index}`}
                          value={name}
                          onChangeText={(value) => updateDraft((current) => ({ ...current, moreBusinessNames: (current.moreBusinessNames ?? []).map((item, at) => (at === index ? value.slice(0, 80) : item)) }))}
                          placeholder="Your other business, e.g. a boda"
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.onboardingInput, styles.flexInput, { borderColor: colors.border, color: colors.foreground }]}
                        />
                        <Pressable testID={`onboarding-remove-business-${index}`} accessibilityRole="button" accessibilityLabel="Remove this business" hitSlop={8} onPress={() => updateDraft((current) => ({ ...current, moreBusinessNames: (current.moreBusinessNames ?? []).filter((_, at) => at !== index), businessPay: (current.businessPay ?? []).filter((_, at) => at !== index + 1) }))} style={{ padding: 6 }}>
                          <Feather name="x" size={18} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                      {name.trim() ? payQuestion(index + 1, name) : null}
                    </View>
                  ))}
                  {(draft.moreBusinessNames ?? []).length < MAX_ONBOARDING_BUSINESSES - 1 ? (
                    <Pressable testID="onboarding-add-business" accessibilityRole="button" onPress={() => updateDraft((current) => ({ ...current, moreBusinessNames: [...(current.moreBusinessNames ?? []), ''] }))} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                      <Feather name="plus" size={16} color={colors.primary} />
                      <Text style={[styles.choiceTitle, { color: colors.primary }]}>I run another business</Text>
                    </Pressable>
                  ) : null}
                  {businessNames.length > 1 && costsName ? (
                    <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>Each is kept apart on the Business screen. The starter costs - stock and supplies - go to {costsName}; set the others' costs there.</Text>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {/* A couple sharing bills already and a couple still saving for the
              wedding need different categories and income sources — one is
              pooled household money, the other is each person's own money set
              aside for one event. */}
          {isShared && draft.persona === 'couple' ? (
            <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.choiceTitle, { color: colors.foreground }]}>Living together, or planning a wedding?</Text>
              {([
                ['together', 'Living together', 'Sharing bills and everyday household money.'],
                ['wedding', 'Planning a wedding', 'Saving and paying for the wedding itself.'],
              ] as const).map(([value, title, description]) => (
                <ChoiceRow key={value} testID={`onboarding-couple-stage-${value}`} title={title} description={description} selected={draft.coupleStage === value} onPress={() => setDraftValue('coupleStage', value)} colors={colors} />
              ))}
            </View>
          ) : null}

          {/* Asked for every shared type, not just couples: a family of two
              and a family of eight are different budgets, and a chama of
              five plans differently from one of fifty. */}
          {isShared && draft.persona ? (
            <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.choiceTitle, { color: colors.foreground }]}>How many people do you expect in this group?</Text>
              <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>A guess is fine — this only steers what Jamvi recommends, not a limit.</Text>
              <TextInput
                testID="onboarding-expected-member-count"
                keyboardType="number-pad"
                value={draft.expectedMemberCount ?? ''}
                onChangeText={(value) => setDraftValue('expectedMemberCount', value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 2"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.onboardingInput, { borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
              />
            </View>
          ) : null}
        </> : null}

        {step === 2 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>{headingName}{isShared ? 'how long does the group run for?' : 'how long is this budget for?'}</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>{isShared ? 'A project or trip fund has an end date. An ongoing chama or church stays open.' : 'A trip budget needs a finish line. An everyday budget can stay open.'}</Text>
          {durationOptions.map(([value, title, description]) => <ChoiceRow key={value} testID={`onboarding-duration-${value}`} title={title} description={description} selected={draft.budgetDuration === value} onPress={() => setDraftValue('budgetDuration', value)} colors={colors} />)}
          {/* A picker, as everywhere else a date is entered. This was a
              free-text box asking for YYYY-MM-DD, checked only for being
              non-empty, so "next month", "12/25" and dates already past were
              all accepted and saved as the budget's finish line. */}
          {draft.budgetDuration === 'custom' ? (
            <>
              <Pressable
                testID="onboarding-custom-end-date"
                accessibilityRole="button"
                accessibilityLabel="Choose the end date for this budget"
                onPress={() => setShowEndDatePicker(true)}
                style={[styles.onboardingInput, styles.dateField, { borderColor: colors.border }]}
              >
                <Text style={{ color: draft.customEndDate ? colors.foreground : colors.mutedForeground, fontSize: 16 }}>
                  {draft.customEndDate || 'Choose an end date'}
                </Text>
                <Feather name="calendar" size={17} color={colors.mutedForeground} />
              </Pressable>
              {showEndDatePicker ? (
                <DateTimePicker
                  mode="date"
                  value={draft.customEndDate ? new Date(`${draft.customEndDate}T12:00:00`) : tomorrow()}
                  minimumDate={tomorrow()}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== 'ios') setShowEndDatePicker(false);
                    if (selected) setDraftValue('customEndDate', isoDate(selected));
                  }}
                />
              ) : null}
            </>
          ) : null}
        </> : null}

        {step === 3 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>{headingName}{isShared ? 'what does the group spend money on?' : 'what should we help you track?'}</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>{isShared ? "Every category is here, with a star on the ones that usually suit a group like this. Tap what it spends on — you can change them later." : profitBusinessName ? `Your business costs are ticked so ${profitBusinessName}'s profit adds up. Tap the other categories you use - you can remove any later.` : 'Every category is here, with a star on the ones that suit you. Tap the ones you use, or select them all - you can remove any later.'}</Text>
          <Pressable testID="onboarding-select-all" accessibilityRole="button" accessibilityLabel="Select all recommended categories" onPress={() => setDraftValue('selectedCategories', draft.selectedCategories.length === recommendedCategories.length ? [] : recommendedCategories)} style={[styles.selectAll, { backgroundColor: colors.accent, borderColor: colors.primary }]}><View style={styles.choiceCopy}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{draft.selectedCategories.length === recommendedCategories.length ? 'Clear all categories' : 'Select all recommended categories'}</Text><Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>Start quickly, then refine your list later.</Text></View><Feather name="check-square" size={20} color={colors.primary} /></Pressable>
          <Pressable testID="onboarding-select-every" accessibilityRole="button" onPress={() => setDraftValue('selectedCategories', dedupeCategoryNames(visibleTiers.flatMap((tier) => tier.categories)))} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <Text style={[styles.choiceTitle, { color: colors.primary }]}>Select every category</Text>
          </Pressable>
          {visibleTiers.map((tier) => <View key={tier.priority} style={styles.categoryTier}><Text style={[styles.tierTitle, { color: colors.foreground }]}>{tier.priority >= 1 && tier.priority <= 4 ? `Tier ${tier.priority} · ` : ''}{tier.label}</Text><Text style={[styles.tierDescription, { color: colors.mutedForeground }]}>{tier.description}</Text><View style={styles.categoryGrid}>{tier.categories.map((category) => <Pressable key={category} testID={`onboarding-category-${category}`} accessibilityRole="button" accessibilityHint={CATEGORY_HINTS[category]} accessibilityState={{ selected: draft.selectedCategories.includes(category) }} onPress={() => toggleCategory(category)} style={[styles.categoryChip, { backgroundColor: draft.selectedCategories.includes(category) ? colors.accent : colors.card, borderColor: draft.selectedCategories.includes(category) ? colors.primary : colors.border }]}><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.categoryChipText, { flex: 0, color: colors.foreground }]}>{category}</Text>{CATEGORY_HINTS[category] ? <Text numberOfLines={3} style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{CATEGORY_HINTS[category]}</Text> : null}</View>{draft.selectedCategories.includes(category) ? <Feather name="check" size={15} color={colors.primary} /> : recommendedCategories.includes(category) ? <Feather name="star" size={13} color={colors.brandTeal} accessibilityLabel="Suggested" /> : null}</Pressable>)}</View></View>)}
          <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Add your own category</Text><View style={styles.inlineInput}><TextInput testID="onboarding-custom-category" value={customCategory} onChangeText={setCustomCategory} onSubmitEditing={addCustomCategory} placeholder="e.g. HELB or trip fund" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingInput, styles.flexInput, { borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addCustomCategory} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Add</Text></Pressable></View></View>
        </> : null}

        {step === 4 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>
            {headingName}{draft.usageMode === 'shared' ? 'what brings money into the group?' : 'what brings money into your budget?'}
          </Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>
            {draft.usageMode !== 'shared'
              ? 'Choose the sources you rely on. Amounts are optional and can be changed later.'
              : draft.persona === 'couple' && draft.coupleStage === 'wedding'
                ? "Pick every source paying for the wedding — savings, salary, family, gifts. Amounts are optional and change later."
                : draft.persona === 'couple' || draft.persona === 'friends' || draft.persona === 'family'
                  ? "Pick every income source that funds this together — amounts are optional and change later."
                  : "Member contributions are usually the main source. Pick what applies — amounts are optional and change later."}
          </Text>
          {isShared ? (
            <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 0 }]}>
              <Text style={[styles.choiceTitle, { color: colors.foreground }]}>What should each member contribute each month?</Text>
              <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>Sets the target for everyone. Leave blank if it varies or you'll decide later.</Text>
              <View style={[styles.incomeAmountRow, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 6 }]}>
                <Text style={[styles.amountLabel, { color: colors.foreground }]}>Per member</Text>
                <View style={styles.amountInputWrap}>
                  <Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text>
                  <TextInput
                    testID="onboarding-member-contribution"
                    keyboardType="number-pad"
                    value={draft.memberContribution ?? ''}
                    onChangeText={(value) => setDraftValue('memberContribution', value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>
              </View>
            </View>
          ) : null}
          {/* Each business as the money it brings into the budget: a side
              hustle's sales (its profit is the income), or the salary a
              business pays. Money that is not the person's brings nothing. */}
          {businessesFromDraft(draft).filter((business) => business.pay !== 'passThrough').map(({ name, pay, box: index }) => {
            const key = pay === 'salary' ? salaryIncomeName(name) : name;
            return (
              <View key={key} style={[styles.incomeAmountRow, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.amountLabel, { color: colors.foreground }]} numberOfLines={1}>{key}</Text>
                  <Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>{pay === 'salary' ? `Your pay from ${name} · a month (optional)` : 'Your business · sales a month (optional)'}</Text>
                </View>
                <View style={styles.amountInputWrap}>
                  <Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text>
                  <TextInput testID={pay === 'salary' ? `onboarding-business-salary-${index}` : index === 0 ? 'onboarding-business-sales' : `onboarding-business-sales-${index}`} keyboardType="decimal-pad" value={draft.incomeAmounts[key] ?? ''} onChangeText={(value) => setDraftValue('incomeAmounts', { ...draft.incomeAmounts, [key]: value.replace(/[^0-9.]/g, '') })} placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]} />
                </View>
              </View>
            );
          })}
          {incomeStreamsForMode(draft.usageMode, draft.persona, draft.coupleStage).filter((income) => !businessName || income !== GENERIC_BUSINESS_INCOME_STREAM).map((income) => <ChoiceRow key={income} testID={`onboarding-income-${income}`} title={income} selected={draft.selectedIncomeStreams.includes(income)} onPress={() => toggleIncome(income)} colors={colors} />)}
          {draft.selectedIncomeStreams.length > 0 ? <View style={styles.incomeAmountList}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Expected monthly amount (optional)</Text>{draft.selectedIncomeStreams.map((income) => <View key={income} style={[styles.incomeAmountRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.amountLabel, { color: colors.foreground }]}>{income}</Text><View style={styles.amountInputWrap}><Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text><TextInput testID={`onboarding-income-amount-${income}`} keyboardType="decimal-pad" value={draft.incomeAmounts[income] ?? ''} onChangeText={(value) => setDraftValue('incomeAmounts', { ...draft.incomeAmounts, [income]: value.replace(/[^0-9.]/g, '') })} placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]} /></View></View>)}</View> : null}
          <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Add another income stream</Text><View style={styles.inlineInput}><TextInput testID="onboarding-custom-income" value={customIncomeStream} onChangeText={setCustomIncomeStream} onSubmitEditing={addCustomIncome} placeholder="e.g. dividends" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingInput, styles.flexInput, { borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addCustomIncome} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Add</Text></Pressable></View></View>
        </> : null}

        {step === 5 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>{headingName}{isShared ? 'how much does the group plan for each?' : 'how much will you plan for each category?'}</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>Roughly how much a month, if you know. Leave any blank - you can set amounts later.</Text>
          {draft.selectedCategories.map((category) => {
            // Amounts go on subcategories only; the category shows their total.
            const subcategories = onboardingSubcategoriesFor(category, draft);
            const subtotal = plannedCategoryAmount(draft, category);
            return <View key={category} testID={`onboarding-amount-group-${category}`} style={[styles.amountGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.amountGroupHead}><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.amountLabel, { flex: 0, color: colors.foreground }]}>{category}</Text>{CATEGORY_HINTS[category] ? <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{CATEGORY_HINTS[category]}</Text> : null}</View><Text testID={`onboarding-amount-total-${category}`} style={[styles.amountGroupTotal, { color: subtotal > 0 ? colors.foreground : colors.mutedForeground }]}>KES {subtotal.toLocaleString('en-KE')}</Text></View>
              {subcategories.map((child) => <View key={child} style={[styles.subAmountRow, { borderTopColor: colors.border }]}><Text style={[styles.subAmountLabel, { color: colors.foreground }]}>{child}</Text><View style={styles.amountInputWrap}><Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text><TextInput testID={`onboarding-amount-${category}-${child}`} accessibilityLabel={`${child}, under ${category}`} keyboardType="decimal-pad" value={draft.subcategoryBudgets?.[category]?.[child] ?? ''} onChangeText={(value) => updateDraft((current) => ({ ...current, subcategoryBudgets: { ...(current.subcategoryBudgets ?? {}), [category]: { ...(current.subcategoryBudgets?.[category] ?? {}), [child]: value.replace(/[^0-9.]/g, '') } } }))} placeholder="Optional" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]} /></View></View>)}
              <View style={[styles.subAmountRow, { borderTopColor: colors.border }]}><TextInput testID={`onboarding-add-subcategory-${category}`} accessibilityLabel={`Add a subcategory under ${category}`} value={newSubcategory[category] ?? ''} onChangeText={(value) => setNewSubcategory((current) => ({ ...current, [category]: value }))} onSubmitEditing={() => addSubcategory(category)} returnKeyType="done" placeholder={subcategories.length === 0 ? 'Add a subcategory to plan an amount' : 'Add a subcategory'} placeholderTextColor={colors.mutedForeground} style={[styles.subAmountLabel, { color: colors.foreground, paddingVertical: 8 }]} /><Pressable accessibilityRole="button" accessibilityLabel={`Add subcategory under ${category}`} onPress={() => addSubcategory(category)} hitSlop={8}><Feather name="plus-circle" size={20} color={colors.primary} /></Pressable></View>
            </View>;
          })}
          <View style={[styles.planTotal, { backgroundColor: colors.accent }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Planned total</Text><Text style={[styles.planTotalValue, { color: colors.foreground }]}>KES {draft.selectedCategories.reduce((sum, category) => sum + plannedCategoryAmount(draft, category), 0).toLocaleString('en-KE')}</Text></View>
        </> : null}

        {error ? <Text accessibilityRole="alert" style={[styles.onboardingError, { color: colors.destructive, backgroundColor: colors.destructive + '14' }]}>{error}</Text> : null}
        <View style={styles.onboardingActions}>
          {step > 0 ? <Pressable testID="onboarding-back" onPress={goBack} style={[styles.backButton, { borderColor: colors.border }]}><Feather name="arrow-left" size={17} color={colors.foreground} /><Text style={[styles.backButtonText, { color: colors.foreground }]}>Back</Text></Pressable> : <BackToSignIn color={colors.foreground} testID="onboarding-back-to-sign-in" />}
          <Pressable testID="onboarding-continue" disabled={saving} onPress={() => void goNext()} style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{step === 5 ? 'Finish setup' : 'Continue'}</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}</Pressable>
        </View>
        {/* The trial note above scrolls out of sight; this stays by the button.
            "No where in the app it shows me I am on trial" (5 Oct 2026). */}
        <Text testID="onboarding-trial-line" style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_600SemiBold' }}>
          Free trial: 14 days free, then {kesLabel(prices.monthly)} a month or {kesLabel(prices.annual)} a year.
        </Text>
        <SwitchAccountLink color={colors.mutedForeground} testID="onboarding-switch-account" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 20, gap: 12 }, mark: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, onboardingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, skipLink: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }, eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { fontSize: 27, fontWeight: '700' }, intro: { fontSize: 15, lineHeight: 22, marginBottom: 10 }, selectedPanel: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 8 }, selectedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, selectedIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, selectedLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, selectedTitle: { fontSize: 20, fontWeight: '700', marginTop: 3 }, selectedDetail: { fontSize: 13, lineHeight: 19, marginTop: 5 }, openButton: { minHeight: 50, borderRadius: 8, paddingHorizontal: 15, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, openButtonText: { fontSize: 15, fontWeight: '700' }, secondaryRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, secondaryAction: { minHeight: 42, borderWidth: 1, borderRadius: 11, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, secondaryText: { fontSize: 13, fontWeight: '600' }, sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: .9, marginTop: 8 }, sectionTitle: { fontSize: 23, fontWeight: '700', marginTop: -4 }, sectionDescription: { fontSize: 13, lineHeight: 19, marginTop: -5, marginBottom: 3 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, workspace: { minHeight: 72, borderRadius: 8, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed: { opacity: .72 }, workspaceIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, workspacePhoto: { width: 40, height: 40, borderRadius: 8, borderWidth: 2 }, workspaceEmoji: { fontSize: 20 }, workspaceText: { flex: 1 }, workspaceTitle: { fontSize: 16, fontWeight: '600' }, workspaceDetail: { fontSize: 13, marginTop: 3 }, loader: { marginVertical: 22 }, empty: { fontSize: 14, lineHeight: 20, paddingVertical: 8 }, createCard: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 12 }, createCardCopy: { gap: 4 }, createTitle: { fontSize: 16, fontWeight: '700' }, createText: { fontSize: 13, lineHeight: 19 }, createButton: { minHeight: 46, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, createButtonText: { fontSize: 14, fontWeight: '700' }, explanation: { flexDirection: 'row', gap: 10, borderRadius: 8, padding: 14, marginTop: 12 }, explanationText: { flex: 1, fontSize: 13, lineHeight: 19 }, error: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 6 }, errorText: { flex: 1, fontSize: 13, lineHeight: 18 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1, 28, 78, 0.48)' }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, modal: { maxHeight: '88%', borderTopWidth: 1, borderRadius: 12, padding: 20, gap: 12, overflow: 'hidden' }, modalBody: { flexShrink: 1 }, modalBodyContent: { gap: 12, paddingBottom: 4 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { fontSize: 20, fontWeight: '700' }, modalCopy: { fontSize: 14, lineHeight: 20 }, input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 13, height: 48, fontSize: 16 }, kind: { borderWidth: 1, borderRadius: 6, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, kindTitle: { fontSize: 14, fontWeight: '600' }, kindDescription: { fontSize: 12, lineHeight: 16, maxWidth: 265, marginTop: 2 }, primaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginTop: 4 }, primaryText: { fontSize: 16, fontWeight: '700' }, disabled: { opacity: .6 }, onboardingPage: { flex: 1 }, onboardingContent: { paddingHorizontal: 20, gap: 12 }, onboardingTitle: { fontSize: 28, fontWeight: '700', lineHeight: 34 }, onboardingIntro: { fontSize: 15, lineHeight: 22, marginTop: -4 }, benefitsCard: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 4 }, progressTrack: { height: 6, borderRadius: 6, backgroundColor: '#d7e3f1', overflow: 'hidden', marginVertical: 8 }, progressFill: { height: 6, borderRadius: 6 }, onboardingQuestion: { fontSize: 22, fontWeight: '700', marginTop: 10 }, onboardingHint: { fontSize: 14, lineHeight: 20, marginTop: -4 }, onboardingChoice: { minHeight: 70, borderRadius: 8, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, choiceCopy: { flex: 1, gap: 4 }, choiceTitle: { fontSize: 15, fontWeight: '700' }, choiceDescription: { fontSize: 13, lineHeight: 18 }, choiceIndicator: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, selectAll: { borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, categoryTier: { marginTop: 14, gap: 6 }, incomeAmountList: { gap: 8, marginTop: 6 }, incomeAmountRow: { minHeight: 56, borderWidth: 1, borderRadius: 8, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, tierTitle: { fontSize: 17, fontWeight: '700' }, tierDescription: { fontSize: 13, lineHeight: 18 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, categoryChip: { width: '48%', minHeight: 48, borderRadius: 8, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, categoryChipText: { flex: 1, fontSize: 13, fontWeight: '600' }, customBox: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 8, marginTop: 14 }, inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 8 }, onboardingInput: { height: 48, borderWidth: 1, borderRadius: 6, paddingHorizontal: 13, fontSize: 16 }, flexInput: { flex: 1 }, smallButton: { height: 48, paddingHorizontal: 15, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, smallButtonText: { fontSize: 14, fontWeight: '700' }, amountRow: { minHeight: 58, borderWidth: 1, borderRadius: 8, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, amountLabel: { flex: 1, fontSize: 14, fontWeight: '600' }, amountGroup: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingTop: 11, paddingBottom: 4 }, amountGroupHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 8 }, amountGroupTotal: { fontSize: 14, fontWeight: '700' }, subAmountRow: { minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10 }, subAmountLabel: { flex: 1, fontSize: 14 }, amountInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 }, currency: { fontSize: 12 }, amountInput: { width: 92, height: 40, borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, textAlign: 'right', fontSize: 15 }, planTotal: { borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }, planTotalValue: { fontSize: 18, fontWeight: '700' }, onboardingError: { padding: 12, borderRadius: 6, fontSize: 13, lineHeight: 18, marginTop: 4 }, onboardingActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }, backButton: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }, trialNote: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 8, padding: 13, marginTop: 4 }, trialNoteTitle: { fontSize: 13, fontWeight: '700' }, trialNoteText: { fontSize: 12, lineHeight: 17, marginTop: 3 }, trialNoteLink: { fontSize: 12, fontWeight: '700', marginTop: 6 }, backButtonText: { fontSize: 14, fontWeight: '600' }, dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});