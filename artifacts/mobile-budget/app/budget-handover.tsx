import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useAuth } from '@/lib/auth';
import { handleLapsedError } from '@/lib/lapsedError';
import { mayStartGroup, START_GROUP_NEEDS_SUBSCRIPTION } from '@/lib/groupStart';
import { leaveMobileSharedWorkspace } from '@/lib/workspace';
import { clearQueryClientCache } from '@/lib/queryPersist';
import { makeSharedConfirmation, settleAfterConversion } from '@/lib/budgetConversion';
import { workspaceBudgetName } from '@/lib/workspaceIdentity';
import { SHARED_GROUP_KINDS, type SharedGroupKind } from '@/lib/groupKinds';
import {
  handoverCandidates,
  handoverSteps,
  HANDOVER_INTRO,
  leaveAfterHandoverConfirmation,
  makeOwnerConfirmation,
  mayUseHandover,
  pendingHandoverInvitations,
  type HandoverInvitation,
  type HandoverMember,
  type HandoverStep,
} from '@/lib/budgetHandover';

const INVITATIONS_QUERY_KEY = ['group-invitations'] as const;

/**
 * "Give this budget to someone else", one step at a time. Every step here is
 * something Settings could already do; this screen only puts them in order
 * and shows which ones are done (lib/budgetHandover.ts).
 */
