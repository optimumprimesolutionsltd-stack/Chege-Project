import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';

/**
 * "Signed in as … · Not you? Sign in with another account", on the screens a
 * new account starts on (the name, the setup questions, choosing a budget).
 *
 * Signing in with another account than the usual one - a different Google
 * email, say - makes a new, empty account, and these screens had no way back
 * out of it (5 Oct 2026). This signs out, and the sign-in screen follows.
 */
export function SwitchAccountLink({ color, testID = 'switch-account' }: { color: string; testID?: string }) {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const signOut = () => {
    Alert.alert(
      'Sign in with another account?',
      `${user?.email ? `You are signed in as ${user.email}. ` : ''}Jamvi signs you out of it here, and you can sign in the way you usually do. Nothing is deleted.`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Sign out',
          onPress: async () => {
            setLeaving(true);
            try {
              await logout();
              router.replace('/login' as never);
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ alignItems: 'center', gap: 2, paddingVertical: 10 }}>
      {user?.email ? (
        <Text style={{ color, fontSize: 12, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>Signed in as {user.email}</Text>
      ) : null}
      <Pressable onPress={signOut} disabled={leaving} hitSlop={10} accessibilityRole="button" testID={testID}>
        <Text style={{ color, fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
          {leaving ? 'Signing out…' : 'Not you? Sign in with another account'}
        </Text>
      </Pressable>
    </View>
  );
}
