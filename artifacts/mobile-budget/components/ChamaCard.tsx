import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetWorkspacesQueryKey, useGetWorkspaces, useSelectWorkspace } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace';
import { clearQueryClientCache } from '@/lib/queryPersist';

/**
 * The chama, offered at the foot of a Personal budget's Home: "the app is
 * still needs to be personal - but also sell the chama angle as an option"
 * (16 Oct 2026). Jamvi is a personal budget first; running a chama on it is
 * what nobody else does, so it is offered here, quietly, rather than pushed.
 *
 * - In no group yet: one card - what a chama gets, Start a group, Not now
 *   (kept away for good once dismissed, on this phone).
 * - In groups: one line naming them, a tap away. Switching used to be in
 *   Settings only, behind a confirm.
 */
const DISMISSED_KEY = 'jamvi:chama-card:dismissed:v1';

export function ChamaCard({ canStartGroup, canInvite = false, onScreen, currentId }: {
  canStartGroup: boolean;
  /** An owner or admin of the group open now: Invite sits beside the groups (it was a tile in the areas grid). */
  canInvite?: boolean;
  onScreen: boolean;
  currentId: number | null;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: workspaces = [] } = useGetWorkspaces({
    query: { subscribed: onScreen, queryKey: getGetWorkspacesQueryKey(), staleTime: 5 * 60_000 },
  });
  const selectWorkspace = useSelectWorkspace();
  const [dismissed, setDismissed] = useState(true);
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((value) => setDismissed(value === 'yes')).catch(() => setDismissed(false));
  }, []);

  const groups = workspaces.filter((workspace) => !workspace.isPrivate);
  const inGroup = workspaces.some((workspace) => workspace.id === currentId && !workspace.isPrivate);
  // Everywhere else you can go: from a group, your Personal budget comes first.
  const others = workspaces
    .filter((workspace) => workspace.id !== currentId)
    .sort((a, b) => Number(b.isPrivate) - Number(a.isPrivate));

  const open = async (groupId: number) => {
    if (switchingTo !== null) return;
    setSwitchingTo(groupId);
    try {
      await selectWorkspace.mutateAsync({ data: { groupId } });
      await AsyncStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));
      await clearQueryClientCache();
      queryClient.clear();
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Could not open that group', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSwitchingTo(null);
    }
  };

  if (groups.length > 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="home-chama-groups">
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{inGroup ? 'YOUR OTHER BUDGETS' : 'YOUR GROUPS'}</Text>
        <View style={styles.chips}>
          {canInvite ? (
            <Pressable
              onPress={() => router.push('/(tabs)/settings?openInvite=1' as never)}
              accessibilityRole="button"
              testID="home-chama-invite"
              style={({ pressed }) => [styles.chip, { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="user-plus" size={13} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>Invite a member</Text>
            </Pressable>
          ) : null}
          {others.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => void open(group.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${group.isPrivate ? 'your Personal budget' : group.name}`}
              testID={`home-chama-open-${group.id}`}
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 }]}
            >
              {switchingTo === group.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={group.isPrivate ? 'user' : 'users'} size={13} color={colors.primary} />}
              <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>{group.isPrivate ? 'Personal budget' : `${group.emoji ? `${group.emoji} ` : ''}${group.name}`}</Text>
            </Pressable>
          ))}
          {canStartGroup ? (
            <Pressable
              onPress={() => router.push('/(tabs)/settings?openCreateGroup=1' as never)}
              accessibilityRole="button"
              testID="home-chama-new"
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, borderStyle: 'dashed', opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="plus" size={13} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.primary }]}>New group</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (dismissed || !canStartGroup) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="home-chama-offer">
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>In a chama? Run it on Jamvi</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Contributions, who has paid and what the group spent - one record every member sees. Groups cost nothing extra.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(tabs)/settings?openCreateGroup=1' as never)}
          accessibilityRole="button"
          testID="home-chama-start"
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Start a group</Text>
        </Pressable>
        <Pressable
          onPress={() => { setDismissed(true); void AsyncStorage.setItem(DISMISSED_KEY, 'yes').catch(() => {}); }}
          accessibilityRole="button"
          hitSlop={8}
          testID="home-chama-later"
        >
          <Text style={[styles.later, { color: colors.mutedForeground }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  primary: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  primaryText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  later: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
