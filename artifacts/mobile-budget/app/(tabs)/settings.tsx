import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  customFetch,
  useCreateSharedGroup,
  useGetGroup,
  useGetWorkspaces,
  useSelectWorkspace,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { resolveAvatarProps, getDisplayName } from '@/utils/avatarHelper';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace';

type IncomeSource = { id: number; name: string; isMain: boolean; userId: string; expectedMonthlyAmount: number };
type GroupMember = {
  userId: string;
  userName: string | null;
  role: 'owner' | 'admin' | 'member';
};
type GroupInvitation = {
  id: number;
  email: string;
  role: 'admin' | 'member';
  expiresAt: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
};
type InviteContact = { id: number; name: string; email: string; role: 'admin' | 'member' };

const PALETTE = ['#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#3b82f6'];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newSourceExpected, setNewSourceExpected] = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [saveInviteContact, setSaveInviteContact] = useState(true);
  const [managingMembers, setManagingMembers] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: incomeSources = [], isLoading: sourcesLoading } = useQuery<IncomeSource[]>({
    queryKey: ['income-sources', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return customFetch<IncomeSource[]>(`/api/income-sources?userId=${user.id}`);
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
  const { data: members = [] } = useQuery<GroupMember[]>({
    queryKey: ['members'],
    queryFn: () => customFetch<GroupMember[]>('/api/members'),
    enabled: !!user?.id,
  });
  const { data: group } = useGetGroup();
  const { data: workspaces = [] } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  useEffect(() => {
    if (group?.name) setGroupName(group.name);
  }, [group?.name]);
  const canManageShared = !group?.isPrivate && members.some(
    (member) => member.userId === user?.id && (member.role === 'owner' || member.role === 'admin'),
  );
  const myMembership = members.find((member) => member.userId === user?.id);
  const canLeaveGroup = Boolean(myMembership && myMembership.role !== 'owner');
  const { data: invitations = [] } = useQuery<GroupInvitation[]>({
    queryKey: ['group-invitations'],
    queryFn: () => customFetch<GroupInvitation[]>('/api/group-invitations'),
    enabled: !!user?.id && canManageShared,
  });
  const { data: inviteContacts = [] } = useQuery<InviteContact[]>({
    queryKey: ['group-invitation-contacts'],
    queryFn: () => customFetch<InviteContact[]>('/api/group-invitation-contacts'),
    enabled: !!user?.id && canManageShared,
  });
  const handleSaveGroupName = async () => {
    if (!groupName.trim()) return;
    setSavingGroupName(true);
    try {
      await customFetch('/api/group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      Alert.alert('Group name updated');
    } catch {
      Alert.alert('Could not update group name', 'Use between 2 and 60 characters.');
    } finally {
      setSavingGroupName(false);
    }
  };

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: ['members'] });
  const handleSelectWorkspace = async (groupId: number) => {
    if (groupId === group?.id) return;
    try {
      await selectWorkspace.mutateAsync({ data: { groupId } });
      await AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));
      await queryClient.invalidateQueries();
    } catch (error) {
      Alert.alert('Could not switch budget', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleCreateSharedGroup = async () => {
    const name = newGroupName.trim();
    if (name.length < 2) return;
    try {
      const workspace = await createSharedGroup.mutateAsync({ data: { name } });
      await AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(workspace.id));
      setNewGroupName('');
      setCreateGroupOpen(false);
      await queryClient.invalidateQueries();
      Alert.alert('Private group created', 'Your My Budget records stayed private and separate.');
    } catch (error) {
      Alert.alert('Could not create group', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setManagingMembers(true);
    try {
      await customFetch('/api/group-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: newMemberRole,
          contactName: inviteName.trim() || undefined,
          saveContact: saveInviteContact && Boolean(inviteName.trim()),
        }),
      });
      setInviteName('');
      setInviteEmail('');
      setNewMemberRole('member');
      queryClient.invalidateQueries({ queryKey: ['group-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['group-invitation-contacts'] });
      Alert.alert('Invitation sent', `${inviteEmail.trim()} can sign in and accept the invitation.`);
    } catch (error) {
      Alert.alert('Could not send invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setManagingMembers(false);
    }
  };
  const handleQuickInvite = async (contact: InviteContact) => {
    setManagingMembers(true);
    try {
      await customFetch('/api/group-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.email, role: contact.role, contactName: contact.name, saveContact: false }),
      });
      queryClient.invalidateQueries({ queryKey: ['group-invitations'] });
      Alert.alert('Invitation sent', `${contact.name} can sign in and accept the invitation.`);
    } catch (error) {
      Alert.alert('Could not send invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setManagingMembers(false);
    }
  };
  const handleResendInvitation = async (invitation: GroupInvitation) => {
    try {
      await customFetch(`/api/group-invitations/${invitation.id}/resend`, { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['group-invitations'] });
      Alert.alert('Invitation resent');
    } catch (error) {
      Alert.alert('Could not resend invitation', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleCancelInvitation = (invitation: GroupInvitation) => {
    Alert.alert('Cancel invitation?', `${invitation.email} will no longer be able to use this invitation link.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel invitation',
        style: 'destructive',
        onPress: async () => {
          try {
            await customFetch(`/api/group-invitations/${invitation.id}`, { method: 'DELETE' });
            queryClient.invalidateQueries({ queryKey: ['group-invitations'] });
          } catch (error) {
            Alert.alert('Could not cancel invitation', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };
  const handleRoleChange = async (member: GroupMember) => {
    const role = member.role === 'admin' ? 'member' : 'admin';
    setManagingMembers(true);
    try {
      await customFetch(`/api/members/${member.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      refreshMembers();
    } catch {
      Alert.alert('Could not change role', 'Please try again.');
    } finally {
      setManagingMembers(false);
    }
  };
  const handleRemoveMember = (member: GroupMember) => {
    Alert.alert('Remove from group?', `${member.userName ?? 'This person'} will lose access immediately. Shared expenses, goals, bank activity, and history will stay with the group.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setManagingMembers(true);
          try {
            await customFetch(`/api/members/${member.userId}`, { method: 'DELETE' });
            refreshMembers();
          } catch {
            Alert.alert('Could not remove person', 'Please try again.');
          } finally {
            setManagingMembers(false);
          }
        },
      },
    ]);
  };
  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave this group?',
      'You will lose access immediately. Shared expenses, goals, bank activity, and history will stay with the group.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: async () => {
            setManagingMembers(true);
            try {
              await customFetch('/api/members/me', { method: 'DELETE' });
              queryClient.clear();
              await logout();
            } catch (error) {
              Alert.alert('Could not leave group', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setManagingMembers(false);
            }
          },
        },
      ],
    );
  };

  const handleAddSource = async () => {
    const name = newSource.trim();
    if (!name) return;
    setAddingSource(true);
    try {
      await customFetch('/api/income-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          name,
          isMain: false,
          expectedMonthlyAmount: Math.max(0, Math.round(Number(newSourceExpected) || 0)),
        }),
      });
      setNewSource('');
      setNewSourceExpected('');
      queryClient.invalidateQueries({ queryKey: ['income-sources', user?.id] });
      // Invalidate all income-source caches so forms update immediately
      queryClient.invalidateQueries({ queryKey: ['income-sources'] });
    } catch {
      Alert.alert('Error', 'Could not add income source.');
    } finally {
      setAddingSource(false);
    }
  };
  const handleSaveExpectedIncome = async (source: IncomeSource, rawAmount: string) => {
    const expectedMonthlyAmount = Math.max(0, Math.round(Number(rawAmount) || 0));
    if (expectedMonthlyAmount === source.expectedMonthlyAmount) return;
    try {
      await customFetch(`/api/income-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: source.name, isMain: source.isMain, expectedMonthlyAmount }),
      });
      queryClient.invalidateQueries({ queryKey: ['income-sources'] });
    } catch {
      Alert.alert('Could not save expected income', 'Enter a whole amount in KES.');
    }
  };

  const handleDeleteSource = (src: IncomeSource) => {
    Alert.alert(
      'Remove income source',
      `Remove "${src.name}"? This won't affect existing expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await customFetch(`/api/income-sources/${src.id}`, { method: 'DELETE' });
              queryClient.invalidateQueries({ queryKey: ['income-sources'] });
            } catch {
              Alert.alert('Error', 'Could not remove income source.');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
            } catch {
              Alert.alert('Error', 'Could not sign out. Please try again.');
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  const displayName = getDisplayName(user);
  const avatar = resolveAvatarProps(user);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {avatar.kind === 'image' ? (
            <Image source={{ uri: avatar.uri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[styles.avatarInitials, { color: colors.primary }]}>{avatar.text}</Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>
            {user?.email ? (
              <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
            ) : null}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BUDGET SPACES</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {workspaces.map((workspace, index) => {
            const selected = workspace.id === group?.id;
            const label = workspace.isPrivate ? 'My Budget' : workspace.name;
            const detail = workspace.isPrivate
              ? 'Private to you'
              : workspace.role === 'owner' ? 'Shared group · Owner' : workspace.role === 'admin' ? 'Shared group · Admin' : 'Shared group · Member';
            return (
              <Pressable
                key={workspace.id}
                testID={`workspace-${workspace.id}`}
                onPress={() => void handleSelectWorkspace(workspace.id)}
                disabled={selectWorkspace.isPending || selected}
                style={[
                  styles.workspaceRow,
                  { borderBottomColor: colors.border, borderBottomWidth: index < workspaces.length - 1 ? StyleSheet.hairlineWidth : 0 },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: selected ? colors.primary + '20' : colors.muted }]}>
                  <Feather name={workspace.isPrivate ? 'lock' : 'users'} size={15} color={selected ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{detail}</Text>
                </View>
                {selected ? (
                  <Feather name="check-circle" size={19} color={colors.primary} />
                ) : (
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            );
          })}
          {group?.isPrivate ? (
            <View style={[styles.workspaceInfo, { borderTopColor: colors.border, borderTopWidth: workspaces.length ? StyleSheet.hairlineWidth : 0 }]}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Your primary budget</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                Expenses, goals, bank activity, and reports here belong only to you. A shared group has its own separate money and members.
              </Text>
              <Pressable
                testID="create-private-group"
                onPress={() => setCreateGroupOpen(true)}
                style={[styles.createGroupButton, { borderColor: colors.primary }]}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.createGroupButtonText, { color: colors.primary }]}>Create a private group</Text>
              </Pressable>
            </View>
          ) : canManageShared ? (
            <View style={styles.addRow}>
              <TextInput
                style={[styles.addInput, { color: colors.foreground, flex: 1 }]}
                placeholder="Name your group"
                placeholderTextColor={colors.mutedForeground}
                value={groupName}
                onChangeText={setGroupName}
                maxLength={60}
              />
              <Pressable disabled={savingGroupName || !groupName.trim()} onPress={handleSaveGroupName} style={[styles.saveGroupBtn, { backgroundColor: colors.primary, opacity: groupName.trim() ? 1 : 0.5 }]}>
                {savingGroupName ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveGroupText}>Save</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{group?.name ?? 'Your shared group'}</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>An admin can rename the group.</Text>
            </View>
          )}
        </View>

        {/* Shared group access */}
        {!group?.isPrivate && (
          <>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GROUP ACCESS</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {members.map((member, index) => (
            <View
              key={member.userId}
              style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: index < members.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name={member.role === 'admin' || member.role === 'owner' ? 'shield' : 'user'} size={15} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{member.userId === user?.id ? 'You' : member.userName ?? 'Member'}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}</Text>
                </View>
              </View>
              {canManageShared && member.role !== 'owner' && member.userId !== user?.id ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable disabled={managingMembers} onPress={() => handleRoleChange(member)}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                      {member.role === 'admin' ? 'Make member' : 'Make admin'}
                    </Text>
                  </Pressable>
                  <Pressable disabled={managingMembers} onPress={() => handleRemoveMember(member)}>
                    <Feather name="trash-2" size={16} color="#ef4444" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
          {canLeaveGroup ? (
            <View style={[styles.row, { borderTopColor: colors.border, borderTopWidth: members.length ? StyleSheet.hairlineWidth : 0, alignItems: 'stretch' }]}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Leave this group</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4, marginBottom: 12 }]}>
                You will lose access immediately. Shared finances and history stay with the group.
              </Text>
              <Pressable
                disabled={managingMembers}
                onPress={handleLeaveGroup}
                style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: '#ef444466', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }}
              >
                <Text style={{ color: '#ef4444', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  {managingMembers ? 'Leaving…' : 'Leave group'}
                </Text>
              </Pressable>
            </View>
          ) : myMembership?.role === 'owner' ? (
            <View style={[styles.row, { borderTopColor: colors.border, borderTopWidth: members.length ? StyleSheet.hairlineWidth : 0 }]}>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Owners stay in the group so it always has someone responsible for access. Ownership transfer is not available yet.
              </Text>
            </View>
          ) : null}
          {canManageShared ? (
            <View style={[styles.addRow, { borderTopColor: colors.border, borderTopWidth: members.length ? StyleSheet.hairlineWidth : 0, flexWrap: 'wrap', gap: 8 }]}>
              <Text style={{ width: '100%', color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>
                Invite someone by email
              </Text>
              <TextInput
                style={[styles.addInput, { color: colors.foreground, width: '100%' }]}
                placeholder="Name for one-tap invite (optional)"
                placeholderTextColor={colors.mutedForeground}
                value={inviteName}
                onChangeText={setInviteName}
              />
              <TextInput
                style={[styles.addInput, { color: colors.foreground, flex: 1, minWidth: 170 }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <Pressable
                onPress={() => setNewMemberRole((role) => role === 'member' ? 'admin' : 'member')}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 }}
              >
                <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                  {newMemberRole === 'admin' ? 'Admin' : 'Member'}
                </Text>
              </Pressable>
              <Pressable disabled={managingMembers || !inviteEmail.trim()} onPress={handleInvite} style={[styles.addBtn, { backgroundColor: colors.primary, opacity: inviteEmail.trim() ? 1 : 0.5 }]}>
                {managingMembers ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
              </Pressable>
              <Pressable
                onPress={() => setSaveInviteContact((value) => !value)}
                style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 2 }}
              >
                <Feather name={saveInviteContact ? 'check-square' : 'square'} size={16} color={saveInviteContact ? colors.primary : colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                  Save this person as a one-tap invite contact
                </Text>
              </Pressable>
              <Text style={{ width: '100%', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Tap Member to choose Admin instead. They only join after signing in and accepting the email invitation.
              </Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Admins manage group access. You can still contribute in your own name.</Text>
            </View>
          )}
          {canManageShared && inviteContacts.length > 0 ? (
            <View style={[styles.row, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' }]}>
              <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 4 }]}>Quick invite</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 10 }]}>Saved people can be invited again without retyping their details.</Text>
              {inviteContacts.map((contact) => {
                const pending = invitations.some((invitation) => invitation.status === 'pending' && invitation.email === contact.email);
                return (
                  <View key={contact.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{contact.name}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{contact.email} · {contact.role}</Text>
                    </View>
                    <Pressable
                      disabled={managingMembers || pending}
                      onPress={() => handleQuickInvite(contact)}
                      style={{ backgroundColor: pending ? colors.muted : colors.primary, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 }}
                    >
                      <Text style={{ color: pending ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{pending ? 'Pending' : 'Invite'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
          {canManageShared && invitations.some((invitation) => invitation.status === 'pending') ? (
            <View style={[styles.row, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' }]}>
              <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 4 }]}>Pending invitations</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 10 }]}>A person joins only after they accept their email invitation.</Text>
              {invitations.filter((invitation) => invitation.status === 'pending').map((invitation) => (
                <View key={invitation.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>{invitation.email}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</Text>
                  </View>
                  <Pressable onPress={() => handleResendInvitation(invitation)} hitSlop={8}>
                    <Feather name="rotate-ccw" size={17} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleCancelInvitation(invitation)} hitSlop={8}>
                    <Feather name="x" size={19} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
          </>
        )}

        {/* Income sources */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>INCOME SOURCES</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {sourcesLoading ? (
            <View style={[styles.row, { justifyContent: 'center', borderBottomWidth: 0 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : incomeSources.length === 0 ? (
            <View style={[styles.row, { justifyContent: 'center', borderBottomWidth: 0 }]}>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>No sources yet — add one below</Text>
            </View>
          ) : (
            incomeSources.map((src, idx) => {
              const color = PALETTE[idx % PALETTE.length];
              return (
                <View key={src.id} style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: idx < incomeSources.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.rowIcon, { backgroundColor: color + '22' }]}>
                      <Feather name="briefcase" size={15} color={color} />
                    </View>
                    <View>
                      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{src.name}</Text>
                      {src.isMain && (
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Primary</Text>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <TextInput
                      defaultValue={String(src.expectedMonthlyAmount ?? 0)}
                      keyboardType="numeric"
                      onEndEditing={(event) => handleSaveExpectedIncome(src, event.nativeEvent.text)}
                      placeholder="Expected KES"
                      placeholderTextColor={colors.mutedForeground}
                      style={{ width: 96, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border, color: colors.foreground, fontSize: 12, textAlign: 'right' }}
                    />
                    <Pressable onPress={() => handleDeleteSource(src)} hitSlop={12}>
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          {/* Add new source */}
          <View style={[styles.addRow, { borderTopColor: colors.border, borderTopWidth: incomeSources.length > 0 ? StyleSheet.hairlineWidth : 0 }]}>
            <TextInput
              style={[styles.addInput, { color: colors.foreground, flex: 1 }]}
              placeholder="Add income source…"
              placeholderTextColor={colors.mutedForeground}
              value={newSource}
              onChangeText={setNewSource}
              returnKeyType="done"
              onSubmitEditing={handleAddSource}
            />
            <TextInput
              style={[styles.addInput, { color: colors.foreground, width: 96, textAlign: 'right' }]}
              placeholder="Expected KES"
              placeholderTextColor={colors.mutedForeground}
              value={newSourceExpected}
              onChangeText={setNewSourceExpected}
              keyboardType="numeric"
            />
            {newSource.trim().length > 0 && (
              <Pressable
                onPress={handleAddSource}
                disabled={addingSource}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                {addingSource
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="plus" size={16} color="#fff" />}
              </Pressable>
            )}
          </View>
        </View>

        {/* Account */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
                <Feather name="user" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Name</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{displayName}</Text>
          </View>
          {user?.email ? (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="mail" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Email</Text>
              </View>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text>
            </View>
          ) : null}
        </View>

        {/* App */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>APP</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: colors.muted }]}>
                <Feather name="smartphone" size={16} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Platform</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
              {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
            </Text>
          </View>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || loggingOut ? 0.6 : 1 },
          ]}
        >
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text style={styles.signOutText}>{loggingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={createGroupOpen} transparent animationType="fade" onRequestClose={() => setCreateGroupOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create a private group</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 5 }]}>
                  You will be the owner. Nothing from My Budget will be copied into this group.
                </Text>
              </View>
              <Pressable onPress={() => setCreateGroupOpen(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <TextInput
              testID="new-shared-group-name"
              autoFocus
              maxLength={60}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="e.g. Mwangaza Chama"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable
              testID="confirm-create-private-group"
              disabled={newGroupName.trim().length < 2 || createSharedGroup.isPending}
              onPress={() => void handleCreateSharedGroup()}
              style={[styles.modalCreateButton, { backgroundColor: colors.primary, opacity: newGroupName.trim().length >= 2 ? 1 : 0.55 }]}
            >
              {createSharedGroup.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCreateText}>Create private group</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Inter_700Bold' },

  content: { paddingHorizontal: 16, paddingTop: 20, gap: 4 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 20,
  },
  workspaceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  workspaceInfo: { padding: 14 },
  createGroupButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  createGroupButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 18 },
  modalHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  modalTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginTop: 18, fontFamily: 'Inter_400Regular', fontSize: 15 },
  modalCreateButton: { minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalCreateText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  profileEmail: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },

  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 6, marginLeft: 4,
  },
  section: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  rowSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: 'Inter_400Regular', maxWidth: 180 },

  addRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  addInput: { fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 4 },
  addBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveGroupBtn: { borderRadius: 8, paddingHorizontal: 13, paddingVertical: 8, minWidth: 54, alignItems: 'center' },
  saveGroupText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 28, padding: 15, borderRadius: 14, borderWidth: 1,
  },
  signOutText: { fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#ef4444' },
});
