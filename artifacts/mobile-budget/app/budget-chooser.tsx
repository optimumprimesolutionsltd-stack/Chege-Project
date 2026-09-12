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
import {
  activateMobileWorkspace,
  completeMobileBudgetChooser,
  switchMobileWorkspace,
} from '@/lib/workspace';
import {
  SHARED_GROUP_KINDS,
  sharedGroupKindDetails,
  type SharedGroupKind,
} from '@/lib/groupKinds';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import {
  COMMON_INCOME_STREAMS,
  incomeStreamsForMode,
  ONBOARDING_CATEGORY_TIERS,
  PURPOSE_OPTIONS,
  canonicalCategoryName,
  clearOnboardingDraft,
  dedupeCategoryNames,
  dedupeIncomeStreamNames,
  normalizeCategoryName,
  normalizeIncomeStreamName,
  readOnboardingDraft,
  recommendedCategoriesForPurpose,
  saveOnboardingDraft,
  type MobileBudgetDuration,
  type MobileOnboardingDraft,
  type MobileOnboardingMode,
} from '@/lib/onboarding';
import { applyMobileOnboardingToWorkspace, saveMobileOnboardingPreferences, saveMobileOnboardingProgress } from '@/lib/onboarding-api';

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
  const { data: workspaces = [], isLoading: loadingWorkspaces, error: workspaceError, refetch: refetchWorkspaces } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  const [error, setError] = useState<string | null>(null);
  const [createSharedOpen, setCreateSharedOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupKind, setNewGroupKind] = useState<SharedGroupKind | null>(null);
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
    setCheckingOnboarding(true);
    void Promise.all([
      customFetch<{ completed?: boolean } | null>('/api/onboarding/preferences', { responseType: 'json' }).catch(() => null),
      readOnboardingDraft({ userId: user.id, storage: AsyncStorage }),
    ])
      .then(([preferences, savedDraft]) => {
        if (!active) return;
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
  }, [loadingWorkspaces, user?.id, workspaces.length]);

  const privateWorkspace = workspaces.find((workspace) => workspace.isPrivate);
  const sharedWorkspaces = workspaces.filter((workspace) => !workspace.isPrivate);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? privateWorkspace ?? sharedWorkspaces[0] ?? null;
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
      const workspace = await createSharedGroup.mutateAsync({ data: { name, kind: newGroupKind } });
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
          style={[styles.workspacePhoto, { borderColor: workspace.accentColor ?? colors.primary }]}
        />
      ) : personal ? (
        <View style={[styles.workspaceIcon, { backgroundColor: colors.accent }]}>
          <Feather name="lock" size={19} color={colors.accentForeground} />
        </View>
      ) : workspace.emoji ? (
        <View style={[styles.workspaceIcon, { backgroundColor: `${workspace.accentColor ?? colors.primary}20` }]}>
          <Text style={styles.workspaceEmoji}>{workspace.emoji}</Text>
        </View>
      ) : (
        <View style={[styles.workspaceIcon, { backgroundColor: `${workspace.accentColor ?? colors.primary}20` }]}>
          <Feather
            name={sharedWorkspaceIcon(workspace.icon)}
            size={19}
            color={workspace.accentColor ?? colors.primary}
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

        {loadingWorkspaces ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
          <>
            <View style={[styles.selectedPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {selectedWorkspace ? <>
                <View style={styles.selectedHeader}>
                  <View style={[styles.selectedIcon, { backgroundColor: colors.accent }]}><Feather name="check" size={19} color={colors.accentForeground} /></View>
                  <View style={styles.workspaceText}>
                    <Text style={[styles.selectedLabel, { color: colors.primary }]}>READY TO OPEN</Text>
                    <Text style={[styles.selectedTitle, { color: colors.foreground }, selectedWorkspace.isPrivate ? null : workspaceNameTextStyle(selectedWorkspace.nameStyle)]}>{selectedName}</Text>
                  </View>
                </View>
                <Pressable testID="open-selected-budget" accessibilityRole="button" accessibilityLabel={`Open ${selectedName}`} disabled={selectWorkspace.isPending} onPress={() => void chooseWorkspace(selectedWorkspace)} style={[styles.openButton, { backgroundColor: colors.accent }, selectWorkspace.isPending && styles.disabled]}><Text style={[styles.openButtonText, { color: colors.accentForeground }]}>{selectWorkspace.isPending ? 'Opening…' : `Open ${selectedName}`}</Text><Feather name="arrow-up-right" size={18} color={colors.accentForeground} /></Pressable>
              </> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>Choose one to see the next step.</Text>}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.brandTeal }]}>YOUR WORKSPACES</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a workspace</Text>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Tap one to open it.</Text>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERSONAL BUDGET · FREE</Text>
            {privateWorkspace ? workspaceRow(privateWorkspace, true) : (
              <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.createCardCopy}>
                  <Text style={[styles.createTitle, { color: colors.foreground }]}>Add a Personal budget</Text>
                  <Text style={[styles.createText, { color: colors.mutedForeground }]}>A free, private budget for your own money. Optional — you can run Shared groups without one.</Text>
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
            {workspaceError ? <Text style={[styles.errorText, { color: colors.destructive }]}>Could not load your budgets. Pull down or reopen the app to try again.</Text> : null}
          </>
        )}
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
              <Text style={[styles.kindTitle, { color: colors.foreground }]}>What is this group for?</Text>
              {SHARED_GROUP_KINDS.map((choice) => {
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
          Then KES 100/month or KES 1,000/year — one subscription covers your Personal budget and every group.
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
  const [skipping, setSkipping] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<MobileOnboardingDraft>({
    usageMode: 'personal',
    persona: null,
    budgetDuration: 'month',
    customEndDate: '',
    lastStep: 0,
    selectedCategories: [],
    customCategories: [],
    categoryBudgets: {},
    selectedIncomeStreams: [],
    incomeAmounts: {},
    memberContribution: '',
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
        setStep(Math.max(0, Math.min(5, saved.lastStep ?? 0)));
        setRestoredDraft(true);
      }
    });
    return () => { active = false; };
  }, [user?.id]);

  const recommendedCategories = useMemo(
    () => dedupeCategoryNames([...recommendedCategoriesForPurpose(draft.persona), ...draft.customCategories]),
    [draft.persona, draft.customCategories],
  );
  const visibleTiers = useMemo(() => {
    const tiers: Array<{ priority: number; label: string; description: string; categories: string[] }> = ONBOARDING_CATEGORY_TIERS
      .map((tier) => ({ priority: tier.priority, label: tier.label, description: tier.description, categories: tier.categories.filter((category) => recommendedCategories.includes(category)) }))
      .filter((tier) => tier.categories.length > 0);
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
    if (step < 5) {
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
    const preset = incomeStreamsForMode(draft.usageMode).find((item) => normalizeIncomeStreamName(item) === normalized);
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
  const durationOptions: Array<[MobileBudgetDuration, string, string]> = [
    ['ongoing', 'Everyday budgeting', 'For regular personal or shared money.'],
    ['week', 'Up to 1 week', 'For a short trip, event, or weekly plan.'],
    ['month', 'Up to 1 month', 'For a monthly challenge, project, or trip.'],
    ['quarter', 'Up to 3 months', 'For a school term or longer project.'],
    ['custom', 'Set an end date', 'Choose the exact date this budget should finish.'],
  ];

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
            : 'Every Jamvi account includes a free, private Personal budget. Answer a few questions so the budget you use first is ready.'}
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
          {purposeOptions.map(([value, title, description]) => <ChoiceRow key={value} testID={`onboarding-purpose-${value}`} title={title} description={description} selected={draft.persona === value} onPress={() => setDraftValue('persona', value)} colors={colors} />)}
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
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>{isShared ? "Nothing is preselected. Choose what the group actually spends on — you can add more later." : 'Nothing is preselected. Choose only what belongs in this budget, or select all recommended categories.'}</Text>
          <Pressable testID="onboarding-select-all" accessibilityRole="button" accessibilityLabel="Select all recommended categories" onPress={() => setDraftValue('selectedCategories', draft.selectedCategories.length === recommendedCategories.length ? [] : recommendedCategories)} style={[styles.selectAll, { backgroundColor: colors.accent, borderColor: colors.primary }]}><View style={styles.choiceCopy}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>{draft.selectedCategories.length === recommendedCategories.length ? 'Clear all categories' : 'Select all recommended categories'}</Text><Text style={[styles.choiceDescription, { color: colors.mutedForeground }]}>Start quickly, then refine your list later.</Text></View><Feather name="check-square" size={20} color={colors.primary} /></Pressable>
          {visibleTiers.map((tier) => <View key={tier.priority} style={styles.categoryTier}><Text style={[styles.tierTitle, { color: colors.foreground }]}>Tier {tier.priority} · {tier.label}</Text><Text style={[styles.tierDescription, { color: colors.mutedForeground }]}>{tier.description}</Text><View style={styles.categoryGrid}>{tier.categories.map((category) => <Pressable key={category} testID={`onboarding-category-${category}`} accessibilityRole="button" accessibilityState={{ selected: draft.selectedCategories.includes(category) }} onPress={() => toggleCategory(category)} style={[styles.categoryChip, { backgroundColor: draft.selectedCategories.includes(category) ? colors.accent : colors.card, borderColor: draft.selectedCategories.includes(category) ? colors.primary : colors.border }]}><Text style={[styles.categoryChipText, { color: colors.foreground }]}>{category}</Text>{draft.selectedCategories.includes(category) ? <Feather name="check" size={15} color={colors.primary} /> : null}</Pressable>)}</View></View>)}
          <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Add your own category</Text><View style={styles.inlineInput}><TextInput testID="onboarding-custom-category" value={customCategory} onChangeText={setCustomCategory} onSubmitEditing={addCustomCategory} placeholder="e.g. HELB or trip fund" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingInput, styles.flexInput, { borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addCustomCategory} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Add</Text></Pressable></View></View>
        </> : null}

        {step === 4 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>
            {headingName}{draft.usageMode === 'shared' ? 'what brings money into the group?' : 'what brings money into your budget?'}
          </Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>
            {draft.usageMode === 'shared'
              ? "Member contributions are usually the main source. Pick what applies — amounts are optional and change later."
              : 'Choose the sources you rely on. Amounts are optional and can be changed later.'}
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
          {incomeStreamsForMode(draft.usageMode).map((income) => <ChoiceRow key={income} testID={`onboarding-income-${income}`} title={income} selected={draft.selectedIncomeStreams.includes(income)} onPress={() => toggleIncome(income)} colors={colors} />)}
          {draft.selectedIncomeStreams.length > 0 ? <View style={styles.incomeAmountList}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Expected monthly amount (optional)</Text>{draft.selectedIncomeStreams.map((income) => <View key={income} style={[styles.incomeAmountRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.amountLabel, { color: colors.foreground }]}>{income}</Text><View style={styles.amountInputWrap}><Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text><TextInput testID={`onboarding-income-amount-${income}`} keyboardType="decimal-pad" value={draft.incomeAmounts[income] ?? ''} onChangeText={(value) => setDraftValue('incomeAmounts', { ...draft.incomeAmounts, [income]: value.replace(/[^0-9.]/g, '') })} placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]} /></View></View>)}</View> : null}
          <View style={[styles.customBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Add another income stream</Text><View style={styles.inlineInput}><TextInput testID="onboarding-custom-income" value={customIncomeStream} onChangeText={setCustomIncomeStream} onSubmitEditing={addCustomIncome} placeholder="e.g. dividends" placeholderTextColor={colors.mutedForeground} style={[styles.onboardingInput, styles.flexInput, { borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={addCustomIncome} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>Add</Text></Pressable></View></View>
        </> : null}

        {step === 5 ? <>
          <Text style={[styles.onboardingQuestion, { color: colors.foreground }]}>{headingName}{isShared ? 'how much does the group plan for each?' : 'how much will you plan for each category?'}</Text>
          <Text style={[styles.onboardingHint, { color: colors.mutedForeground }]}>These are plans, not restrictions. You can adjust them anytime.</Text>
          {draft.selectedCategories.map((category) => <View key={category} style={[styles.amountRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.amountLabel, { color: colors.foreground }]}>{category}</Text><View style={styles.amountInputWrap}><Text style={[styles.currency, { color: colors.mutedForeground }]}>KES</Text><TextInput testID={`onboarding-amount-${category}`} keyboardType="decimal-pad" value={draft.categoryBudgets[category] ?? ''} onChangeText={(value) => setDraftValue('categoryBudgets', { ...draft.categoryBudgets, [category]: value.replace(/[^0-9.]/g, '') })} placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { borderColor: colors.border, color: colors.foreground }]} /></View></View>)}
          <View style={[styles.planTotal, { backgroundColor: colors.accent }]}><Text style={[styles.choiceTitle, { color: colors.foreground }]}>Planned total</Text><Text style={[styles.planTotalValue, { color: colors.foreground }]}>KES {draft.selectedCategories.reduce((sum, category) => sum + (Number(draft.categoryBudgets[category]) || 0), 0).toLocaleString('en-KE')}</Text></View>
        </> : null}

        {error ? <Text accessibilityRole="alert" style={[styles.onboardingError, { color: colors.destructive, backgroundColor: colors.destructive + '14' }]}>{error}</Text> : null}
        <View style={styles.onboardingActions}>
          {step > 0 ? <Pressable testID="onboarding-back" onPress={goBack} style={[styles.backButton, { borderColor: colors.border }]}><Feather name="arrow-left" size={17} color={colors.foreground} /><Text style={[styles.backButtonText, { color: colors.foreground }]}>Back</Text></Pressable> : <View />}
          <Pressable testID="onboarding-continue" disabled={saving} onPress={() => void goNext()} style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{step === 5 ? 'Finish setup' : 'Continue'}</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}</Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 20, gap: 12 }, mark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, onboardingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, skipLink: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }, eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { fontSize: 27, fontWeight: '700' }, intro: { fontSize: 15, lineHeight: 22, marginBottom: 10 }, selectedPanel: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 8 }, selectedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, selectedIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, selectedLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, selectedTitle: { fontSize: 20, fontWeight: '700', marginTop: 3 }, selectedDetail: { fontSize: 13, lineHeight: 19, marginTop: 5 }, openButton: { minHeight: 50, borderRadius: 12, paddingHorizontal: 15, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, openButtonText: { fontSize: 15, fontWeight: '700' }, secondaryRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, secondaryAction: { minHeight: 42, borderWidth: 1, borderRadius: 11, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, secondaryText: { fontSize: 13, fontWeight: '600' }, sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: .9, marginTop: 8 }, sectionTitle: { fontSize: 23, fontWeight: '700', marginTop: -4 }, sectionDescription: { fontSize: 13, lineHeight: 19, marginTop: -5, marginBottom: 3 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, workspace: { minHeight: 72, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed: { opacity: .72 }, workspaceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, workspacePhoto: { width: 40, height: 40, borderRadius: 12, borderWidth: 2 }, workspaceEmoji: { fontSize: 20 }, workspaceText: { flex: 1 }, workspaceTitle: { fontSize: 16, fontWeight: '600' }, workspaceDetail: { fontSize: 13, marginTop: 3 }, loader: { marginVertical: 22 }, empty: { fontSize: 14, lineHeight: 20, paddingVertical: 8 }, createCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 }, createCardCopy: { gap: 4 }, createTitle: { fontSize: 16, fontWeight: '700' }, createText: { fontSize: 13, lineHeight: 19 }, createButton: { minHeight: 46, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, createButtonText: { fontSize: 14, fontWeight: '700' }, explanation: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14, marginTop: 12 }, explanationText: { flex: 1, fontSize: 13, lineHeight: 19 }, error: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10 }, errorText: { flex: 1, fontSize: 13, lineHeight: 18 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1, 28, 78, 0.48)' }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, modal: { maxHeight: '88%', borderTopWidth: 1, borderRadius: 20, padding: 20, gap: 12, overflow: 'hidden' }, modalBody: { flexShrink: 1 }, modalBodyContent: { gap: 12, paddingBottom: 4 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { fontSize: 20, fontWeight: '700' }, modalCopy: { fontSize: 14, lineHeight: 20 }, input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, height: 48, fontSize: 16 }, kind: { borderWidth: 1, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, kindTitle: { fontSize: 14, fontWeight: '600' }, kindDescription: { fontSize: 12, lineHeight: 16, maxWidth: 265, marginTop: 2 }, primaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 4 }, primaryText: { fontSize: 16, fontWeight: '700' }, disabled: { opacity: .6 }, onboardingPage: { flex: 1 }, onboardingContent: { paddingHorizontal: 20, gap: 12 }, onboardingTitle: { fontSize: 28, fontWeight: '700', lineHeight: 34 }, onboardingIntro: { fontSize: 15, lineHeight: 22, marginTop: -4 }, benefitsCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 }, progressTrack: { height: 6, borderRadius: 6, backgroundColor: '#d7e3f1', overflow: 'hidden', marginVertical: 8 }, progressFill: { height: 6, borderRadius: 6 }, onboardingQuestion: { fontSize: 22, fontWeight: '700', marginTop: 10 }, onboardingHint: { fontSize: 14, lineHeight: 20, marginTop: -4 }, onboardingChoice: { minHeight: 70, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, choiceCopy: { flex: 1, gap: 4 }, choiceTitle: { fontSize: 15, fontWeight: '700' }, choiceDescription: { fontSize: 13, lineHeight: 18 }, choiceIndicator: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, selectAll: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, categoryTier: { marginTop: 14, gap: 6 }, incomeAmountList: { gap: 8, marginTop: 6 }, incomeAmountRow: { minHeight: 56, borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, tierTitle: { fontSize: 17, fontWeight: '700' }, tierDescription: { fontSize: 13, lineHeight: 18 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, categoryChip: { width: '48%', minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, categoryChipText: { flex: 1, fontSize: 13, fontWeight: '600' }, customBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginTop: 14 }, inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 8 }, onboardingInput: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, fontSize: 16 }, flexInput: { flex: 1 }, smallButton: { height: 48, paddingHorizontal: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, smallButtonText: { fontSize: 14, fontWeight: '700' }, amountRow: { minHeight: 58, borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, amountLabel: { flex: 1, fontSize: 14, fontWeight: '600' }, amountInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 }, currency: { fontSize: 12 }, amountInput: { width: 92, height: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, textAlign: 'right', fontSize: 15 }, planTotal: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }, planTotalValue: { fontSize: 18, fontWeight: '700' }, onboardingError: { padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 18, marginTop: 4 }, onboardingActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }, backButton: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }, trialNote: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 4 }, trialNoteTitle: { fontSize: 13, fontWeight: '700' }, trialNoteText: { fontSize: 12, lineHeight: 17, marginTop: 3 }, trialNoteLink: { fontSize: 12, fontWeight: '700', marginTop: 6 }, backButtonText: { fontSize: 14, fontWeight: '600' }, dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});