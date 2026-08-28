import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Image,
  TextInput,
  ActivityIndicator,
  Modal,
  Share,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  customFetch,
  requestPhotoUpload,
  useCreateSharedGroup,
  useCreateGroupInviteLink,
  useGetGroup,
  useGetWorkspaces,
  useSelectWorkspace,
  useUpdateGroup,
  useGetBudgetCategoryRecommendations,
  useApplyBudgetCategoryRecommendations,
  getGetGroupQueryKey,
  getGetWorkspacesQueryKey,
  getGetBudgetCategoriesQueryKey,
  getGetBudgetCategoryRecommendationsQueryKey,
  type WorkspaceNameStyle,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useAuth } from '@/lib/auth';
import { getDisplayName } from '@/utils/avatarHelper';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  activateMobileWorkspace,
  leaveMobileSharedWorkspace,
  switchMobileWorkspace,
} from '@/lib/workspace';
import { WORKSPACE_NAME_STYLES, workspaceIdentityText, workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import { SHARED_GROUP_KINDS, sharedGroupKindDetails, type SharedGroupKind } from '@/lib/groupKinds';

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
const SHARED_BUDGET_ICONS = [
  { value: 'users', label: 'People' },
  { value: 'home', label: 'Home' },
  { value: 'heart', label: 'Care' },
  { value: 'briefcase', label: 'Work' },
  { value: 'award', label: 'Goals' },
  { value: 'star', label: 'Star' },
] as const;
const SHARED_BUDGET_ACCENTS = [
  '#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00',
  '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669',
] as const;
type SharedBudgetIcon = (typeof SHARED_BUDGET_ICONS)[number]['value'];
type SharedBudgetAccent = (typeof SHARED_BUDGET_ACCENTS)[number];
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function getSharedBudgetIcon(icon?: string): keyof typeof Feather.glyphMap {
  return SHARED_BUDGET_ICONS.some((option) => option.value === icon)
    ? icon as SharedBudgetIcon
    : 'users';
}

function workspaceLabel(workspace: { isPrivate: boolean; name: string }): string {
  if (workspace.isPrivate) return 'Personal budget';
  const name = workspace.name.trim();
  return name.toLocaleLowerCase('en-US') === 'shared budget' || !name ? 'Group' : name;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, logout, saveDisplayName, saveProfilePhoto } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [managingMembers, setManagingMembers] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSlogan, setGroupSlogan] = useState('');
  const [groupEmoji, setGroupEmoji] = useState('');
  const [groupNameStyle, setGroupNameStyle] = useState<WorkspaceNameStyle>('plain');
  const [groupIcon, setGroupIcon] = useState<SharedBudgetIcon>('users');
  const [groupAccentColor, setGroupAccentColor] = useState<SharedBudgetAccent>('#003383');
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupKind, setNewGroupKind] = useState<SharedGroupKind | null>(null);
  const [editingGroupKind, setEditingGroupKind] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingBudgetName, setEditingBudgetName] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [uploadingGroupPhoto, setUploadingGroupPhoto] = useState(false);
  const [sharingInvite, setSharingInvite] = useState(false);
  const displayNameInputRef = useRef<TextInput>(null);
  const budgetNameInputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: members = [] } = useQuery<GroupMember[]>({
    queryKey: ['members'],
    queryFn: () => customFetch<GroupMember[]>('/api/members'),
    enabled: !!user?.id,
  });
  const { data: group } = useGetGroup();
  const { data: workspaces = [] } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  const createInviteLink = useCreateGroupInviteLink();
  const updateGroup = useUpdateGroup();
  const recommendations = useGetBudgetCategoryRecommendations({
    query: {
      queryKey: getGetBudgetCategoryRecommendationsQueryKey(),
      enabled: !!group && !group.isPrivate,
    },
  });
  const applyRecommendations = useApplyBudgetCategoryRecommendations();
  useEffect(() => {
    if (group?.name) setGroupName(group.name);
    if (group?.icon) setGroupIcon(group.icon as SharedBudgetIcon);
    if (group?.accentColor) setGroupAccentColor(group.accentColor as SharedBudgetAccent);
    setGroupSlogan(group?.slogan ?? '');
    setGroupEmoji(group?.emoji ?? '');
    setGroupNameStyle(group?.nameStyle ?? 'plain');
  }, [group?.name, group?.icon, group?.accentColor, group?.slogan, group?.emoji, group?.nameStyle]);
  useEffect(() => {
    setDisplayNameInput([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  }, [user?.firstName, user?.lastName]);
  useFocusEffect(
    React.useCallback(() => () => {
      setEditingDisplayName(false);
      setEditingBudgetName(false);
      setDisplayNameInput([user?.firstName, user?.lastName].filter(Boolean).join(' '));
      setGroupName(group?.name ?? '');
      setGroupSlogan(group?.slogan ?? '');
      setGroupEmoji(group?.emoji ?? '');
      setGroupNameStyle(group?.nameStyle ?? 'plain');
    }, [group?.name, group?.slogan, group?.emoji, group?.nameStyle, user?.firstName, user?.lastName]),
  );
  const canManageShared = !group?.isPrivate && members.some(
    (member) => member.userId === user?.id && (member.role === 'owner' || member.role === 'admin'),
  );
  const canManageWorkspace = members.some(
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
  const handleSaveGroupName = async (closeBudgetNameEditor = false) => {
    if (!groupName.trim()) {
      Alert.alert('Group name required', 'Enter a group name before saving.');
      return;
    }
    setSavingGroupName(true);
    try {
      await updateGroup.mutateAsync({
        data: {
          name: groupName.trim(),
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          slogan: groupSlogan.trim() || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
      ]);
       Alert.alert(
         group?.isPrivate ? 'Budget updated' : 'Shared budget updated',
         group?.isPrivate ? 'Your budget name now appears across Jamvi.' : 'Its name and identity now appear across Jamvi.',
       );
      if (closeBudgetNameEditor) setEditingBudgetName(false);
    } catch (error) {
       Alert.alert(
         group?.isPrivate ? 'Could not update Personal budget' : 'Could not update Shared budget',
         error instanceof Error ? error.message : 'Use between 2 and 60 characters.',
       );
    } finally {
      setSavingGroupName(false);
    }
  };

  const handleSaveDisplayName = async () => {
    const name = displayNameInput.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter the name you would like people to see.');
      return;
    }
    setSavingDisplayName(true);
    try {
      await saveDisplayName(name);
      await queryClient.invalidateQueries();
      Alert.alert('Name updated');
      setEditingDisplayName(false);
    } catch (error) {
      Alert.alert(
        'Could not update your name',
        error instanceof Error ? error.message : 'Use letters, spaces, apostrophes, or hyphens.',
      );
    } finally {
      setSavingDisplayName(false);
    }
  };

  const cancelDisplayNameEdit = () => {
    setDisplayNameInput([user?.firstName, user?.lastName].filter(Boolean).join(' '));
    setEditingDisplayName(false);
  };
  const cancelBudgetNameEdit = () => {
    setGroupName(group?.name ?? '');
    setGroupSlogan(group?.slogan ?? '');
    setGroupEmoji(group?.emoji ?? '');
    setGroupNameStyle(group?.nameStyle ?? 'plain');
    setEditingBudgetName(false);
  };
  const startDisplayNameEdit = () => {
    setDisplayNameInput([user?.firstName, user?.lastName].filter(Boolean).join(' '));
    setEditingDisplayName(true);
    requestAnimationFrame(() => displayNameInputRef.current?.focus());
  };
  const startBudgetNameEdit = () => {
    setGroupName(group?.name ?? '');
    setGroupSlogan(group?.slogan ?? '');
    setGroupEmoji(group?.emoji ?? '');
    setGroupNameStyle(group?.nameStyle ?? 'plain');
    setEditingBudgetName(true);
    requestAnimationFrame(() => budgetNameInputRef.current?.focus());
  };

  const handleWhatsAppInvite = async () => {
    if (!group) return;
    setSharingInvite(true);
    try {
      const created = await createInviteLink.mutateAsync();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) {
        Alert.alert('Invite link unavailable', 'Use the email invitation below or open Jamvi on the web to share a WhatsApp link.');
        return;
      }
      const inviteUrl = `https://${domain}/invite/${encodeURIComponent(created.token)}`;
      const message = `Join ${group.name || 'my Jamvi Shared budget'} using this private invite link: ${inviteUrl}`;
      try {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
      } catch {
        await Share.share({ title: 'Share Jamvi invitation', message });
      }
    } catch (error) {
      Alert.alert('Could not create invite link', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSharingInvite(false);
    }
  };

  const selectAndUploadPhoto = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow access to your photo library to choose a picture.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Photos are only used as compact workspace/profile avatars. Re-encoding
      // the square crop avoids slow uploads from modern phone cameras.
      quality: 0.65,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const contentType = asset.mimeType ?? (asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      Alert.alert('Choose a different photo', 'Use a JPG, PNG, or WebP image.');
      return null;
    }
    const localPhoto = await fetch(asset.uri);
    const photoBlob = await localPhoto.blob();
    if (photoBlob.size < 1 || photoBlob.size > MAX_PHOTO_BYTES) {
      Alert.alert('Choose a smaller photo', 'Use an image smaller than 15 MB.');
      return null;
    }
    const upload = await requestPhotoUpload({
      contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
      size: photoBlob.size,
    });
    const uploaded =
      upload.uploadMethod === 'POST'
        ? await (() => {
            const body = new FormData();
            for (const [key, value] of Object.entries(upload.uploadFields ?? {})) {
              body.append(key, value);
            }
            body.append('file', photoBlob);
            return fetch(upload.uploadUrl, { method: 'POST', body });
          })()
        : await fetch(upload.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: photoBlob,
          });
    if (!uploaded.ok) throw new Error('Could not upload your photo. Please try again.');
    return upload.objectPath;
  };

  const handlePickProfilePhoto = async () => {
    setUploadingProfilePhoto(true);
    try {
      const photoPath = await selectAndUploadPhoto();
      if (!photoPath) return;
      await saveProfilePhoto(photoPath);
      Alert.alert('Profile photo updated');
    } catch (error) {
      Alert.alert('Could not update profile photo', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setUploadingProfilePhoto(false);
    }
  };

  const handlePickGroupPhoto = async () => {
    if (!group) return;
    setUploadingGroupPhoto(true);
    try {
      const photoPath = await selectAndUploadPhoto();
      if (!photoPath) return;
      await updateGroup.mutateAsync({
        data: {
          name: groupName.trim() || group.name,
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          slogan: groupSlogan.trim() || null,
          photoPath,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
      ]);
       Alert.alert(group.isPrivate ? 'Personal budget photo updated' : 'Shared budget photo updated');
    } catch (error) {
      Alert.alert(
        group.isPrivate ? 'Could not update Personal budget photo' : 'Could not update Shared budget photo',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setUploadingGroupPhoto(false);
    }
  };

  const handleRemoveGroupPhoto = async () => {
    if (!group) return;
    setUploadingGroupPhoto(true);
    try {
      await updateGroup.mutateAsync({
        data: {
          name: groupName.trim() || group.name,
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          photoPath: null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
      ]);
       Alert.alert(group.isPrivate ? 'Personal budget photo removed' : 'Shared budget photo removed');
    } catch (error) {
      Alert.alert(
        group.isPrivate ? 'Could not remove Personal budget photo' : 'Could not remove Shared budget photo',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setUploadingGroupPhoto(false);
    }
  };

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: ['members'] });
  const performWorkspaceSwitch = async (groupId: number) => {
    try {
      await switchMobileWorkspace({
        groupId,
        select: (selectedGroupId) => selectWorkspace.mutateAsync({ data: { groupId: selectedGroupId } }),
        storage: AsyncStorage,
        resetQueries: () => queryClient.resetQueries(),
      });
    } catch (error) {
      Alert.alert('Could not switch budget', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleSelectWorkspace = (groupId: number) => {
    if (groupId === group?.id || selectWorkspace.isPending) return;
    const destination = workspaces.find((workspace) => workspace.id === groupId);
    if (!destination) return;

    Alert.alert(
      'Switch budget?',
      `You are about to open ${workspaceLabel(destination)}. Your balances, expenses, goals, bank activity, and reports will refresh for that budget.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch budget',
          onPress: () => void performWorkspaceSwitch(destination.id),
        },
      ],
    );
  };
  const handleCreateSharedGroup = async () => {
    const name = newGroupName.trim();
    if (name.length < 2) {
      Alert.alert('Group name required', 'Enter at least two characters before creating a group.');
      return;
    }
    if (!newGroupKind) {
      Alert.alert('Choose a budget type', 'Select the kind of Shared budget you are creating.');
      return;
    }
    try {
      const workspace = await createSharedGroup.mutateAsync({ data: { name, kind: newGroupKind } });
      await activateMobileWorkspace({
        groupId: workspace.id,
        storage: AsyncStorage,
        resetQueries: () => queryClient.resetQueries(),
      });
      setNewGroupName('');
      setNewGroupKind(null);
      setCreateGroupOpen(false);
       Alert.alert('Shared budget created', 'Your budget records stayed private and separate.');
    } catch (error) {
      Alert.alert('Could not create group', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleSaveGroupKind = async () => {
    if (!newGroupKind) return;
    try {
      await updateGroup.mutateAsync({ data: {
        name: group?.name ?? groupName,
        kind: newGroupKind,
      } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
      ]);
      setEditingGroupKind(false);
    } catch (error) {
      Alert.alert('Could not update budget type', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleApplyRecommendations = async () => {
    try {
      await applyRecommendations.mutateAsync({ data: { confirm: true } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
      ]);
      Alert.alert('Recommended categories added', 'Only categories that were missing were added.');
    } catch (error) {
      Alert.alert('Could not add recommended categories', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const handleInvite = async () => {
    const emails = [...new Set(inviteEmails.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (emails.length === 0) {
      Alert.alert('Email addresses required', 'Enter one or more email addresses before sending invitations.');
      return;
    }
    setManagingMembers(true);
    try {
      const result = await customFetch<{ sent: GroupInvitation[]; failed: { email: string; error: string }[] }>('/api/group-invitations/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails,
          role: newMemberRole,
        }),
      });
      setInviteEmails('');
      setNewMemberRole('member');
      queryClient.invalidateQueries({ queryKey: ['group-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['group-invitation-contacts'] });
      if (result.sent.length === 0) {
        throw new Error(result.failed[0]?.error ?? 'No invitations were sent.');
      }
      const failureNote = result.failed.length > 0
        ? ` ${result.failed.length} could not be sent: ${result.failed.map((item) => `${item.email} (${item.error})`).join(', ')}`
        : '';
      Alert.alert(
        result.sent.length === 1 ? 'Invitation sent' : `${result.sent.length} invitations sent`,
        `${result.sent.map((item) => item.email).join(', ')} can sign in and accept.${failureNote}`,
      );
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
    } catch (error) {
      Alert.alert('Could not change role', error instanceof Error ? error.message : 'Only owners and admins can change member roles.');
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
            } catch (error) {
              Alert.alert('Could not remove person', error instanceof Error ? error.message : 'Only owners and admins can remove members.');
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
              await leaveMobileSharedWorkspace({
                leave: () => customFetch('/api/members/me', { method: 'DELETE' }),
                storage: AsyncStorage,
                resetQueries: () => queryClient.resetQueries(),
              });
              router.replace('/budget-chooser');
              Alert.alert('You left the group', 'Choose another budget to continue.');
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
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      <PageScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileAvatar
            user={user}
            size={56}
            backgroundColor={colors.primary + '22'}
            foregroundColor={colors.primary}
          />
           <View style={styles.profileInfo}>
             <Text style={[styles.profileEyebrow, { color: colors.mutedForeground }]}>SIGNED IN AS</Text>
             <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName || 'Your Jamvi account'}</Text>
             {user?.email ? (
               <View style={styles.lockedEmail}>
                 <Feather name="lock" size={12} color={colors.mutedForeground} />
                 <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text>
               </View>
             ) : null}
             <Text style={[styles.lockedHint, { color: colors.mutedForeground }]}>Your sign-in email can’t be changed in Jamvi.</Text>
              <Text style={[styles.lockedHint, { color: colors.mutedForeground, marginTop: 4 }]}>
                Your profile photo represents you and is also used for your Personal budget. Shared budgets can keep their own group photo.
              </Text>
            <Pressable
              onPress={() => void handlePickProfilePhoto()}
              disabled={uploadingProfilePhoto}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, opacity: uploadingProfilePhoto ? 0.55 : 1 }}
            >
              {uploadingProfilePhoto ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="camera" size={14} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                {uploadingProfilePhoto ? 'Preparing photo…' : 'Choose profile photo'}
              </Text>
            </Pressable>
          </View>
        </View>

         <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}>
           <View style={{ padding: 14 }}>
             {editingDisplayName ? (
               <>
                 <Text style={[styles.rowLabel, { color: colors.foreground }]}>Your name</Text>
                 <TextInput
                   ref={displayNameInputRef}
                   testID="settings-display-name-input"
                   value={displayNameInput}
                   onChangeText={setDisplayNameInput}
                    placeholder="Your name"
                   placeholderTextColor={colors.mutedForeground}
                   autoCapitalize="words"
                   autoCorrect={false}
                   maxLength={40}
                   editable={!savingDisplayName}
                   accessibilityLabel="Your display name"
                   style={[styles.profileNameInput, { borderColor: colors.border, color: colors.foreground }]}
                 />
                <Text style={[styles.rowLabel, { color: colors.foreground, marginTop: 12 }]}>
                  Budget slogan <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(optional)</Text>
                </Text>
                <TextInput
                  testID="settings-budget-slogan-input"
                  value={groupSlogan}
                  onChangeText={setGroupSlogan}
                  maxLength={120}
                  placeholder="e.g. Saving together, one goal at a time"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Budget slogan"
                  editable={!savingGroupName && !updateGroup.isPending}
                  style={[styles.profileNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 6 }]}
                />
                <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                  This short line appears with your budget photo and name.
                </Text>
                 <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                   This is the name other members see in shared budgets and activity.
                 </Text>
                 <View style={styles.editActions}>
                   <Pressable
                     testID="settings-save-display-name"
                     accessibilityRole="button"
                     accessibilityLabel="Save display name"
                     disabled={savingDisplayName || !displayNameInput.trim()}
                     onPress={() => void handleSaveDisplayName()}
                     style={[styles.saveNameButton, { backgroundColor: colors.primary, opacity: savingDisplayName || !displayNameInput.trim() ? 0.55 : 1 }]}
                   >
                     {savingDisplayName ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveNameButtonText}>Save name</Text>}
                   </Pressable>
                   <Pressable
                     accessibilityRole="button"
                     accessibilityLabel="Cancel editing display name"
                     disabled={savingDisplayName}
                     onPress={cancelDisplayNameEdit}
                     style={[styles.cancelButton, { borderColor: colors.border, opacity: savingDisplayName ? 0.55 : 1 }]}
                   >
                     <Text style={[styles.cancelButtonText, { color: colors.foreground }]}>Cancel</Text>
                   </Pressable>
                 </View>
               </>
             ) : (
               <View style={styles.summaryRow}>
                 <View style={{ flex: 1 }}>
                   <Text style={[styles.rowLabel, { color: colors.foreground }]}>Your name</Text>
                   <Text style={[styles.summaryValue, { color: colors.foreground }]}>{displayName || 'Not set'}</Text>
                   <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                     This is the name other members see in shared budgets and activity.
                   </Text>
                 </View>
                 <Pressable
                   accessibilityRole="button"
                   accessibilityLabel="Edit display name"
                   onPress={startDisplayNameEdit}
                   style={[styles.outlineButton, { borderColor: colors.border }]}
                 >
                   <Feather name="edit-2" size={14} color={colors.foreground} />
                   <Text style={[styles.outlineButtonText, { color: colors.foreground }]}>Edit</Text>
                 </Pressable>
               </View>
             )}
           </View>
         </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BUDGETS</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {workspaces.map((workspace, index) => {
            const selected = workspace.id === group?.id;
            const label = workspaceIdentityText(workspace, workspace.isPrivate ? 'Personal budget' : 'Group');
            const photoUrl = workspace.isPrivate ? user?.profileImageUrl : workspace.photoUrl;
            const detail = workspace.isPrivate
              ? 'Only you can access this budget'
              : `${workspace.name} · ${workspace.role === 'owner' ? 'Owner' : workspace.role === 'admin' ? 'Admin' : 'Member'}`;
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
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={[styles.rowIcon, { borderRadius: 10, borderWidth: 2, borderColor: workspace.accentColor }]}
                  />
                 ) : workspace.emoji ? (
                    <View style={[styles.rowIcon, { backgroundColor: `${workspace.accentColor}24`, borderWidth: 1, borderColor: `${workspace.accentColor}66` }]}>
                     <Text style={{ fontSize: 16 }}>{workspace.emoji}</Text>
                   </View>
                 ) : (
                   <View style={[styles.rowIcon, { backgroundColor: `${workspace.accentColor}20` }]}>
                     <Feather name={getSharedBudgetIcon(workspace.icon)} size={15} color={workspace.accentColor} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                   <Text style={[styles.rowLabel, { color: colors.foreground }, workspaceNameTextStyle(workspace.nameStyle)]}>{label}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{detail}</Text>
                </View>
                {selected ? (
                   <Feather name="check-circle" size={19} color={workspace.accentColor} />
                ) : (
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            );
          })}
           {group?.isPrivate ? (
            <View style={[styles.workspaceInfo, { borderTopColor: colors.border, borderTopWidth: workspaces.length ? StyleSheet.hairlineWidth : 0 }]}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Personal budget</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                 Expenses, goals, bank activity, and reports here belong only to you. A Shared budget has its own separate money and members.
              </Text>
              <Pressable
                testID="create-private-group"
                onPress={() => setCreateGroupOpen(true)}
                style={[styles.createGroupButton, { borderColor: colors.primary }]}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                 <Text style={[styles.createGroupButtonText, { color: colors.primary }]}>Create a Shared budget</Text>
              </Pressable>
            </View>
           ) : null}
        </View>
         <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BUDGET NAME</Text>
         <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
           {canManageWorkspace && editingBudgetName ? (
             <View style={{ padding: 14 }}>
               <TextInput
                 ref={budgetNameInputRef}
                 testID="settings-budget-name-input"
                 value={groupName}
                 onChangeText={setGroupName}
                 maxLength={60}
                 placeholder="e.g. Mwangaza Chama"
                 placeholderTextColor={colors.mutedForeground}
                 accessibilityLabel="Budget name"
                 editable={!savingGroupName && !updateGroup.isPending}
                 style={[styles.profileNameInput, { borderColor: colors.border, color: colors.foreground }]}
               />
                <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 5 }]}>
                  Use any language, numbers, emoji, and special characters.
                </Text>
                <View style={styles.emojiStyleRow}>
                  <View style={{ width: 92 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground, marginTop: 12 }]}>Emoji</Text>
                    <TextInput
                      testID="settings-budget-emoji-input"
                      value={groupEmoji}
                      onChangeText={setGroupEmoji}
                      maxLength={16}
                      placeholder="🌱"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Budget emoji"
                      editable={!savingGroupName && !updateGroup.isPending}
                      style={[styles.emojiInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground, marginTop: 12 }]}>Name style</Text>
                    <View style={styles.nameStyleChoices}>
                      {WORKSPACE_NAME_STYLES.map((option) => {
                        const selected = groupNameStyle === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Use ${option.label} budget name style`}
                            onPress={() => setGroupNameStyle(option.value)}
                            style={[styles.nameStyleChoice, {
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected ? colors.primary + '12' : colors.background,
                            }]}
                          >
                            <Text style={[styles.nameStyleLabel, { color: selected ? colors.primary : colors.foreground }, workspaceNameTextStyle(option.value)]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
                <View style={[styles.identityPreview, { marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: colors.muted }]}>
                  <Text style={{ fontSize: 22 }}>{groupEmoji || '✨'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryValue, { color: colors.foreground, marginTop: 0 }, workspaceNameTextStyle(groupNameStyle)]}>
                      {groupName.trim() || 'Your budget'}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>This is how the budget name will look.</Text>
                  </View>
                </View>
               <View style={styles.editActions}>
                 <Pressable
                   testID="settings-save-budget-name"
                   accessibilityRole="button"
                   accessibilityLabel="Save budget name"
                   disabled={savingGroupName || updateGroup.isPending || !groupName.trim()}
                   onPress={() => void handleSaveGroupName(true)}
                   style={[styles.saveNameButton, { backgroundColor: colors.primary, opacity: savingGroupName || updateGroup.isPending || !groupName.trim() ? 0.55 : 1 }]}
                 >
                   {savingGroupName || updateGroup.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveNameButtonText}>Save budget name</Text>}
                 </Pressable>
                 <Pressable
                   accessibilityRole="button"
                   accessibilityLabel="Cancel editing budget name"
                   disabled={savingGroupName || updateGroup.isPending}
                   onPress={cancelBudgetNameEdit}
                   style={[styles.cancelButton, { borderColor: colors.border, opacity: savingGroupName || updateGroup.isPending ? 0.55 : 1 }]}
                 >
                   <Text style={[styles.cancelButtonText, { color: colors.foreground }]}>Cancel</Text>
                 </Pressable>
               </View>
             </View>
           ) : canManageWorkspace ? (
             <View style={styles.summaryRow}>
               <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryValue, { color: colors.foreground }, workspaceNameTextStyle(group?.nameStyle)]}>
                    {group?.emoji ? `${group.emoji} ` : ''}{group?.name ?? 'Your budget'}
                  </Text>
                  {group?.slogan ? <Text style={[styles.rowSub, { color: colors.mutedForeground, fontStyle: 'italic', marginTop: 4 }]}>{group.slogan}</Text> : null}
                 <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>Choose Edit when you’re ready to rename this budget.</Text>
               </View>
               <Pressable
                 accessibilityRole="button"
                 accessibilityLabel="Edit budget name"
                 onPress={startBudgetNameEdit}
                 style={[styles.outlineButton, { borderColor: colors.border }]}
               >
                 <Feather name="edit-2" size={14} color={colors.foreground} />
                 <Text style={[styles.outlineButtonText, { color: colors.foreground }]}>Edit</Text>
               </Pressable>
             </View>
           ) : (
             <View style={{ padding: 14 }}>
                <Text style={[styles.summaryValue, { color: colors.foreground }, workspaceNameTextStyle(group?.nameStyle)]}>
                  {group?.emoji ? `${group.emoji} ` : ''}{group?.name ?? 'Shared budget'}
                </Text>
                {group?.slogan ? <Text style={[styles.rowSub, { color: colors.mutedForeground, fontStyle: 'italic', marginTop: 4 }]}>{group.slogan}</Text> : null}
               <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>An owner or admin manages this Shared budget’s name.</Text>
             </View>
           )}
         </View>
         {!group?.isPrivate && (
           <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SHARED BUDGET TYPE</Text>
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 14, gap: 10 }]}>
              <View style={styles.kindHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{sharedGroupKindDetails(group?.kind).label}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {sharedGroupKindDetails(group?.kind).description}
                  </Text>
                </View>
                {canManageShared ? (
                  <Pressable testID="edit-shared-budget-kind" onPress={() => {
                    setNewGroupKind((group?.kind === 'personal' ? 'other' : group?.kind) ?? 'other');
                    setEditingGroupKind((value) => !value);
                  }}>
                    <Text style={[styles.kindAction, { color: colors.primary }]}>{editingGroupKind ? 'Cancel' : 'Edit'}</Text>
                  </Pressable>
                ) : null}
              </View>
              {editingGroupKind && canManageShared ? (
                <>
                  <View style={styles.kindChoices}>
                    {SHARED_GROUP_KINDS.map((choice) => {
                      const selected = newGroupKind === choice.value;
                      return (
                        <Pressable key={choice.value} onPress={() => setNewGroupKind(choice.value)}
                          accessibilityRole="radio" accessibilityState={{ checked: selected }}
                          style={[styles.kindChoice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.background }]}>
                          <Text style={[styles.kindChoiceLabel, { color: selected ? colors.primary : colors.foreground }]}>{choice.label}</Text>
                          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{choice.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable testID="save-shared-budget-kind" onPress={() => void handleSaveGroupKind()} disabled={updateGroup.isPending}
                    style={[styles.identitySaveButton, { backgroundColor: colors.primary, opacity: updateGroup.isPending ? 0.55 : 1 }]}>
                    <Text style={styles.saveGroupText}>{updateGroup.isPending ? 'Saving…' : 'Save budget type'}</Text>
                  </Pressable>
                </>
              ) : null}
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Your budget type suggests categories; changing it never removes or changes existing categories.
              </Text>
              {recommendations.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : recommendations.isError ? (
                <Pressable onPress={() => void recommendations.refetch()}>
                  <Text style={[styles.kindAction, { color: colors.primary }]}>Couldn’t load recommendations. Tap to retry.</Text>
                </Pressable>
              ) : recommendations.data?.missing.length ? (
                <View style={styles.recommendationBlock}>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    Recommended to add: {recommendations.data.missing.map((item) => item.name).join(', ')}
                  </Text>
                  {canManageShared ? (
                    <Pressable testID="apply-category-recommendations" onPress={() => void handleApplyRecommendations()}
                      disabled={applyRecommendations.isPending}
                      style={[styles.identitySaveButton, { backgroundColor: colors.primary, opacity: applyRecommendations.isPending ? 0.55 : 1 }]}>
                      <Text style={styles.saveGroupText}>{applyRecommendations.isPending ? 'Adding…' : 'Add missing categories'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>All recommended categories are already available.</Text>
              )}
            </View>
           </>
         )}
         <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
           {group?.isPrivate ? 'PERSONAL BUDGET IDENTITY' : 'SHARED BUDGET IDENTITY'}
         </Text>
         <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 14, gap: 14 }]}>
              <View style={styles.identityPreview}>
                {(group?.isPrivate ? user?.profileImageUrl : group?.photoUrl) ? (
                   <Image source={{ uri: (group?.isPrivate ? user?.profileImageUrl : group?.photoUrl)! }} style={[styles.identityIcon, { borderRadius: 12, borderWidth: 2, borderColor: groupAccentColor }]} />
                ) : (
                  <View style={[styles.identityIcon, { backgroundColor: groupAccentColor }]}>
                    <Feather name={getSharedBudgetIcon(groupIcon)} size={20} color="#fff" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                   <Text style={[styles.rowLabel, { color: colors.foreground }, workspaceNameTextStyle(groupNameStyle)]}>
                      {groupEmoji ? `${groupEmoji} ` : ''}{group?.name || (group?.isPrivate ? 'Personal budget' : 'Shared budget')}
                   </Text>
                   {group?.slogan ? <Text style={[styles.rowSub, { color: colors.mutedForeground, fontStyle: 'italic' }]}>{group.slogan}</Text> : null}
                   <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                     {group?.isPrivate
                        ? 'This is your profile photo. Changing it updates both your profile and Personal budget.'
                        : 'This identity belongs to the group, not any one member or their profile.'}
                   </Text>
                </View>
              </View>
               {canManageWorkspace ? (
                <>
                   {!group?.isPrivate ? (
                  <View style={[styles.identityPreview, { padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12 }]}>
                    {group?.photoUrl ? (
                       <Image source={{ uri: group.photoUrl }} style={[styles.identityIcon, { borderRadius: 12, borderWidth: 2, borderColor: groupAccentColor }]} />
                    ) : (
                      <View style={[styles.identityIcon, { backgroundColor: groupAccentColor }]}>
                        <Feather name="camera" size={20} color="#fff" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                       <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                         {group?.isPrivate ? 'Personal budget photo' : 'Shared budget photo'}
                       </Text>
                         <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 3 }]}>This photo identifies the selected Shared budget when members switch budgets. It does not change anyone’s profile photo. Use a square JPG, PNG, or WebP photo up to 15 MB; Jamvi shrinks it first for a faster upload.</Text>
                      <View style={{ flexDirection: 'row', gap: 14, marginTop: 9 }}>
                        <Pressable disabled={uploadingGroupPhoto} onPress={() => void handlePickGroupPhoto()}>
                          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                             {uploadingGroupPhoto ? 'Preparing photo…' : group?.photoUrl ? 'Change photo' : 'Choose photo'}
                          </Text>
                        </Pressable>
                        {group?.photoUrl ? (
                          <Pressable disabled={uploadingGroupPhoto} onPress={() => void handleRemoveGroupPhoto()}>
                            <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Remove</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                   ) : null}
                  <View>
                    <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 8 }]}>Choose an icon</Text>
                    <View style={styles.identityChoices}>
                      {SHARED_BUDGET_ICONS.map((option) => {
                        const selected = groupIcon === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Use ${option.label} icon`}
                            onPress={() => setGroupIcon(option.value)}
                            style={[styles.identityIconChoice, { borderColor: selected ? groupAccentColor : colors.border, backgroundColor: selected ? groupAccentColor + '12' : colors.background }]}
                          >
                            <Feather name={option.value} size={16} color={selected ? groupAccentColor : colors.mutedForeground} />
                            <Text style={[styles.identityChoiceText, { color: selected ? groupAccentColor : colors.mutedForeground }]}>{option.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View>
                    <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 8 }]}>Choose an accent color</Text>
                    <View style={styles.identityColors}>
                      {SHARED_BUDGET_ACCENTS.map((accent) => {
                        const selected = groupAccentColor === accent;
                        return (
                          <Pressable
                            key={accent}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Use ${accent} as the accent color`}
                            onPress={() => setGroupAccentColor(accent)}
                            style={[styles.identityColorChoice, { backgroundColor: accent, borderColor: selected ? colors.foreground : 'transparent' }]}
                          >
                            {selected ? <Feather name="check" size={16} color="#fff" /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <Pressable
                    disabled={savingGroupName || updateGroup.isPending}
                    onPress={() => void handleSaveGroupName()}
                    style={[styles.identitySaveButton, { backgroundColor: colors.primary, opacity: savingGroupName || updateGroup.isPending ? 0.55 : 1 }]}
                  >
                    {savingGroupName || updateGroup.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveGroupText}>
                        {group?.isPrivate ? 'Save Personal budget identity' : 'Save Shared budget identity'}
                      </Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                   {group?.isPrivate
                     ? 'Only you can update your Personal budget’s name, emoji, style, icon, and accent colour.'
                     : 'An owner or admin can update this Shared budget’s name, emoji, style, icon, and accent colour.'}
                </Text>
              )}
         </View>

        {/* Shared group access */}
        {!group?.isPrivate && (
          <>
         <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GROUP ACCESS</Text>
         {canManageShared ? (
           <Text style={[styles.accessHint, { color: colors.mutedForeground }]}>
             You can change any non-owner between Admin and Member or remove their access. The group owner is protected.
           </Text>
         ) : null}
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
                   <Pressable
                     disabled={managingMembers}
                     onPress={() => handleRoleChange(member)}
                     accessibilityRole="button"
                     accessibilityLabel={`Change ${member.userName ?? 'member'} role to ${member.role === 'admin' ? 'member' : 'admin'}`}
                   >
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                       {member.role === 'admin' ? 'Change to member' : 'Change to admin'}
                    </Text>
                  </Pressable>
                   <Pressable
                     disabled={managingMembers}
                     onPress={() => handleRemoveMember(member)}
                     accessibilityRole="button"
                     accessibilityLabel={`Remove ${member.userName ?? 'member'} from group`}
                     style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                   >
                    <Feather name="trash-2" size={16} color="#ef4444" />
                     <Text style={{ color: '#ef4444', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Remove</Text>
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
                 Invite people by email
              </Text>
              <Text style={{ width: '100%', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 }}>
                Paste multiple addresses separated by commas, spaces, or new lines.
              </Text>
              <TextInput
                style={[styles.addInput, { color: colors.foreground, width: '100%' }]}
                placeholder="alex@example.com, sam@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={inviteEmails}
                onChangeText={setInviteEmails}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
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
              <Pressable disabled={managingMembers} onPress={handleInvite} style={[styles.addBtn, { backgroundColor: colors.primary, opacity: managingMembers ? 0.5 : 1 }]}>
                {managingMembers ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
              </Pressable>
              <Text style={{ width: '100%', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Batch invitations are email-only. Use Quick invite below for saved contacts.
              </Text>
              <Text style={{ width: '100%', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Tap Member to choose Admin instead. They only join after signing in and accepting the email invitation.
              </Text>
              <Pressable
                onPress={() => void handleWhatsAppInvite()}
                disabled={managingMembers || sharingInvite}
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 9,
                  paddingVertical: 11,
                  backgroundColor: '#25D366',
                  opacity: managingMembers || sharingInvite ? 0.55 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Share invite on WhatsApp"
                testID="share-invite-whatsapp"
              >
                {sharingInvite ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="message-circle" size={17} color="#fff" />}
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  {sharingInvite ? 'Preparing invite…' : 'Share invite on WhatsApp'}
                </Text>
              </Pressable>
              <Text style={{ width: '100%', color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                WhatsApp opens first. If it is not available, your device’s other sharing options will open instead.
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
      </PageScrollView>
      <Modal visible={createGroupOpen} transparent animationType="fade" onRequestClose={() => setCreateGroupOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create a Shared budget</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 5 }]}>
                  You will be the owner. Nothing from your Personal budget will be copied into this Shared budget.
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
            <Text style={[styles.modalKindLabel, { color: colors.foreground }]}>What kind of Shared budget is this?</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>This sets useful category recommendations. You can change it later.</Text>
            <View style={styles.kindChoices}>
              {SHARED_GROUP_KINDS.map((choice) => {
                const selected = newGroupKind === choice.value;
                return (
                  <Pressable key={choice.value} testID={`new-shared-group-kind-${choice.value}`}
                    onPress={() => setNewGroupKind(choice.value)} accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={[styles.kindChoice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.background }]}>
                    <Text style={[styles.kindChoiceLabel, { color: selected ? colors.primary : colors.foreground }]}>{choice.label}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{choice.description}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID="confirm-create-private-group"
              disabled={createSharedGroup.isPending || !newGroupKind}
              onPress={() => void handleCreateSharedGroup()}
              style={[styles.modalCreateButton, { backgroundColor: colors.primary, opacity: createSharedGroup.isPending || !newGroupKind ? 0.55 : 1 }]}
            >
              {createSharedGroup.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCreateText}>Create Shared budget</Text>}
            </Pressable>
          </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  identityPreview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityIcon: { height: 42, width: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  identityChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  identityIconChoice: { width: 76, minHeight: 56, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3 },
  identityChoiceText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  emojiStyleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  emojiInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 6, fontSize: 20 },
  nameStyleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  nameStyleChoice: { minWidth: 76, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  nameStyleLabel: { fontSize: 12 },
  identityColors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  identityColorChoice: { height: 34, width: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  identitySaveButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  kindHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kindAction: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  kindChoices: { gap: 7, marginTop: 4 },
  kindChoice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  kindChoiceLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  recommendationBlock: { gap: 8 },
  createGroupButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  createGroupButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKAV: { flex: 1 },
  modalScroll: { maxHeight: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 18 },
  modalHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  modalTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginTop: 18, fontFamily: 'Inter_400Regular', fontSize: 15 },
  modalKindLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 4 },
  modalCreateButton: { minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  modalCreateText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  profileInfo: { flex: 1 },
  profileEyebrow: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 3 },
  profileName: { fontSize: 17, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  profileEmail: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  lockedEmail: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  lockedHint: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },
  profileNameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12, fontFamily: 'Inter_400Regular', fontSize: 15 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  summaryValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outlineButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  outlineButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  cancelButton: { minHeight: 40, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 10 },
  cancelButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveNameButton: { alignSelf: 'flex-start', minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 10 },
  saveNameButtonText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 6, marginLeft: 4,
  },
  accessHint: { fontSize: 12, lineHeight: 17, marginHorizontal: 4, marginBottom: 8 },
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
  sourceEditInput: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, fontFamily: 'Inter_400Regular', fontSize: 14 },
  sourceAction: { minHeight: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  sourceActionText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },

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