export default function BudgetHandoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: entitlements } = useEntitlements();
  const { data: group, isLoading: groupLoading } = useGetGroup();
  const { data: members = [], isLoading: membersLoading } = useQuery<HandoverMember[]>({
    queryKey: ['members'],
    queryFn: () => customFetch<HandoverMember[]>('/api/members'),
    enabled: !!user?.id,
  });
  const isPrivate = group?.isPrivate ?? false;
  const me = members.find((member) => member.userId === user?.id);
  const isManager = me?.role === 'owner' || me?.role === 'admin';
  const { data: invitations = [] } = useQuery<HandoverInvitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: () => customFetch<HandoverInvitation[]>('/api/group-invitations'),
    enabled: !!group && !isPrivate && isManager,
  });

  const [groupName, setGroupName] = useState('');
  const [groupKind, setGroupKind] = useState<SharedGroupKind | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const header = (title: string) => (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
        <Feather name="x" size={22} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  if (groupLoading || membersLoading || !group) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const input = { isPrivate, userId: user?.id, members, invitations };
  const name = isPrivate ? 'Personal budget' : workspaceBudgetName(group);
  const title = isPrivate ? 'Give this budget to someone else' : 'Give this group to someone else';

  if (!mayUseHandover(input)) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        {header(title)}
        <Text style={[styles.intro, { color: colors.mutedForeground, padding: 16 }]}>
          Only the owner of "{name}" can hand it over.
        </Text>
      </View>
    );
  }

  const steps = handoverSteps(input);
  const candidates = handoverCandidates(input);
  const pending = pendingHandoverInvitations(input);
  const trimmedName = groupName.trim();
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['members'] }),
    queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  ]);
  const run = async (failTitle: string, work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (handleLapsedError(error)) return;
      Alert.alert(failTitle, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const convert = () => {
    if (!groupKind || trimmedName.length < 2) return;
    if (entitlements && !mayStartGroup(entitlements)) {
      Alert.alert('Subscription needed', START_GROUP_NEEDS_SUBSCRIPTION, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Subscribe', onPress: () => router.push('/subscription') },
      ]);
      return;
    }
    const { title: confirmTitle, message } = makeSharedConfirmation(trimmedName);
    Alert.alert(confirmTitle, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn into a group',
        onPress: () => void run('Could not turn it into a group', async () => {
          const converted = await customFetch<{ id: number }>('/api/workspaces/personal/make-shared', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmedName, kind: groupKind }),
          });
          // Points the phone at the converted budget and drops everything
          // cached about it being Personal; this screen then reloads as a group.
          await settleAfterConversion({
            groupId: converted.id,
            storage: AsyncStorage,
            clearPersistedCache: clearQueryClientCache,
            resetQueries: () => queryClient.resetQueries(),
          });
          Alert.alert('Now a Shared group', `"${trimmedName}" keeps everything it had. Next, invite the new owner.`);
        }),
      },
    ]);
  };

  const invite = () => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) {
      Alert.alert('Enter their email address');
      return;
    }
    void run('Could not send invitation', async () => {
      await customFetch('/api/group-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, role: 'member' }),
      });
      setEmail('');
      await refresh();
      Alert.alert('Invitation sent', `${address} can sign in to Jamvi and accept.`);
    });
  };

  const resend = (invitation: HandoverInvitation) => void run('Could not resend invitation', async () => {
    await customFetch(`/api/group-invitations/${invitation.id}/resend`, { method: 'POST' });
    Alert.alert('Invitation resent', invitation.email);
  });

  const makeOwner = (member: HandoverMember) => {
    const { title: confirmTitle, message } = makeOwnerConfirmation(member.userName ?? 'this person');
    Alert.alert(confirmTitle, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make owner',
        onPress: () => void run('Could not hand over ownership', async () => {
          await customFetch(`/api/members/${member.userId}/transfer-ownership`, { method: 'POST' });
          await refresh();
        }),
      },
    ]);
  };

  const leave = () => {
    const { title: confirmTitle, message } = leaveAfterHandoverConfirmation(name);
    Alert.alert(confirmTitle, message, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave group',
        style: 'destructive',
        onPress: () => void run('Could not leave group', async () => {
          await leaveMobileSharedWorkspace({
            leave: () => customFetch('/api/members/me', { method: 'DELETE' }),
            storage: AsyncStorage,
            resetQueries: () => queryClient.resetQueries(),
          });
          router.replace('/budget-chooser');
          Alert.alert('Handed over', `"${name}" is now theirs. Choose another budget to continue.`);
        }),
      },
    ]);
  };

  const button = (label: string, onPress: () => void, testID: string, tone: 'primary' | 'outline' | 'danger' = 'primary') => (
    <Pressable
      testID={testID}
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.button,
        tone === 'primary'
          ? { backgroundColor: colors.primary }
          : { borderWidth: 1, borderColor: tone === 'danger' ? colors.destructive : colors.primary },
        busy && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: tone === 'primary' ? colors.primaryForeground : tone === 'danger' ? colors.destructive : colors.primary },
        ]}
      >
        {busy ? 'Working…' : label}
      </Text>
    </Pressable>
  );

  const action = (step: HandoverStep) => {
    if (step.state !== 'current') return null;
    switch (step.id) {
      case 'make-shared':
        return (
          <View style={styles.action}>
            <TextInput
              testID="handover-group-name"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
              placeholder="Group name, e.g. Wanjiku's budget"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            <Text style={[styles.small, { color: colors.mutedForeground }]}>What kind of group is this?</Text>
            <View style={styles.chips}>
              {SHARED_GROUP_KINDS.map((choice) => {
                const selected = groupKind === choice.value;
                return (
                  <Pressable
                    key={choice.value}
                    onPress={() => setGroupKind(choice.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}18` : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 12 }}>
                      {choice.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {trimmedName.length >= 2 && groupKind ? button('Turn into a Shared group', convert, 'handover-convert') : null}
          </View>
        );
      case 'invite':
        return (
          <View style={styles.action}>
            <TextInput
              testID="handover-email"
              value={email}
              onChangeText={setEmail}
              placeholder="their.email@example.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            {button('Send invitation', invite, 'handover-invite')}
          </View>
        );
      case 'accept':
        return (
          <View style={styles.action}>
            {button('Check again', () => void refresh(), 'handover-check-again', 'outline')}
            {pending.map((invitation) => (
              <Pressable key={invitation.id} disabled={busy} onPress={() => resend(invitation)} hitSlop={6}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  Resend to {invitation.email}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      case 'make-owner':
        return (
          <View style={styles.action}>
            {candidates.map((member) => (
              <View key={member.userId} style={[styles.candidate, { borderColor: colors.border }]}>
                <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                  {member.userName ?? 'Member'}
                </Text>
                {button('Make owner', () => makeOwner(member), `handover-make-owner-${member.userId}`)}
              </View>
            ))}
          </View>
        );
      case 'leave':
        return <View style={styles.action}>{button('Leave group', leave, 'handover-leave', 'danger')}</View>;
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {header(title)}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>{HANDOVER_INTRO}</Text>
        {steps.map((step, index) => (
          <View
            key={step.id}
            testID={`handover-step-${step.id}`}
            style={[
              styles.step,
              { backgroundColor: colors.card, borderColor: step.state === 'current' ? colors.primary : colors.border },
            ]}
          >
            <View
              style={[
                styles.marker,
                step.state === 'done'
                  ? { backgroundColor: colors.primary }
                  : { borderWidth: step.state === 'current' ? 2 : 1, borderColor: step.state === 'current' ? colors.primary : colors.border },
              ]}
            >
              {step.state === 'done' ? (
                <Feather name="check" size={14} color={colors.primaryForeground} />
              ) : (
                <Text style={{ color: step.state === 'current' ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                  {index + 1}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.stepTitle, { color: step.state === 'todo' ? colors.mutedForeground : colors.foreground }]}
                accessibilityLabel={`${step.title}${step.state === 'done' ? ', done' : step.state === 'current' ? ', next' : ''}`}
              >
                {step.title}
              </Text>
              {step.state !== 'todo' ? (
                <Text style={[styles.small, { color: colors.mutedForeground, marginTop: 4 }]}>{step.detail}</Text>
              ) : null}
              {action(step)}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { padding: 16, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  step: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  marker: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  small: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  action: { marginTop: 12, gap: 10, alignItems: 'flex-start' },
  input: {
    alignSelf: 'stretch',
    height: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  button: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  candidate: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
  },
});
