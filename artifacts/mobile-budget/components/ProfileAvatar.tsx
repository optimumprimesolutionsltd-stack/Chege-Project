import React, { useEffect, useState } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { resolveAvatarProps, type AvatarUser } from '@/utils/avatarHelper';

export function ProfileAvatar({
  user,
  size = 40,
  backgroundColor,
  foregroundColor,
  style,
}: {
  user: AvatarUser | null | undefined;
  size?: number;
  backgroundColor: string;
  foregroundColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = user?.profileImageUrl ?? null;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const avatar = resolveAvatarProps(imageFailed ? { ...user, profileImageUrl: null } : user);
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  return (
    <View style={[frameStyle, style]}>
      {avatar.kind === 'image' ? (
        <Image
          source={{ uri: avatar.uri }}
          style={{ width: size, height: size }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={{ color: foregroundColor, fontSize: Math.max(14, size * 0.34), fontWeight: '700' }}>
          {avatar.text}
        </Text>
      )}
    </View>
  );
}