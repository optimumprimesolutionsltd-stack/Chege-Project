import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import {
  completeMobileBudgetChooser,
  switchMobileWorkspace,
} from '@/lib/workspace';
import { sharedGroupKindDetails } from '@/lib/groupKinds';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';

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
  const { data: workspaces = [], isLoading: loadingWorkspaces, error: workspaceError } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const [error, setError] = useState<string | null>(null);

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
      await finish();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this budget. Please try again.');
    }
  };
  const workspaceRow = (workspace: Workspace, personal = false) => {
    const selected = selectedWorkspace?.id === workspace.id;
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
      {personal ? (
        <View style={[styles.workspaceIcon, { backgroundColor: colors.accent }]}>
          <Feather name="lock" size={19} color={colors.accentForeground} />
        </View>
      ) : workspace.photoUrl ? (
        <Image
          source={{ uri: workspace.photoUrl }}
          accessibilityIgnoresInvertColors
          style={[styles.workspacePhoto, { borderColor: workspace.accentColor ?? colors.primary }]}
        />
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

  return (
    <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="layers" size={22} color={colors.primaryForeground} /></View>
        <Text style={[styles.eyebrow, { color: colors.brandTeal }]}>YOUR BUDGETS</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Choose where to work.</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Select a budget to open it.</Text>

        {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: colors.destructive + '14' }]}><Feather name="alert-circle" size={17} color={colors.destructive} /><Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text></View> : null}
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
              </> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>Choose a budget to see the next step.</Text>}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.brandTeal }]}>YOUR BUDGETS</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a budget</Text>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Click a budget to open it.</Text>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERSONAL BUDGET</Text>
            {privateWorkspace ? workspaceRow(privateWorkspace, true) : (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Your personal budget is being prepared. Try again in a moment.</Text>
            )}

            <View style={styles.sectionHead}><Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SHARED BUDGETS</Text></View>
            {sharedWorkspaces.length ? sharedWorkspaces.map((workspace) => workspaceRow(workspace)) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No shared budgets are available yet.</Text>}
            {workspaceError ? <Text style={[styles.errorText, { color: colors.destructive }]}>Could not load your budgets. Pull down or reopen the app to try again.</Text> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 20, gap: 12 }, mark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { fontSize: 27, fontWeight: '700' }, intro: { fontSize: 15, lineHeight: 22, marginBottom: 10 }, selectedPanel: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 8 }, selectedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, selectedIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, selectedLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, selectedTitle: { fontSize: 20, fontWeight: '700', marginTop: 3 }, selectedDetail: { fontSize: 13, lineHeight: 19, marginTop: 5 }, openButton: { minHeight: 50, borderRadius: 12, paddingHorizontal: 15, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, openButtonText: { fontSize: 15, fontWeight: '700' }, secondaryRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, secondaryAction: { minHeight: 42, borderWidth: 1, borderRadius: 11, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, secondaryText: { fontSize: 13, fontWeight: '600' }, sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: .9, marginTop: 8 }, sectionTitle: { fontSize: 23, fontWeight: '700', marginTop: -4 }, sectionDescription: { fontSize: 13, lineHeight: 19, marginTop: -5, marginBottom: 3 }, sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, workspace: { minHeight: 72, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed: { opacity: .72 }, workspaceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, workspacePhoto: { width: 40, height: 40, borderRadius: 12, borderWidth: 2 }, workspaceEmoji: { fontSize: 20 }, workspaceText: { flex: 1 }, workspaceTitle: { fontSize: 16, fontWeight: '600' }, workspaceDetail: { fontSize: 13, marginTop: 3 }, loader: { marginVertical: 22 }, empty: { fontSize: 14, lineHeight: 20, paddingVertical: 8 }, explanation: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14, marginTop: 12 }, explanationText: { flex: 1, fontSize: 13, lineHeight: 19 }, error: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10 }, errorText: { flex: 1, fontSize: 13, lineHeight: 18 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1, 28, 78, 0.48)' }, modal: { maxHeight: '88%', borderTopWidth: 1, borderRadius: 20, padding: 20, gap: 12 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { fontSize: 20, fontWeight: '700' }, modalCopy: { fontSize: 14, lineHeight: 20 }, input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, height: 48, fontSize: 16 }, kind: { borderWidth: 1, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, kindTitle: { fontSize: 14, fontWeight: '600' }, kindDescription: { fontSize: 12, lineHeight: 16, maxWidth: 265, marginTop: 2 }, primaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 4 }, primaryText: { fontSize: 16, fontWeight: '700' }, disabled: { opacity: .6 },
});