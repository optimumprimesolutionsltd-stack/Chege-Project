import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/auth';
import { workspaceNameTextStyle } from '@/lib/workspaceIdentity';
import { workspaceIdentityPhotoUrl } from '@/utils/workspaceIdentityPhoto';

type WorkspaceIdentityGroup = {
  name?: string | null;
  emoji?: string | null;
  nameStyle?: 'plain' | 'italic' | 'bold' | 'serif';
  icon?: string | null;
  accentColor?: string | null;
  photoUrl?: string | null;
  isPrivate?: boolean | null;
};

export function WorkspaceIdentityRow({
  group,
  tone = 'dark',
  style,
}: {
  group: WorkspaceIdentityGroup | undefined;
  tone?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const { user } = useAuth();
  if (!group) return null;

  const isShared = group.isPrivate === false;
  const accentColor = group.accentColor ?? colors.brandTeal;
  const photoUrl = workspaceIdentityPhotoUrl(group, user);
  const icon = (
    {
      users: 'users',
      home: 'home',
      heart: 'heart',
      briefcase: 'briefcase',
      award: 'award',
      star: 'star',
    } as const
  )[group.icon ?? 'users'] ?? 'users';
  const name = group.name?.trim() || (isShared ? 'Shared budget' : 'Personal budget');
  const isDark = tone === 'dark';

  return (
    <View style={[styles.row, style]}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          accessibilityIgnoresInvertColors
          style={[styles.photo, { borderColor: accentColor }]}
        />
      ) : (
        <View style={[styles.icon, { backgroundColor: `${accentColor}25`, borderColor: `${accentColor}66` }]}>
          <Feather name={icon} size={15} color={accentColor} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: isDark ? '#A5B9D4' : colors.mutedForeground }]}>
          {isShared ? 'SHARED BUDGET' : 'PERSONAL BUDGET'}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            { color: isDark ? '#F4F8FF' : colors.foreground },
            workspaceNameTextStyle(group.nameStyle),
          ]}
        >
          {group.emoji ? `${group.emoji} ` : ''}{name}
        </Text>
      </View>
    </View>
  );
}

const styles = {
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 9,
    marginBottom: 12,
  },
  photo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  name: {
    fontSize: 15,
    marginTop: 2,
  },
};